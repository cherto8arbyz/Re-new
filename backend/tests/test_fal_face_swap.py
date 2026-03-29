from __future__ import annotations

import asyncio
from itertools import chain, repeat
from types import SimpleNamespace

import pytest

from app.services.fal_face_swap import FalFaceSwapProvider, FaceSwapSubmittedJobTimeoutError


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
