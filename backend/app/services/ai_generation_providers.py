from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
import base64
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass
import logging
import mimetypes
from pathlib import Path
from threading import Lock
import tempfile
import time
from typing import Any

from gradio_client import Client, handle_file


DEFAULT_HUGGING_FACE_SPACE_ID = "yisol/IDM-VTON"
DEFAULT_HUGGING_FACE_API_NAME = "/tryon"
DEFAULT_FAL_MODEL_ID = "fal-ai/leffa/virtual-tryon"
DEFAULT_FAL_GARMENT_TYPE = "upper_body"
PROVIDER_OVERLOADED_MESSAGE = "Provider Overloaded"
logger = logging.getLogger("image-pipeline.vton.providers")


@dataclass(frozen=True)
class VTONGenerationResult:
  output_path: str
  provider_name: str
  masked_output_path: str | None = None


class AIGenerationError(RuntimeError):
  """Base error for AI generation provider failures."""


class ProviderOverloadedError(AIGenerationError):
  """Raised when the upstream provider is busy, queued, or timing out."""


class AIGenerationProvider(ABC):
  """Contract for pluggable AI generation providers."""

  @abstractmethod
  async def generate_vton(
    self,
    user_image_url: str,
    garment_image_url: str,
  ) -> VTONGenerationResult:
    """Generate a virtual try-on asset from the supplied public image URLs."""


