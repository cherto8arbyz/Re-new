from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.main as main_module
from app.auth import AuthenticatedUser, get_authenticated_user
from app.db import Base
from app.main import app
from app.services.ai_generation_providers import VTONGenerationResult
from app.services.daily_look_job_service import (
  DailyLookJobService,
  FACE_SWAP_RESULT_FETCH_RETRY_MESSAGE,
)
from app.services.fal_base_generation import BaseGenerationResult
from app.services.fal_face_swap import (
  FaceSwapResult,
  FaceSwapResultFetchTimeoutError,
  FaceSwapRemoteJobFailedError,
  FaceSwapSubmittedJobTimeoutError,
)
from app.services.full_pipeline_service import (
  FullLookPipelineRequest,
  FullLookPipelineService,
  PipelineGarment,
)
from app.services.local_storage_service import LocalStorageService
from app.services.user_profile_service import UserProfileService


def _make_session_factory(tmp_path: Path) -> sessionmaker:
  engine = create_engine(
    f"sqlite:///{(tmp_path / 'daily-look.db').as_posix()}",
    connect_args={"check_same_thread": False},
  )
  Base.metadata.create_all(bind=engine)
  return sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def _make_pipeline(
  final_output_reference: str,
  reference_face_urls: list[str] | None = None,
) -> FullLookPipelineService:
  prompt_builder = MagicMock()
  prompt_builder.build_prompt = AsyncMock(return_value="fashion prompt from gemini")

  base_gen = MagicMock()
  base_gen.generate = AsyncMock(
    return_value=BaseGenerationResult(image_url="https://cdn.example.com/base.png", provider_name="fal:base")
  )

  face_swap = MagicMock()
  face_swap.swap_face_with_references = AsyncMock(
    return_value=FaceSwapResult(image_url=final_output_reference, provider_name="fal:face")
  )

  vton = MagicMock()
  vton.generate_vton = AsyncMock(
    return_value=VTONGenerationResult(output_path="https://cdn.example.com/vton.png", provider_name="fal:vton")
  )

  upscale = MagicMock()

  return FullLookPipelineService(
    base_gen=base_gen,
    face_swap=face_swap,
    vton=vton,
    upscale=upscale,
    prompt_builder=prompt_builder,
    reference_face_url_resolver=lambda _user_id: list(reference_face_urls or []),
  )


def test_daily_pipeline_skips_vton_when_garments_are_empty() -> None:
  pipeline = _make_pipeline(
    final_output_reference="https://cdn.example.com/final.png",
    reference_face_urls=["https://cdn.example.com/reference-1.webp"],
  )

  result = asyncio.run(
    pipeline.generate_daily_look(
      FullLookPipelineRequest(
        user_id="user-123",
        gender="female",
        weather_context={"temperature_celsius": 11.0, "summary": "cloudy"},
        garments=[],
      )
    )
  )

  assert result.prompt == "fashion prompt from gemini"
  assert result.final_image_url == "https://cdn.example.com/final.png"
  pipeline._vton.generate_vton.assert_not_called()
  pipeline._face_swap.swap_face_with_references.assert_awaited_once()


def test_daily_look_job_completes_with_mocked_providers(tmp_path: Path) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  user_profile_service.replace_reference_face_urls("user-123", ["https://cdn.example.com/reference-1.webp"])

  provider_output = tmp_path / "provider-output.png"
  provider_output.write_bytes(b"fake-final-image")
  pipeline = _make_pipeline(final_output_reference=str(provider_output), reference_face_urls=None)
  pipeline._reference_face_url_resolver = user_profile_service.get_reference_face_urls
  job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=lambda: pipeline,
  )

  job = job_service.create_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    avatar_gender="male",
  )
  request = FullLookPipelineRequest(
    user_id="user-123",
    gender="male",
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    garments=[
      PipelineGarment(
        garment_id="garment-top-1",
        image_url="https://cdn.example.com/top.png",
        category="shirt",
        normalized_category="top",
        name="linen shirt",
        color="white",
      )
    ],
  )

  asyncio.run(job_service.process_job(job.id, request, "http://testserver"))

  stored_job = job_service.get_job(job.id)
  assert stored_job is not None
  assert stored_job.status == "completed"
  assert stored_job.avatar_gender == "male"
  assert stored_job.prompt == "fashion prompt from gemini"
  assert stored_job.final_image_url is not None
  assert stored_job.final_image_url.startswith("http://testserver/static/uploads/")
  assert stored_job.completed_at is not None
  pipeline._vton.generate_vton.assert_awaited_once()
  pipeline._face_swap.swap_face_with_references.assert_awaited_once()


