from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from ..models import GenerationJob
from .ai_generation_providers import AIGenerationProvider, ProviderOverloadedError
from .local_storage_service import LocalStorageService


logger = logging.getLogger("image-pipeline.vton.jobs")

JOB_STATUS_PENDING = "pending"
JOB_STATUS_PROCESSING = "processing"
JOB_STATUS_COMPLETED = "completed"
JOB_STATUS_FAILED = "failed"


class VTONJobService:
  def __init__(
    self,
    session_factory: sessionmaker[Session],
    storage_service: LocalStorageService,
    provider_factory: Callable[[], AIGenerationProvider],
  ) -> None:
    self.session_factory = session_factory
    self.storage_service = storage_service
    self.provider_factory = provider_factory

  def create_job(self) -> GenerationJob:
    with self.session_factory() as db:
      job = GenerationJob(status=JOB_STATUS_PENDING)
      db.add(job)
      db.commit()
      db.refresh(job)
      return job

  def get_job(self, job_id: str) -> GenerationJob | None:
    with self.session_factory() as db:
      return db.get(GenerationJob, job_id)

  async def process_job(
    self,
    job_id: str,
    user_image_url: str,
    garment_image_url: str,
    public_base_url: str,
  ) -> None:
    if not self._update_job(job_id, status=JOB_STATUS_PROCESSING, error_message=None, result_url=None):
      logger.warning("vton_job_missing job_id=%s", job_id)
      return

    try:
      resolved_user_image_reference = self.storage_service.resolve_provider_input_reference(user_image_url)
      resolved_garment_image_reference = self.storage_service.resolve_provider_input_reference(garment_image_url)
      logger.info("vton_job_started job_id=%s user_image_url=%s garment_image_url=%s", job_id, user_image_url, garment_image_url)
      provider = self.provider_factory()
      result = await provider.generate_vton(
        user_image_url=resolved_user_image_reference,
        garment_image_url=resolved_garment_image_reference,
      )
      stored_asset = await asyncio.to_thread(
        self.storage_service.save_generated_asset,
        result.output_path,
        job_id,
        public_base_url,
      )
      self._update_job(
        job_id,
        status=JOB_STATUS_COMPLETED,
        result_url=stored_asset.public_url,
        error_message=None,
      )
      logger.info("vton_job_completed job_id=%s result_url=%s", job_id, stored_asset.public_url)
    except ProviderOverloadedError as exc:
      self._update_job(
        job_id,
        status=JOB_STATUS_FAILED,
        result_url=None,
        error_message=str(exc),
      )
      logger.warning("vton_job_failed job_id=%s error=%s", job_id, exc)
    except Exception as exc:
      self._update_job(
        job_id,
        status=JOB_STATUS_FAILED,
        result_url=None,
        error_message=str(exc),
      )
      logger.exception("vton_job_failed job_id=%s", job_id)

  def _update_job(
    self,
    job_id: str,
    **updates: Any,
  ) -> bool:
    with self.session_factory() as db:
      job = db.get(GenerationJob, job_id)
      if job is None:
        return False

      for key, value in updates.items():
        setattr(job, key, value)

      db.add(job)
      db.commit()
      return True
