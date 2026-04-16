from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
import logging
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from ..models import DailyLookJob
from .fal_face_swap import (
  FaceSwapRemoteJobFailedError,
  FaceSwapResultFetchTimeoutError,
  FaceSwapSubmittedJobTimeoutError,
)
from .full_pipeline_service import FullLookPipelineRequest, FullLookPipelineResult, FullLookPipelineService
from .local_storage_service import LocalStorageService
from .user_profile_service import UserProfileService


logger = logging.getLogger("image-pipeline.daily-look.jobs")

JOB_STATUS_PROCESSING = "processing"
JOB_STATUS_GENERATING_BASE = "generating_base"
JOB_STATUS_VTON_ITERATING = "vton_iterating"
JOB_STATUS_FACE_SWAP = "face_swap"
JOB_STATUS_COMPLETED = "completed"
JOB_STATUS_FAILED = "failed"
ACTIVE_JOB_STATUSES = {
  JOB_STATUS_PROCESSING,
  JOB_STATUS_GENERATING_BASE,
  JOB_STATUS_VTON_ITERATING,
  JOB_STATUS_FACE_SWAP,
}
REUSABLE_JOB_STATUSES = ACTIVE_JOB_STATUSES | {JOB_STATUS_FAILED}
STALE_FACE_SWAP_JOB_MESSAGE = "Face swap job lost its request handle. Start one new attempt."
FACE_SWAP_RESULT_FETCH_RETRY_MESSAGE = (
  "fal.ai finished the face swap, but result download timed out. Check current job to resume without a new attempt."
)
STALE_FACE_SWAP_JOB_AGE = timedelta(minutes=30)


