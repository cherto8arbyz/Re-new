from __future__ import annotations

import asyncio
from itertools import chain, repeat
from types import SimpleNamespace

import pytest

from app.services.fal_face_swap import (
  FalFaceSwapProvider,
  FaceSwapResultFetchTimeoutError,
  FaceSwapRemoteJobFailedError,
  FaceSwapSubmittedJobTimeoutError,
)


class _FakeStatus:
  def __init__(self, status: str) -> None:
    self.status = status
    self.position = None


class _FakeHandle:
  def __init__(self, request_id: str, statuses: list[str], result_payload: object) -> None:
    self.request_id = request_id
    self._statuses = list(statuses)
    self._result_payload = result_payload

  def status(self, with_logs: bool = False) -> _FakeStatus:
    if self._statuses:
      current = self._statuses.pop(0)
    else:
      current = "COMPLETED"
    return _FakeStatus(current)

  def get(self) -> object:
    return self._result_payload


class _FakeSyncClient:
  submit_calls = 0
  handle: _FakeHandle | None = None

  def __init__(self, key: str, default_timeout: float) -> None:
    self.key = key
    self.default_timeout = default_timeout

  def submit(self, model_id: str, arguments: dict[str, object]) -> _FakeHandle:
    type(self).submit_calls += 1
    assert self.handle is not None
    return self.handle


def test_face_swap_submits_once_and_polls_until_completed(monkeypatch: pytest.MonkeyPatch) -> None:
  _FakeSyncClient.submit_calls = 0
  _FakeSyncClient.handle = _FakeHandle(
    request_id="req-123",
    statuses=["IN_PROGRESS", "IN_PROGRESS", "COMPLETED"],
    result_payload={"image": {"url": "https://cdn.example.com/swapped.png"}},
  )

  monkeypatch.setitem(__import__("sys").modules, "fal_client", SimpleNamespace(SyncClient=_FakeSyncClient))
  monkeypatch.setattr("app.services.fal_face_swap.time.sleep", lambda _: None)

  provider = FalFaceSwapProvider(api_key="fal-key", client_timeout_seconds=300.0)
  result = asyncio.run(
    provider.swap_face(
      base_image_url="https://cdn.example.com/base.png",
      face_image_url="https://cdn.example.com/face.png",
    )
  )

  assert result.image_url == "https://cdn.example.com/swapped.png"
  assert _FakeSyncClient.submit_calls == 1


def test_face_swap_timeout_marks_error_as_non_retryable(monkeypatch: pytest.MonkeyPatch) -> None:
  _FakeSyncClient.submit_calls = 0
  _FakeSyncClient.handle = _FakeHandle(
    request_id="req-timeout",
    statuses=["IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS"],
    result_payload={},
  )

  monotonic_values = chain([0.0, 0.0, 31.0, 31.0], repeat(31.0))
  monkeypatch.setitem(__import__("sys").modules, "fal_client", SimpleNamespace(SyncClient=_FakeSyncClient))
  monkeypatch.setattr("app.services.fal_face_swap.time.sleep", lambda _: None)
  monkeypatch.setattr(
    "app.services.fal_face_swap.time.monotonic",
    lambda: next(monotonic_values),
  )

  provider = FalFaceSwapProvider(api_key="fal-key", client_timeout_seconds=30.0)

  with pytest.raises(FaceSwapSubmittedJobTimeoutError) as exc_info:
    asyncio.run(
      provider.swap_face(
        base_image_url="https://cdn.example.com/base.png",
        face_image_url="https://cdn.example.com/face.png",
      )
    )

  assert "req-timeout" in str(exc_info.value)
  assert getattr(exc_info.value, "retry_allowed", True) is False
  assert _FakeSyncClient.submit_calls == 1