class HuggingFaceVTONProvider(AIGenerationProvider):
  """Virtual try-on provider backed by a public Hugging Face Gradio Space."""

  def __init__(
    self,
    space_id: str = DEFAULT_HUGGING_FACE_SPACE_ID,
    api_name: str = DEFAULT_HUGGING_FACE_API_NAME,
    hf_token: str | None = None,
    garment_description: str = "",
    denoise_steps: int = 30,
    seed: int = 42,
    request_timeout_seconds: float = 180.0,
    connect_timeout_seconds: float = 30.0,
    poll_interval_seconds: float = 2.0,
    download_dir: str | None = None,
  ) -> None:
    self.space_id = (space_id or DEFAULT_HUGGING_FACE_SPACE_ID).strip() or DEFAULT_HUGGING_FACE_SPACE_ID
    self.api_name = (api_name or DEFAULT_HUGGING_FACE_API_NAME).strip() or DEFAULT_HUGGING_FACE_API_NAME
    self.hf_token = (hf_token or "").strip()
    self.garment_description = garment_description.strip()
    self.denoise_steps = denoise_steps
    self.seed = seed
    self.request_timeout_seconds = max(30.0, float(request_timeout_seconds))
    self.connect_timeout_seconds = max(5.0, float(connect_timeout_seconds))
    self.poll_interval_seconds = max(0.5, float(poll_interval_seconds))
    self.download_dir = download_dir or str(Path(tempfile.gettempdir()) / "renew-gradio")
    self.provider_name = f"huggingface:{self.space_id}"

    self._client: Client | None = None
    self._client_lock = Lock()

  async def generate_vton(
    self,
    user_image_url: str,
    garment_image_url: str,
  ) -> VTONGenerationResult:
    clean_user_image_url = (user_image_url or "").strip()
    clean_garment_image_url = (garment_image_url or "").strip()

    if not clean_user_image_url:
      raise ValueError("user_image_url is required.")
    if not clean_garment_image_url:
      raise ValueError("garment_image_url is required.")

    return await asyncio.to_thread(
      self._generate_vton_sync,
      clean_user_image_url,
      clean_garment_image_url,
    )

  def _generate_vton_sync(
    self,
    user_image_url: str,
    garment_image_url: str,
  ) -> VTONGenerationResult:
    client = self._get_client()
    job = None
    started_at = time.monotonic()
    last_status: tuple[str, Any, Any, Any] | None = None

    try:
      logger.info(
        "sending_request_to_huggingface provider=%s user_image_url=%s garment_image_url=%s",
        self.provider_name,
        user_image_url,
        garment_image_url,
      )
      job = client.submit(
        dict={
          "background": handle_file(user_image_url),
          "layers": [],
          "composite": None,
        },
        garm_img=handle_file(garment_image_url),
        garment_des=self.garment_description,
        is_checked=True,
        is_checked_crop=False,
        denoise_steps=self.denoise_steps,
        seed=self.seed,
        api_name=self.api_name,
      )
      logger.info("waiting_for_gradio_api provider=%s api_name=%s", self.provider_name, self.api_name)

      while not job.done():
        elapsed = time.monotonic() - started_at
        if elapsed >= self.request_timeout_seconds:
          self._cancel_job(job)
          logger.warning(
            "vton_generation_overloaded provider=%s reason=timeout elapsed=%.2f",
            self.provider_name,
            elapsed,
          )
          raise ProviderOverloadedError(PROVIDER_OVERLOADED_MESSAGE)

        status_snapshot = self._read_status(job)
        if status_snapshot is not None and status_snapshot != last_status:
          logger.info(
            "vton_job_status provider=%s code=%s rank=%s queue_size=%s eta=%s",
            self.provider_name,
            status_snapshot[0],
            status_snapshot[1],
            status_snapshot[2],
            status_snapshot[3],
          )
          last_status = status_snapshot

        time.sleep(self.poll_interval_seconds)

      remaining_timeout = max(1.0, self.request_timeout_seconds - (time.monotonic() - started_at))
      raw_result = job.result(timeout=remaining_timeout)
      return self._normalize_result(raw_result)
    except FutureTimeoutError as exc:
      self._cancel_job(job)
      logger.warning("vton_generation_overloaded provider=%s reason=future_timeout", self.provider_name)
      raise ProviderOverloadedError(PROVIDER_OVERLOADED_MESSAGE) from exc
    except ProviderOverloadedError:
      raise
    except Exception as exc:
      if self._is_provider_overloaded(exc):
        self._cancel_job(job)
        logger.warning(
          "vton_generation_overloaded provider=%s reason=%s",
          self.provider_name,
          exc,
        )
        raise ProviderOverloadedError(PROVIDER_OVERLOADED_MESSAGE) from exc

      logger.exception("vton_generation_failed provider=%s", self.provider_name)
      raise AIGenerationError(f"Hugging Face VTON request failed: {exc}") from exc

  def _get_client(self) -> Client:
    if self._client is not None:
      return self._client

    with self._client_lock:
      if self._client is None:
        self._client = self._build_client()

    return self._client

  def _build_client(self) -> Client:
    client_kwargs: dict[str, Any] = {
      "download_files": self.download_dir,
      "httpx_kwargs": {"timeout": self.connect_timeout_seconds},
    }
    if self.hf_token:
      client_kwargs["hf_token"] = self.hf_token

    try:
      return Client(self.space_id, **client_kwargs)
    except TypeError:
      if "hf_token" not in client_kwargs:
        raise

      fallback_kwargs = dict(client_kwargs)
      fallback_kwargs["token"] = fallback_kwargs.pop("hf_token")
      return Client(self.space_id, **fallback_kwargs)

  def _read_status(self, job: Any) -> tuple[str, Any, Any, Any] | None:
    try:
      status = job.status()
    except Exception:
      return None

    code = str(getattr(status, "code", "") or "").lower()
    rank = getattr(status, "rank", None)
    queue_size = getattr(status, "queue_size", None)
    eta = getattr(status, "eta", None)
    return (code, rank, queue_size, eta)

  def _normalize_result(self, raw_result: Any) -> VTONGenerationResult:
    output_path = None
    masked_output_path = None

    if isinstance(raw_result, dict):
      output_path = (
        self._extract_file_reference(raw_result.get("generated_images"))
        or self._extract_file_reference(raw_result.get("image"))
        or self._extract_file_reference(raw_result)
      )
      masked_output_path = self._extract_file_reference(raw_result.get("masked_image"))
    elif isinstance(raw_result, (list, tuple)):
      if raw_result:
        output_path = self._extract_file_reference(raw_result[0]) or self._extract_file_reference(raw_result)
      if len(raw_result) > 1:
        masked_output_path = self._extract_file_reference(raw_result[1])
    else:
      output_path = self._extract_file_reference(raw_result)

    if not output_path:
      raise AIGenerationError("Hugging Face VTON returned an unexpected response shape.")

    return VTONGenerationResult(
      output_path=output_path,
      provider_name=self.provider_name,
      masked_output_path=masked_output_path,
    )

  def _extract_file_reference(self, value: Any) -> str | None:
    if value is None:
      return None

    if isinstance(value, Path):
      return str(value)

    if isinstance(value, str):
      candidate = value.strip()
      return candidate if candidate and self._looks_like_file_reference(candidate) else None

    if isinstance(value, dict):
      for key in ("path", "url", "filepath", "name", "file", "image"):
        candidate = self._extract_file_reference(value.get(key))
        if candidate:
          return candidate

      for nested_value in value.values():
        candidate = self._extract_file_reference(nested_value)
        if candidate:
          return candidate

      return None

    if isinstance(value, (list, tuple)):
      for item in value:
        candidate = self._extract_file_reference(item)
        if candidate:
          return candidate

    return None

  def _looks_like_file_reference(self, value: str) -> bool:
    lowered = value.lower()
    if lowered.startswith(("http://", "https://", "file://")):
      return True
    if value.startswith(("/", ".\\", "./")):
      return True
    if len(value) > 2 and value[1:3] == ":\\":
      return True

    return lowered.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"))

  def _is_provider_overloaded(self, exc: Exception) -> bool:
    message = f"{type(exc).__name__}: {exc}".lower()
    overloaded_markers = (
      "queue",
      "overload",
      "busy",
      "too many requests",
      "rate limit",
      "429",
      "502",
      "503",
      "504",
      "timed out",
      "timeout",
      "temporarily unavailable",
      "space is building",
      "space is paused",
      "space is sleeping",
      "zero gpu",
      "connection errored out",
      "server disconnected",
    )
    return any(marker in message for marker in overloaded_markers)

  def _cancel_job(self, job: Any) -> None:
    if job is None:
      return

    cancel = getattr(job, "cancel", None)
    if callable(cancel):
      try:
        cancel()
      except Exception:
        logger.debug("vton_job_cancel_failed provider=%s", self.provider_name, exc_info=True)


