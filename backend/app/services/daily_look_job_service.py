from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, timezone
import logging
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from ..models import DailyLookJob
from .fal_face_swap import FaceSwapSubmittedJobTimeoutError
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

  def create_job(
    self,
    user_id: str,
    selected_garment_ids: list[str],
    weather_context: dict[str, Any],
  ) -> DailyLookJob:
    self.user_profile_service.ensure_profile(user_id)

    with self.session_factory() as db:
      job = DailyLookJob(
        user_id=user_id,
        status=JOB_STATUS_PROCESSING,
        selected_garment_ids=[str(item).strip() for item in selected_garment_ids if str(item).strip()],
        weather_context=dict(weather_context),
      )
      db.add(job)
      db.commit()
      db.refresh(job)
      return job

  def get_job(self, job_id: str) -> DailyLookJob | None:
    with self.session_factory() as db:
      return db.get(DailyLookJob, job_id)

  def find_reusable_job(
    self,
    user_id: str,
    selected_garment_ids: list[str],
    weather_context: dict[str, Any],
  ) -> DailyLookJob | None:
    normalized_ids = [str(item).strip() for item in selected_garment_ids if str(item).strip()]
    normalized_weather = dict(weather_context)

    with self.session_factory() as db:
      candidate_jobs = (
        db.query(DailyLookJob)
        .filter(
          DailyLookJob.user_id == user_id,
          DailyLookJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .order_by(DailyLookJob.created_at.desc())
        .limit(10)
        .all()
      )

      for job in candidate_jobs:
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
      self._update_job(job_id, status=JOB_STATUS_FACE_SWAP, error_message=None)
      await self._resume_face_swap_until_done(
        job_id=job_id,
        request_id=exc.request_id,
        pipeline=pipeline,
        public_base_url=public_base_url,
      )
    except Exception as exc:
      self._update_job(
        job_id,
        status=JOB_STATUS_FAILED,
        error_message=str(exc),
        completed_at=datetime.now(timezone.utc),
      )
      logger.exception("daily_look_job_failed job_id=%s", job_id)

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
        self._update_job(job_id, status=JOB_STATUS_FACE_SWAP, error_message=None)
        await asyncio.sleep(5)

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