def test_daily_look_generate_endpoint_returns_processing_job(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  test_daily_job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=lambda: _make_pipeline(final_output_reference="https://cdn.example.com/final.png"),
  )

  async def fake_process_job(job_id: str, request: FullLookPipelineRequest, public_base_url: str) -> None:
    await asyncio.sleep(0.25)

  monkeypatch.setattr(main_module, "daily_look_job_service", test_daily_job_service)
  monkeypatch.setattr(test_daily_job_service, "process_job", fake_process_job)
  app.dependency_overrides[get_authenticated_user] = lambda: AuthenticatedUser(
    user_id="user-456",
    access_token="header.payload.signature",
    claims={"sub": "user-456"},
  )

  with TestClient(app) as client:
    response = client.post(
      "/api/v1/daily-look/generate",
      headers={"Authorization": "Bearer header.payload.signature"},
      json={
        "gender": "female",
        "weather_context": {
          "temperature_celsius": 9,
          "summary": "light rain",
          "is_raining": True,
        },
        "available_garments": [
          {
            "garment_id": "coat-1",
            "image_url": "https://cdn.example.com/coat.png",
            "category": "outerwear",
            "name": "trench coat",
            "color": "camel",
          }
        ],
      },
    )

  app.dependency_overrides.clear()

  assert response.status_code == 200, response.text
  payload = response.json()
  assert payload["job_id"]
  assert payload["status"] == "processing"
  assert payload["selected_garment_ids"] == ["coat-1"]

  stored_job = test_daily_job_service.get_job(payload["job_id"])
  assert stored_job is not None
  assert stored_job.status == "processing"


def test_daily_look_generate_endpoint_reuses_existing_active_job(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  test_daily_job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=lambda: _make_pipeline(final_output_reference="https://cdn.example.com/final.png"),
  )

  existing_job = test_daily_job_service.create_job(
    user_id="user-456",
    selected_garment_ids=["coat-1"],
    weather_context={
      "temperature_celsius": 9.0,
      "condition": None,
      "summary": "light rain",
      "precipitation": None,
      "is_raining": True,
      "is_snowing": False,
      "location": None,
      "season": None,
    },
    avatar_gender="female",
  )
  process_job_mock = AsyncMock()

  monkeypatch.setattr(main_module, "daily_look_job_service", test_daily_job_service)
  monkeypatch.setattr(test_daily_job_service, "process_job", process_job_mock)
  app.dependency_overrides[get_authenticated_user] = lambda: AuthenticatedUser(
    user_id="user-456",
    access_token="header.payload.signature",
    claims={"sub": "user-456"},
  )

  with TestClient(app) as client:
    response = client.post(
      "/api/v1/daily-look/generate",
      headers={"Authorization": "Bearer header.payload.signature"},
      json={
        "gender": "female",
        "weather_context": {
          "temperature_celsius": 9,
          "summary": "light rain",
          "is_raining": True,
        },
        "available_garments": [
          {
            "garment_id": "coat-1",
            "image_url": "https://cdn.example.com/coat.png",
            "category": "outerwear",
            "name": "trench coat",
            "color": "camel",
          }
        ],
      },
    )

  app.dependency_overrides.clear()

  assert response.status_code == 200, response.text
  payload = response.json()
  assert payload["job_id"] == existing_job.id
  assert payload["status"] == "processing"
  assert payload["selected_garment_ids"] == ["coat-1"]
  process_job_mock.assert_not_awaited()


def test_daily_look_generate_endpoint_does_not_reuse_job_for_different_gender(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  test_daily_job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=lambda: _make_pipeline(final_output_reference="https://cdn.example.com/final.png"),
  )

  existing_job = test_daily_job_service.create_job(
    user_id="user-456",
    selected_garment_ids=["coat-1"],
    weather_context={
      "temperature_celsius": 9.0,
      "condition": None,
      "summary": "light rain",
      "precipitation": None,
      "is_raining": True,
      "is_snowing": False,
      "location": None,
      "season": None,
    },
    avatar_gender="female",
  )
  process_job_mock = AsyncMock()

  monkeypatch.setattr(main_module, "daily_look_job_service", test_daily_job_service)
  monkeypatch.setattr(test_daily_job_service, "process_job", process_job_mock)
  app.dependency_overrides[get_authenticated_user] = lambda: AuthenticatedUser(
    user_id="user-456",
    access_token="header.payload.signature",
    claims={"sub": "user-456"},
  )

  with TestClient(app) as client:
    response = client.post(
      "/api/v1/daily-look/generate",
      headers={"Authorization": "Bearer header.payload.signature"},
      json={
        "gender": "male",
        "weather_context": {
          "temperature_celsius": 9,
          "summary": "light rain",
          "is_raining": True,
        },
        "available_garments": [
          {
            "garment_id": "coat-1",
            "image_url": "https://cdn.example.com/coat.png",
            "category": "outerwear",
            "name": "trench coat",
            "color": "camel",
          }
        ],
      },
    )

  app.dependency_overrides.clear()

  assert response.status_code == 200, response.text
  payload = response.json()
  assert payload["job_id"] != existing_job.id
  assert payload["status"] == "processing"
  process_job_mock.assert_awaited_once()