class ReplicateVTONProvider(AIGenerationProvider):
  """Virtual try-on provider backed by Replicate."""

  def __init__(
    self,
    api_token: str,
    model_ref: str,
    user_image_input_name: str = "human_img",
    garment_image_input_name: str = "garm_img",
    garment_description_input_name: str = "garment_des",
    garment_description: str = "",
    extra_input: dict[str, Any] | None = None,
    wait_seconds: int = 60,
  ) -> None:
    self.api_token = (api_token or "").strip()
    self.model_ref = (model_ref or "").strip()
    self.user_image_input_name = (user_image_input_name or "human_img").strip()
    self.garment_image_input_name = (garment_image_input_name or "garm_img").strip()
    self.garment_description_input_name = (garment_description_input_name or "garment_des").strip()
    self.garment_description = garment_description.strip()
    self.extra_input = dict(extra_input or {})
    self.wait_seconds = max(1, min(int(wait_seconds), 60))
    self.provider_name = f"replicate:{self.model_ref or 'unconfigured'}"

  async def generate_vton(
    self,
    user_image_url: str,
    garment_image_url: str,
  ) -> VTONGenerationResult:
    clean_user_image_url = (user_image_url or "").strip()
    clean_garment_image_url = (garment_image_url or "").strip()

    if not clean_user_image_url:
      raise ValueError("user_image_url is required.")
    if not clean_garment_image_url:
      raise ValueError("garment_image_url is required.")
    if not self.api_token:
      raise AIGenerationError("REPLICATE_API_TOKEN is missing.")
    if not self.model_ref:
      raise AIGenerationError("REPLICATE_MODEL is missing.")

    return await asyncio.to_thread(
      self._generate_vton_sync,
      clean_user_image_url,
      clean_garment_image_url,
    )

  def _generate_vton_sync(
    self,
    user_image_url: str,
    garment_image_url: str,
  ) -> VTONGenerationResult:
    try:
      from replicate import Client
    except ImportError as exc:
      raise AIGenerationError("replicate package is not installed on the backend.") from exc

    client = Client(api_token=self.api_token)
    input_payload = dict(self.extra_input)
    input_payload[self.user_image_input_name] = self._coerce_file_input(user_image_url)
    input_payload[self.garment_image_input_name] = self._coerce_file_input(garment_image_url)

    if self.garment_description_input_name and self.garment_description_input_name not in input_payload:
      input_payload[self.garment_description_input_name] = self.garment_description

    try:
      logger.info(
        "sending_request_to_replicate provider=%s model=%s",
        self.provider_name,
        self.model_ref,
      )
      raw_output = client.run(
        self.model_ref,
        input=input_payload,
        wait=self.wait_seconds,
      )
      output_reference = self._extract_file_reference(raw_output)
      if not output_reference:
        raise AIGenerationError("Replicate VTON returned an unexpected response shape.")

      return VTONGenerationResult(
        output_path=output_reference,
        provider_name=self.provider_name,
        masked_output_path=None,
      )
    except Exception as exc:
      if self._is_provider_overloaded(exc):
        logger.warning(
          "vton_generation_overloaded provider=%s reason=%s",
          self.provider_name,
          exc,
        )
        raise ProviderOverloadedError(PROVIDER_OVERLOADED_MESSAGE) from exc

      logger.exception("vton_generation_failed provider=%s", self.provider_name)
      raise AIGenerationError(f"Replicate VTON request failed: {exc}") from exc

  def _coerce_file_input(self, reference: str) -> Any:
    path = Path(reference)
    if path.exists():
      return path
    return reference

  def _extract_file_reference(self, value: Any) -> str | None:
    if value is None:
      return None

    if isinstance(value, Path):
      return str(value)

    if isinstance(value, str):
      candidate = value.strip()
      return candidate if candidate and self._looks_like_file_reference(candidate) else None

    url_value = getattr(value, "url", None)
    if isinstance(url_value, str) and url_value.strip():
      return url_value.strip()

    if isinstance(value, dict):
      for key in ("path", "url", "filepath", "name", "file", "image"):
        candidate = self._extract_file_reference(value.get(key))
        if candidate:
          return candidate

      for nested_value in value.values():
        candidate = self._extract_file_reference(nested_value)
        if candidate:
          return candidate

      return None

    if isinstance(value, (list, tuple)):
      for item in value:
        candidate = self._extract_file_reference(item)
        if candidate:
          return candidate

    return None

  def _looks_like_file_reference(self, value: str) -> bool:
    lowered = value.lower()
    if lowered.startswith(("http://", "https://", "file://")):
      return True
    if value.startswith(("/", ".\\", "./")):
      return True
    if len(value) > 2 and value[1:3] == ":\\":
      return True

    return lowered.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"))

  def _is_provider_overloaded(self, exc: Exception) -> bool:
    message = f"{type(exc).__name__}: {exc}".lower()
    # NOTE: fal.ai returns "Internal Server Error" (no status code in the string),
    # so we must check the text, not just "500".
    overloaded_markers = (
      "rate limit",
      "429",
      "500",
      "502",
      "503",
      "504",
      "internal server error",
      "overloaded",
      "temporarily unavailable",
      "timeout",
      "timed out",
      "capacity",
      "too many requests",
      "service unavailable",
    )
    return any(marker in message for marker in overloaded_markers)