def test_face_swap_accepts_completed_status_object_without_status_attr() -> None:
  class _CompletedWithoutStatus:
    position = None

    def __str__(self) -> str:
      return "Completed(logs=None, metrics={'INFERENCE_TIME': 14.6})"

  class _Handle:
    request_id = "req-completed"

    def status(self, with_logs: bool = False) -> object:
      return _CompletedWithoutStatus()

    def get(self) -> object:
      return {"image": {"url": "https://cdn.example.com/swapped.png"}}

  provider = FalFaceSwapProvider(api_key="fal-key", client_timeout_seconds=30.0)
  result = provider._complete_from_handle(_Handle())

  assert result.image_url == "https://cdn.example.com/swapped.png"


def test_face_swap_queue_timeout_uses_start_timeout_before_client_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
  _FakeSyncClient.submit_calls = 0
  _FakeSyncClient.handle = _FakeHandle(
    request_id="req-queued",
    statuses=["IN_QUEUE", "IN_QUEUE", "IN_QUEUE"],
    result_payload={},
  )

  monotonic_values = chain([0.0, 0.0, 0.0, 91.0, 91.0], repeat(91.0))
  monkeypatch.setitem(__import__("sys").modules, "fal_client", SimpleNamespace(SyncClient=_FakeSyncClient))
  monkeypatch.setattr("app.services.fal_face_swap.time.sleep", lambda _: None)
  monkeypatch.setattr(
    "app.services.fal_face_swap.time.monotonic",
    lambda: next(monotonic_values),
  )

  provider = FalFaceSwapProvider(
    api_key="fal-key",
    client_timeout_seconds=300.0,
    start_timeout_seconds=90.0,
  )

  with pytest.raises(FaceSwapSubmittedJobTimeoutError) as exc_info:
    asyncio.run(
      provider.swap_face(
        base_image_url="https://cdn.example.com/base.png",
        face_image_url="https://cdn.example.com/face.png",
      )
    )

  assert "req-queued" in str(exc_info.value)
  assert "90.0 seconds waiting to start" in str(exc_info.value)
  assert getattr(exc_info.value, "retry_allowed", True) is False
  assert _FakeSyncClient.submit_calls == 1


def test_face_swap_completed_result_fetch_timeout_raises_distinct_error(monkeypatch: pytest.MonkeyPatch) -> None:
  class _CompletedHandle:
    request_id = "req-fetch-timeout"

    def status(self, with_logs: bool = False) -> _FakeStatus:
      return _FakeStatus("COMPLETED")

    def get(self) -> object:
      raise TimeoutError("Request timed out")

  monkeypatch.setattr("app.services.fal_face_swap.time.sleep", lambda _: None)

  provider = FalFaceSwapProvider(api_key="fal-key", client_timeout_seconds=30.0)

  with pytest.raises(FaceSwapResultFetchTimeoutError) as exc_info:
    provider._complete_from_handle(_CompletedHandle())

  assert exc_info.value.request_id == "req-fetch-timeout"
  assert exc_info.value.attempts == 3
  assert getattr(exc_info.value, "retry_allowed", True) is False


def test_face_swap_completed_status_with_remote_error_fails_without_result_fetch(monkeypatch: pytest.MonkeyPatch) -> None:
  class _Response:
    def raise_for_status(self) -> None:
      return None

    def json(self) -> object:
      return {
        "status": "COMPLETED",
        "queue_position": None,
        "error": "User defined request timeout exceeded: Worker process",
        "error_type": "startup_timeout",
      }

  class _Client:
    def get(self, url: str, params: dict[str, object] | None = None) -> _Response:
      return _Response()

  class _Handle:
    request_id = "req-status-error"
    status_url = "https://queue.fal.run/fal-ai/face-swap/requests/req-status-error/status"
    client = _Client()

    def get(self) -> object:
      raise AssertionError("result fetch should not run after remote error was reported in status payload")

  monkeypatch.setattr("app.services.fal_face_swap.time.sleep", lambda _: None)

  provider = FalFaceSwapProvider(api_key="fal-key", client_timeout_seconds=30.0)

  with pytest.raises(FaceSwapRemoteJobFailedError) as exc_info:
    provider._complete_from_handle(_Handle())

  assert exc_info.value.request_id == "req-status-error"
  assert exc_info.value.error_type == "startup_timeout"
  assert "cannot be resumed" in str(exc_info.value).lower()