def test_daily_look_job_resumes_face_swap_after_timeout_without_failing(tmp_path: Path) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=MagicMock(),
  )

  provider_output = tmp_path / "provider-output.png"
  provider_output.write_bytes(b"fake-final-image")

  pipeline = MagicMock(spec=FullLookPipelineService)

  async def fake_generate_daily_look(
    request: FullLookPipelineRequest,
    stage_callback,
  ):
    await stage_callback("face_swap", "fashion prompt from gemini")
    raise FaceSwapSubmittedJobTimeoutError(
      request_id="req-resume-123",
      message="Request req-resume-123 timed out after 600.0 seconds",
    )

  pipeline.generate_daily_look = fake_generate_daily_look
  pipeline.resume_submitted_face_swap_request = AsyncMock(
    return_value=FaceSwapResult(
      image_url=str(provider_output),
      provider_name="fal:face",
    )
  )
  job_service.pipeline_factory = lambda: pipeline

  job = job_service.create_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    avatar_gender="male",
  )
  request = FullLookPipelineRequest(
    user_id="user-123",
    gender="male",
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    garments=[],
  )

  asyncio.run(job_service.process_job(job.id, request, "http://testserver"))

  stored_job = job_service.get_job(job.id)
  assert stored_job is not None
  assert stored_job.status == "completed"
  assert stored_job.final_image_url is not None
  assert stored_job.final_image_url.startswith("http://testserver/static/uploads/")
  assert stored_job.prompt == "fashion prompt from gemini"
  pipeline.resume_submitted_face_swap_request.assert_awaited_once_with("req-resume-123")


def test_daily_look_job_can_resume_saved_face_swap_request_from_polling(tmp_path: Path) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=MagicMock(),
  )

  provider_output = tmp_path / "provider-output.png"
  provider_output.write_bytes(b"fake-final-image")

  job = job_service.create_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
  )
  job_service._update_job(
    job.id,
    status="face_swap",
    face_swap_request_id="req-face-123",
    prompt="fashion prompt from gemini",
  )

  pipeline = MagicMock(spec=FullLookPipelineService)
  pipeline.resume_submitted_face_swap_request = AsyncMock(
    return_value=FaceSwapResult(
      image_url=str(provider_output),
      provider_name="fal:face",
    )
  )
  job_service.pipeline_factory = lambda: pipeline

  async def run_resume() -> None:
    task = job_service.start_pending_face_swap_resume_task(job.id, "http://testserver")
    assert task is not None
    await task

  asyncio.run(run_resume())

  stored_job = job_service.get_job(job.id)
  assert stored_job is not None
  assert stored_job.status == "completed"
  assert stored_job.face_swap_request_id is None
  assert stored_job.final_image_url is not None
  assert stored_job.final_image_url.startswith("http://testserver/static/uploads/")
  pipeline.resume_submitted_face_swap_request.assert_awaited_once_with("req-face-123")


def test_daily_look_job_marks_completed_result_fetch_timeout_as_resumable_failed_state(tmp_path: Path) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=MagicMock(),
  )

  pipeline = MagicMock(spec=FullLookPipelineService)

  async def fake_generate_daily_look(
    request: FullLookPipelineRequest,
    stage_callback,
  ):
    await stage_callback("face_swap", "fashion prompt from gemini")
    raise FaceSwapResultFetchTimeoutError(
      request_id="req-fetch-timeout-123",
      attempts=3,
    )

  pipeline.generate_daily_look = fake_generate_daily_look
  job_service.pipeline_factory = lambda: pipeline

  job = job_service.create_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    avatar_gender="male",
  )
  request = FullLookPipelineRequest(
    user_id="user-123",
    gender="male",
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    garments=[],
  )

  asyncio.run(job_service.process_job(job.id, request, "http://testserver"))

  stored_job = job_service.get_job(job.id)
  assert stored_job is not None
  assert stored_job.status == "failed"
  assert stored_job.face_swap_request_id == "req-fetch-timeout-123"
  assert stored_job.error_message == FACE_SWAP_RESULT_FETCH_RETRY_MESSAGE
  assert stored_job.completed_at is not None

  reusable_job = job_service.find_reusable_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    avatar_gender="male",
  )
  assert reusable_job is not None
  assert reusable_job.id == job.id