class FalVTONProvider(AIGenerationProvider):
  """Virtual try-on provider backed by fal.ai."""

  def __init__(
    self,
    api_key: str,
    model_id: str = DEFAULT_FAL_MODEL_ID,
    garment_type: str = DEFAULT_FAL_GARMENT_TYPE,
    num_inference_steps: int = 50,
    guidance_scale: float = 2.5,
    output_format: str = "png",
    enable_safety_checker: bool = True,
    client_timeout_seconds: float = 300.0,
    start_timeout_seconds: float = 90.0,
    remove_bg_api_key: str = "",
  ) -> None:
    self.api_key = (api_key or "").strip()
    self.model_id = (model_id or DEFAULT_FAL_MODEL_ID).strip() or DEFAULT_FAL_MODEL_ID
    self.garment_type = (garment_type or DEFAULT_FAL_GARMENT_TYPE).strip() or DEFAULT_FAL_GARMENT_TYPE
    self.num_inference_steps = max(1, int(num_inference_steps))
    self.guidance_scale = float(guidance_scale)
    self.output_format = (output_format or "png").strip().lower() or "png"
    self.enable_safety_checker = bool(enable_safety_checker)
    self.client_timeout_seconds = max(30.0, float(client_timeout_seconds))
    self.start_timeout_seconds = max(5.0, float(start_timeout_seconds))
    self.provider_name = f"fal:{self.model_id}"
    self.remove_bg_api_key = (remove_bg_api_key or "").strip()

  async def generate_vton(
    self,
    user_image_url: str,
    garment_image_url: str,
  ) -> VTONGenerationResult:
    clean_user_image_url = (user_image_url or "").strip()
    clean_garment_image_url = (garment_image_url or "").strip()

    if not clean_user_image_url:
      raise ValueError("user_image_url is required.")
    if not clean_garment_image_url:
      raise ValueError("garment_image_url is required.")
    if not self.api_key:
      raise AIGenerationError("FAL_KEY is missing.")

    return await asyncio.to_thread(
      self._generate_vton_sync,
      clean_user_image_url,
      clean_garment_image_url,
    )

  def _generate_vton_sync(
    self,
    user_image_url: str,
    garment_image_url: str,
  ) -> VTONGenerationResult:
    try:
      from fal_client import SyncClient
    except ImportError as exc:
      raise AIGenerationError("fal-client package is not installed on the backend.") from exc

    from .garment_preprocessor import GarmentPreprocessor

    client = SyncClient(key=self.api_key, default_timeout=self.client_timeout_seconds)

    # Auto-remove background from garment image before sending to leffa.
    # leffa returns 500 if garment has a scene background.
    garment_preprocessor = GarmentPreprocessor(remove_bg_api_key=self.remove_bg_api_key)
    garment_path = Path(garment_image_url)
    if garment_path.exists():
      resolved_garment_url = garment_preprocessor.preprocess_garment(garment_path, client)
    else:
      resolved_garment_url = self._coerce_image_input(client, garment_image_url)

    resolved_human_url = self._coerce_image_input(client, user_image_url)

    input_payload = {
      "human_image_url": resolved_human_url,
      "garment_image_url": resolved_garment_url,
      "garment_type": self.garment_type,
      "num_inference_steps": self.num_inference_steps,
      "guidance_scale": self.guidance_scale,
      "enable_safety_checker": self.enable_safety_checker,
      "output_format": self.output_format,
    }

    import time

    logger.info(
      "sending_request_to_fal provider=%s model=%s garment_type=%s human_url=%s garment_url=%s",
      self.provider_name,
      self.model_id,
      self.garment_type,
      resolved_human_url,
      resolved_garment_url,
    )

    try:
      # Submit job once — do NOT re-submit on result fetch failure (wastes money).
      handle = client.submit(
        self.model_id,
        arguments=input_payload,
      )
      logger.info("vton_job_submitted request_id=%s", handle.request_id)
    except Exception as exc:
      if self._is_provider_overloaded(exc):
        logger.warning("vton_submit_overloaded provider=%s reason=%s", self.provider_name, exc)
        raise ProviderOverloadedError(PROVIDER_OVERLOADED_MESSAGE) from exc
      logger.exception("vton_submit_failed provider=%s", self.provider_name)
      raise AIGenerationError(f"fal.ai VTON submit failed: {exc}") from exc

    # Poll until COMPLETED/FAILED (separate from result fetch so we don't re-submit).
    deadline = time.monotonic() + self.client_timeout_seconds
    while time.monotonic() < deadline:
      try:
        status_obj = handle.status(with_logs=True)
        status_str = getattr(status_obj, "status", str(status_obj))
        self._log_queue_update(status_obj)
        if status_str == "COMPLETED":
          break
        if status_str in ("FAILED", "CANCELLED"):
          raise AIGenerationError(f"fal.ai VTON job {status_str}: request_id={handle.request_id}")
      except AIGenerationError:
        raise
      except Exception as exc:
        logger.warning("vton_status_poll_error request_id=%s err=%s", handle.request_id, exc)
      time.sleep(3)
    else:
      raise ProviderOverloadedError(
        f"VTON job timed out after {self.client_timeout_seconds}s (request_id={handle.request_id})"
      )

    # Fetch result — retry up to 3 times WITHOUT re-submitting the job.
    last_exc: Exception | None = None
    for fetch_attempt in range(1, 4):
      try:
        raw_result = handle.get()
        break
      except Exception as exc:
        last_exc = exc
        logger.warning(
          "vton_result_fetch_failed attempt=%d/3 request_id=%s err=%s",
          fetch_attempt,
          handle.request_id,
          exc,
        )
        if fetch_attempt < 3:
          time.sleep(2)
    else:
      # All fetch attempts failed — job DID run but we can't get the result.
      # This is a fal.ai infrastructure glitch, not a user error.
      raise ProviderOverloadedError(
        f"fal.ai result fetch failed after 3 attempts (job COMPLETED, request_id={handle.request_id})"
      ) from last_exc

    output_reference = self._extract_file_reference(raw_result)
    if not output_reference:
      raise AIGenerationError(
        f"fal.ai VTON returned unexpected response shape (request_id={handle.request_id}): {raw_result!r}"
      )

    logger.info("vton_done request_id=%s url=%s", handle.request_id, output_reference)
    return VTONGenerationResult(
      output_path=output_reference,
      provider_name=self.provider_name,
      masked_output_path=None,
    )

  def _coerce_image_input(self, client: Any, reference: str) -> str:
    candidate_path = Path(reference)
    if candidate_path.exists():
      try:
        return str(client.upload_file(candidate_path))
      except Exception as exc:
        logger.warning(
          "fal_upload_file_failed provider=%s path=%s error=%s fallback=data_uri",
          self.provider_name,
          candidate_path,
          exc,
        )
        return self._file_to_data_uri(candidate_path)
    return reference

  def _file_to_data_uri(self, file_path: Path) -> str:
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(file_path.read_bytes()).decode("ascii")
    return f"data:{content_type};base64,{encoded}"

  def _log_queue_update(self, status: Any) -> None:
    status_name = str(getattr(status, "status", "") or type(status).__name__).upper()
    queue_position = getattr(status, "position", None)
    logs = getattr(status, "logs", None) or []
    latest_message = None
    if isinstance(logs, list) and logs:
      latest_log = logs[-1]
      if isinstance(latest_log, dict):
        latest_message = latest_log.get("message")
      else:
        latest_message = getattr(latest_log, "message", None) or str(latest_log)

    logger.info(
      "vton_job_status provider=%s status=%s queue_position=%s latest_log=%s",
      self.provider_name,
      status_name,
      queue_position,
      latest_message,
    )

  def _extract_file_reference(self, value: Any) -> str | None:
    if value is None:
      return None

    if isinstance(value, str):
      candidate = value.strip()
      return candidate if candidate and self._looks_like_file_reference(candidate) else None

    if isinstance(value, Path):
      return str(value)

    if isinstance(value, dict):
      for key in ("image", "url", "path", "file", "output", "result"):
        candidate = self._extract_file_reference(value.get(key))
        if candidate:
          return candidate

      for nested_value in value.values():
        candidate = self._extract_file_reference(nested_value)
        if candidate:
          return candidate

      return None

    if isinstance(value, (list, tuple)):
      for item in value:
        candidate = self._extract_file_reference(item)
        if candidate:
          return candidate

    url_value = getattr(value, "url", None)
    if isinstance(url_value, str) and url_value.strip():
      return url_value.strip()

    return None

  def _looks_like_file_reference(self, value: str) -> bool:
    lowered = value.lower()
    return lowered.startswith(("http://", "https://", "data:", "file://"))

  def _is_provider_overloaded(self, exc: Exception) -> bool:
    message = f"{type(exc).__name__}: {exc}".lower()
    # NOTE: fal.ai returns "Internal Server Error" (no status code in the string),
    # so we must check the text, not just "500".
    overloaded_markers = (
      "rate limit",
      "429",
      "500",
      "502",
      "503",
      "504",
      "internal server error",
      "overloaded",
      "capacity",
      "temporarily unavailable",
      "timed out",
      "timeout",
      "too many requests",
      "service unavailable",
    )
    return any(marker in message for marker in overloaded_markers)