class DailyLookJobService:
  def __init__(
    self,
    session_factory: sessionmaker[Session],
    storage_service: LocalStorageService,
    user_profile_service: UserProfileService,
    pipeline_factory: Callable[[], FullLookPipelineService],
  ) -> None:
    self.session_factory = session_factory
    self.storage_service = storage_service
    self.user_profile_service = user_profile_service
    self.pipeline_factory = pipeline_factory
    self._face_swap_resume_jobs_in_flight: set[str] = set()

  def create_job(
    self,
    user_id: str,
    selected_garment_ids: list[str],
    weather_context: dict[str, Any],
    avatar_gender: str = "female",
  ) -> DailyLookJob:
    self.user_profile_service.ensure_profile(user_id)
    normalized_gender = _normalize_avatar_gender(avatar_gender)

    with self.session_factory() as db:
      job = DailyLookJob(
        user_id=user_id,
        status=JOB_STATUS_PROCESSING,
        avatar_gender=normalized_gender,
        selected_garment_ids=[str(item).strip() for item in selected_garment_ids if str(item).strip()],
        weather_context=dict(weather_context),
      )
      db.add(job)
      db.commit()
      db.refresh(job)
      return job

  def get_job(self, job_id: str) -> DailyLookJob | None:
    with self.session_factory() as db:
      job = db.get(DailyLookJob, job_id)
      if job is None:
        return None
      if self._is_unrecoverable_face_swap_job(job):
        job.status = JOB_STATUS_FAILED
        job.error_message = STALE_FACE_SWAP_JOB_MESSAGE
        job.completed_at = datetime.now(timezone.utc)
        db.add(job)
        db.commit()
        db.refresh(job)
      return job

  def find_reusable_job(
    self,
    user_id: str,
    selected_garment_ids: list[str],
    weather_context: dict[str, Any],
    avatar_gender: str = "female",
  ) -> DailyLookJob | None:
    normalized_ids = [str(item).strip() for item in selected_garment_ids if str(item).strip()]
    normalized_weather = dict(weather_context)
    normalized_gender = _normalize_avatar_gender(avatar_gender)

    with self.session_factory() as db:
      candidate_jobs = (
        db.query(DailyLookJob)
        .filter(
          DailyLookJob.user_id == user_id,
          DailyLookJob.status.in_(REUSABLE_JOB_STATUSES),
          DailyLookJob.avatar_gender == normalized_gender,
        )
        .order_by(DailyLookJob.created_at.desc())
        .limit(10)
        .all()
      )

      for job in candidate_jobs:
        if self._is_unrecoverable_face_swap_job(job):
          job.status = JOB_STATUS_FAILED
          job.error_message = STALE_FACE_SWAP_JOB_MESSAGE
          job.completed_at = datetime.now(timezone.utc)
          db.add(job)
          db.commit()
          continue
        if job.status == JOB_STATUS_FAILED and not self._is_resumable_face_swap_result_fetch_job(job):
          continue
        if list(job.selected_garment_ids or []) != normalized_ids:
          continue
        if dict(job.weather_context or {}) != normalized_weather:
          continue
        return job

    return None

  async def process_job(
    self,
    job_id: str,
    request: FullLookPipelineRequest,
    public_base_url: str,
  ) -> None:
    pipeline = self.pipeline_factory()
    try:
      async def handle_stage(status: str, prompt: str | None = None) -> None:
        updates: dict[str, Any] = {"status": status}
        if prompt is not None:
          updates["prompt"] = prompt
        self._update_job(job_id, **updates)

      result = await pipeline.generate_daily_look(request, stage_callback=handle_stage)
      await self._complete_job(
        job_id=job_id,
        final_image_reference=result.final_image_url,
        public_base_url=public_base_url,
        prompt=result.prompt,
      )
    except FaceSwapSubmittedJobTimeoutError as exc:
      logger.warning(
        "daily_look_job_face_swap_queued job_id=%s request_id=%s continuing_without_resubmit",
        job_id,
        exc.request_id,
      )
      self._update_job(
        job_id,
        status=JOB_STATUS_FACE_SWAP,
        error_message=None,
        face_swap_request_id=exc.request_id,
      )
      await self._resume_face_swap_job(
        job_id=job_id,
        request_id=exc.request_id,
        public_base_url=public_base_url,
      )
    except FaceSwapResultFetchTimeoutError as exc:
      logger.warning(
        "daily_look_job_face_swap_result_fetch_timed_out job_id=%s request_id=%s",
        job_id,
        exc.request_id,
      )
      self._mark_face_swap_result_fetch_retryable(
        job_id=job_id,
        request_id=exc.request_id,
      )
    except FaceSwapRemoteJobFailedError as exc:
      logger.warning(
        "daily_look_job_face_swap_provider_failed job_id=%s request_id=%s error_type=%s",
        job_id,
        exc.request_id,
        exc.error_type,
      )
      self._update_job(
        job_id,
        status=JOB_STATUS_FAILED,
        error_message=str(exc),
        face_swap_request_id=None,
        completed_at=datetime.now(timezone.utc),
      )
    except Exception as exc:
      self._update_job(
        job_id,
        status=JOB_STATUS_FAILED,
        error_message=str(exc),
        face_swap_request_id=None,
        completed_at=datetime.now(timezone.utc),
      )
      logger.exception("daily_look_job_failed job_id=%s", job_id)

  def start_pending_face_swap_resume_task(
    self,
    job_id: str,
    public_base_url: str,
  ) -> asyncio.Task[None] | None:
    if job_id in self._face_swap_resume_jobs_in_flight:
      return None
    request_id = self._claim_pending_face_swap_request_id(job_id)
    if not request_id:
      return None
    self._face_swap_resume_jobs_in_flight.add(job_id)
    return asyncio.create_task(
      self._resume_face_swap_job(
        job_id=job_id,
        request_id=request_id,
        public_base_url=public_base_url,
        already_claimed=True,
      )
    )

  async def _resume_face_swap_job(
    self,
    job_id: str,
    request_id: str,
    public_base_url: str,
    already_claimed: bool = False,
  ) -> None:
    if not already_claimed and not self._try_claim_face_swap_resume(job_id):
      return

    try:
      pipeline = self.pipeline_factory()
      await self._resume_face_swap_until_done(
        job_id=job_id,
        request_id=request_id,
        pipeline=pipeline,
        public_base_url=public_base_url,
      )
    except FaceSwapRemoteJobFailedError as exc:
      self._update_job(
        job_id,
        status=JOB_STATUS_FAILED,
        error_message=str(exc),
        face_swap_request_id=None,
        completed_at=datetime.now(timezone.utc),
      )
      logger.warning(
        "daily_look_job_face_swap_resume_provider_failed job_id=%s request_id=%s error_type=%s",
        job_id,
        exc.request_id,
        exc.error_type,
      )
    except Exception as exc:
      self._update_job(
        job_id,
        status=JOB_STATUS_FAILED,
        error_message=str(exc),
        face_swap_request_id=None,
        completed_at=datetime.now(timezone.utc),
      )
      logger.exception("daily_look_job_face_swap_resume_failed job_id=%s", job_id)
    finally:
      self._face_swap_resume_jobs_in_flight.discard(job_id)

  async def _resume_face_swap_until_done(
    self,
    job_id: str,
    request_id: str,
    pipeline: FullLookPipelineService,
    public_base_url: str,
  ) -> None:
    active_request_id = request_id
    while True:
      try:
        self._update_job(
          job_id,
          status=JOB_STATUS_FACE_SWAP,
          error_message=None,
          face_swap_request_id=active_request_id,
        )
        face_result = await pipeline.resume_submitted_face_swap_request(active_request_id)
        await self._complete_job(
          job_id=job_id,
          final_image_reference=face_result.image_url,
          public_base_url=public_base_url,
          prompt=None,
        )
        return
      except FaceSwapSubmittedJobTimeoutError as exc:
        active_request_id = exc.request_id
        logger.warning(
          "daily_look_job_face_swap_still_queued job_id=%s request_id=%s",
          job_id,
          active_request_id,
        )
        self._update_job(
          job_id,
          status=JOB_STATUS_FACE_SWAP,
          error_message=None,
          face_swap_request_id=active_request_id,
        )
        await asyncio.sleep(5)
      except FaceSwapResultFetchTimeoutError as exc:
        logger.warning(
          "daily_look_job_face_swap_result_fetch_timed_out job_id=%s request_id=%s",
          job_id,
          exc.request_id,
        )
        self._mark_face_swap_result_fetch_retryable(
          job_id=job_id,
          request_id=exc.request_id,
        )
        return

  async def _complete_job(
    self,
    job_id: str,
    final_image_reference: str,
    public_base_url: str,
    prompt: str | None,
  ) -> None:
    stored_asset = await asyncio.to_thread(
      self.storage_service.save_generated_asset,
      final_image_reference,
      job_id,
      public_base_url,
    )
    updates: dict[str, Any] = {
      "status": JOB_STATUS_COMPLETED,
      "final_image_url": stored_asset.public_url,
      "error_message": None,
      "face_swap_request_id": None,
      "completed_at": datetime.now(timezone.utc),
    }
    if prompt is not None:
      updates["prompt"] = prompt
    self._update_job(job_id, **updates)
    logger.info("daily_look_job_completed job_id=%s result_url=%s", job_id, stored_asset.public_url)

  def _update_job(self, job_id: str, **updates: Any) -> bool:
    with self.session_factory() as db:
      job = db.get(DailyLookJob, job_id)
      if job is None:
        return False

      for key, value in updates.items():
        setattr(job, key, value)

      db.add(job)
      db.commit()
      return True

  def _claim_pending_face_swap_request_id(self, job_id: str) -> str | None:
    with self.session_factory() as db:
      job = db.get(DailyLookJob, job_id)
      if job is None:
        return None
      if job.final_image_url:
        return None
      request_id = str(job.face_swap_request_id or "").strip()
      if not request_id:
        return None
      if job.status == JOB_STATUS_FACE_SWAP:
        return request_id
      if not self._is_resumable_face_swap_result_fetch_job(job):
        return None

      job.status = JOB_STATUS_FACE_SWAP
      job.error_message = None
      job.completed_at = None
      db.add(job)
      db.commit()
      return request_id

  def _try_claim_face_swap_resume(self, job_id: str) -> bool:
    if job_id in self._face_swap_resume_jobs_in_flight:
      return False
    self._face_swap_resume_jobs_in_flight.add(job_id)
    return True

  def _is_unrecoverable_face_swap_job(self, job: DailyLookJob) -> bool:
    created_at = job.created_at
    if created_at is None:
      return False

    age = datetime.now(timezone.utc) - _ensure_utc_datetime(created_at)
    return (
      job.status == JOB_STATUS_FACE_SWAP
      and not str(job.face_swap_request_id or "").strip()
      and not str(job.final_image_url or "").strip()
      and age >= STALE_FACE_SWAP_JOB_AGE
    )

  def _is_resumable_face_swap_result_fetch_job(self, job: DailyLookJob) -> bool:
    return (
      job.status == JOB_STATUS_FAILED
      and str(job.error_message or "").strip() == FACE_SWAP_RESULT_FETCH_RETRY_MESSAGE
      and bool(str(job.face_swap_request_id or "").strip())
      and not str(job.final_image_url or "").strip()
    )

  def _mark_face_swap_result_fetch_retryable(
    self,
    job_id: str,
    request_id: str,
  ) -> None:
    self._update_job(
      job_id,
      status=JOB_STATUS_FAILED,
      error_message=FACE_SWAP_RESULT_FETCH_RETRY_MESSAGE,
      face_swap_request_id=request_id,
      completed_at=datetime.now(timezone.utc),
    )


def _ensure_utc_datetime(value: datetime) -> datetime:
  if value.tzinfo is None:
    return value.replace(tzinfo=timezone.utc)
  return value.astimezone(timezone.utc)


def _normalize_avatar_gender(value: str | None) -> str:
  return "male" if str(value or "").strip().lower() == "male" else "female"