def test_daily_look_job_can_resume_failed_result_fetch_timeout_from_polling(tmp_path: Path) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=MagicMock(),
  )

  provider_output = tmp_path / "provider-output.png"
  provider_output.write_bytes(b"fake-final-image")

  job = job_service.create_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
  )
  job_service._update_job(
    job.id,
    status="failed",
    error_message=FACE_SWAP_RESULT_FETCH_RETRY_MESSAGE,
    face_swap_request_id="req-fetch-timeout-123",
    prompt="fashion prompt from gemini",
    completed_at=datetime.now(timezone.utc),
  )

  pipeline = MagicMock(spec=FullLookPipelineService)
  pipeline.resume_submitted_face_swap_request = AsyncMock(
    return_value=FaceSwapResult(
      image_url=str(provider_output),
      provider_name="fal:face",
    )
  )
  job_service.pipeline_factory = lambda: pipeline

  async def run_resume() -> None:
    task = job_service.start_pending_face_swap_resume_task(job.id, "http://testserver")
    assert task is not None
    claimed_job = job_service.get_job(job.id)
    assert claimed_job is not None
    assert claimed_job.status == "face_swap"
    assert claimed_job.error_message is None
    await task

  asyncio.run(run_resume())

  stored_job = job_service.get_job(job.id)
  assert stored_job is not None
  assert stored_job.status == "completed"
  assert stored_job.face_swap_request_id is None
  assert stored_job.final_image_url is not None
  assert stored_job.final_image_url.startswith("http://testserver/static/uploads/")
  pipeline.resume_submitted_face_swap_request.assert_awaited_once_with("req-fetch-timeout-123")


def test_daily_look_job_marks_remote_face_swap_provider_failure_as_failed(tmp_path: Path) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=MagicMock(),
  )

  pipeline = MagicMock(spec=FullLookPipelineService)

  async def fake_generate_daily_look(
    request: FullLookPipelineRequest,
    stage_callback,
  ):
    await stage_callback("face_swap", "fashion prompt from gemini")
    raise FaceSwapRemoteJobFailedError(
      request_id="req-provider-failure-123",
      detail="User defined request timeout exceeded: Worker process",
      error_type="startup_timeout",
    )

  pipeline.generate_daily_look = fake_generate_daily_look
  job_service.pipeline_factory = lambda: pipeline

  job = job_service.create_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    avatar_gender="male",
  )
  request = FullLookPipelineRequest(
    user_id="user-123",
    gender="male",
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    garments=[],
  )

  asyncio.run(job_service.process_job(job.id, request, "http://testserver"))

  stored_job = job_service.get_job(job.id)
  assert stored_job is not None
  assert stored_job.status == "failed"
  assert stored_job.face_swap_request_id is None
  assert stored_job.error_message == (
    "Face swap provider timed out before producing the final image. This attempt cannot be resumed."
  )
  assert stored_job.completed_at is not None

  reusable_job = job_service.find_reusable_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
    avatar_gender="male",
  )
  assert reusable_job is None


def test_daily_look_job_keeps_recent_face_swap_without_request_id_active(tmp_path: Path) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=MagicMock(),
  )

  job = job_service.create_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
  )
  job_service._update_job(
    job.id,
    status="face_swap",
    face_swap_request_id=None,
  )

  stored_job = job_service.get_job(job.id)
  assert stored_job is not None
  assert stored_job.status == "face_swap"
  assert stored_job.error_message is None


def test_daily_look_job_marks_stale_face_swap_without_request_id_as_failed(tmp_path: Path) -> None:
  session_factory = _make_session_factory(tmp_path)
  storage_service = LocalStorageService(tmp_path / "uploads")
  user_profile_service = UserProfileService(session_factory)
  job_service = DailyLookJobService(
    session_factory=session_factory,
    storage_service=storage_service,
    user_profile_service=user_profile_service,
    pipeline_factory=MagicMock(),
  )

  job = job_service.create_job(
    user_id="user-123",
    selected_garment_ids=["garment-top-1"],
    weather_context={"temperature_celsius": 18.0, "summary": "clear"},
  )
  job_service._update_job(
    job.id,
    status="face_swap",
    face_swap_request_id=None,
    created_at=datetime.now(timezone.utc) - timedelta(hours=1),
  )

  stored_job = job_service.get_job(job.id)
  assert stored_job is not None
  assert stored_job.status == "failed"
  assert stored_job.error_message == "Face swap job lost its request handle. Start one new attempt."
