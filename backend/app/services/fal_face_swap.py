"""Step 2 of the look generation pipeline: face swap via fal-ai/face-swap."""
from __future__ import annotations

import asyncio
import base64
import logging
import mimetypes
from dataclasses import dataclass
from pathlib import Path
import time
from typing import Any

logger = logging.getLogger("image-pipeline.pipeline.step2")

DEFAULT_FACE_SWAP_MODEL_ID = "fal-ai/face-swap"


@dataclass(frozen=True)
class FaceSwapResult:
    image_url: str
    provider_name: str


class FaceSwapSubmittedJobTimeoutError(RuntimeError):
    def __init__(self, request_id: str, message: str) -> None:
        super().__init__(message)
        self.request_id = request_id
        self.retry_allowed = False


class FalFaceSwapProvider:
    """Replaces the face on a base image with the user's face (Step 2)."""

    def __init__(
        self,
        api_key: str,
        model_id: str = DEFAULT_FACE_SWAP_MODEL_ID,
        client_timeout_seconds: float = 300.0,
        start_timeout_seconds: float = 90.0,
    ) -> None:
        self.api_key = (api_key or "").strip()
        self.model_id = (model_id or DEFAULT_FACE_SWAP_MODEL_ID).strip() or DEFAULT_FACE_SWAP_MODEL_ID
        self.client_timeout_seconds = max(30.0, float(client_timeout_seconds))
        self.start_timeout_seconds = max(5.0, float(start_timeout_seconds))
        self.provider_name = f"fal:{self.model_id}"

    async def swap_face(
        self,
        base_image_url: str,
        face_image_url: str,
    ) -> FaceSwapResult:
        if not self.api_key:
            raise RuntimeError("FAL_KEY is missing.")
        if not base_image_url.strip():
            raise ValueError("base_image_url is required.")
        if not face_image_url.strip():
            raise ValueError("face_image_url is required.")
        return await asyncio.to_thread(self._swap_sync, base_image_url.strip(), face_image_url.strip())

    async def swap_face_with_references(
        self,
        base_image_url: str,
        face_image_urls: list[str],
    ) -> FaceSwapResult:
        clean_references = [str(reference).strip() for reference in face_image_urls if str(reference).strip()]
        if not clean_references:
            raise ValueError("At least one face reference image is required.")

        # Current configured fal face-swap model accepts one source face.
        # Keep the multi-reference contract at the pipeline boundary so a stronger provider
        # can replace this implementation without changing the orchestration layer.
        return await self.swap_face(
            base_image_url=base_image_url,
            face_image_url=clean_references[0],
        )

    async def resume_face_swap_request(self, request_id: str) -> FaceSwapResult:
        clean_request_id = str(request_id or "").strip()
        if not clean_request_id:
            raise ValueError("request_id is required.")
        if not self.api_key:
            raise RuntimeError("FAL_KEY is missing.")
        return await asyncio.to_thread(self._resume_sync, clean_request_id)

    def _swap_sync(self, base_image_url: str, face_image_url: str) -> FaceSwapResult:
        try:
            from fal_client import SyncClient
        except ImportError as exc:
            raise RuntimeError("fal-client package is not installed.") from exc

        client = SyncClient(key=self.api_key, default_timeout=self.client_timeout_seconds)
        # fal-ai/face-swap input schema:
        # base_image_url  – target image (body/mannequin)
        # swap_image_url  – source image (user face)
        payload = {
            "base_image_url": self._coerce_image_input(client, base_image_url),
            "swap_image_url": self._coerce_image_input(client, face_image_url),
        }

        logger.info(
            "face_swap_start provider=%s base=%s face=%s",
            self.provider_name,
            base_image_url,
            face_image_url,
        )
        try:
            handle = client.submit(
                self.model_id,
                arguments=payload,
            )
        except Exception as exc:
            logger.exception("face_swap_submit_failed provider=%s", self.provider_name)
            raise RuntimeError(f"fal face swap submit failed: {exc}") from exc

        logger.info("face_swap_submitted provider=%s request_id=%s", self.provider_name, handle.request_id)
        return self._complete_from_handle(handle)

    def _resume_sync(self, request_id: str) -> FaceSwapResult:
        try:
            from fal_client import SyncClient
        except ImportError as exc:
            raise RuntimeError("fal-client package is not installed.") from exc

        client = SyncClient(key=self.api_key, default_timeout=self.client_timeout_seconds)
        try:
            handle = client.get_handle(self.model_id, request_id)
        except Exception as exc:
            logger.exception("face_swap_get_handle_failed provider=%s request_id=%s", self.provider_name, request_id)
            raise RuntimeError(f"fal face swap handle lookup failed: {exc}") from exc

        logger.info("face_swap_resumed provider=%s request_id=%s", self.provider_name, request_id)
        return self._complete_from_handle(handle)

    def _complete_from_handle(self, handle: Any) -> FaceSwapResult:
        deadline = time.monotonic() + self.client_timeout_seconds
        while time.monotonic() < deadline:
            try:
                status_obj = handle.status(with_logs=False)
                status_name = str(getattr(status_obj, "status", str(status_obj)) or "").upper()
                queue_position = getattr(status_obj, "position", None)
                logger.info(
                    "face_swap_status provider=%s request_id=%s status=%s queue_position=%s",
                    self.provider_name,
                    handle.request_id,
                    status_name,
                    queue_position,
                )
                if status_name == "COMPLETED":
                    break
                if status_name in {"FAILED", "CANCELLED"}:
                    raise RuntimeError(
                        f"fal face swap job {status_name.lower()} (request_id={handle.request_id})"
                    )
            except RuntimeError:
                raise
            except Exception as exc:
                logger.warning(
                    "face_swap_status_poll_error provider=%s request_id=%s error=%s",
                    self.provider_name,
                    handle.request_id,
                    exc,
                )
            time.sleep(3)
        else:
            raise FaceSwapSubmittedJobTimeoutError(
                request_id=handle.request_id,
                message=f"Request {handle.request_id} timed out after {self.client_timeout_seconds:.1f} seconds",
            )

        last_exc: Exception | None = None
        for fetch_attempt in range(1, 4):
            try:
                result = handle.get()
                break
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "face_swap_result_fetch_failed provider=%s request_id=%s attempt=%d/3 error=%s",
                    self.provider_name,
                    handle.request_id,
                    fetch_attempt,
                    exc,
                )
                if fetch_attempt < 3:
                    time.sleep(2)
        else:
            timeout_error = FaceSwapSubmittedJobTimeoutError(
                request_id=handle.request_id,
                message=f"fal face swap result fetch failed after 3 attempts (request_id={handle.request_id})",
            )
            raise timeout_error from last_exc

        image_url = self._extract_url(result)
        if not image_url:
            raise RuntimeError(f"Unexpected response shape from {self.provider_name}: {result!r}")

        logger.info("face_swap_done provider=%s url=%s", self.provider_name, image_url)
        return FaceSwapResult(image_url=image_url, provider_name=self.provider_name)

    def _coerce_image_input(self, client: Any, reference: str) -> str:
        """Upload local file paths to fal.ai CDN; pass public URLs through unchanged."""
        candidate = Path(reference)
        if candidate.exists():
            try:
                return str(client.upload_file(candidate))
            except Exception:
                logger.warning("fal_upload_failed path=%s fallback=data_uri", candidate)
                content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
                encoded = base64.b64encode(candidate.read_bytes()).decode("ascii")
                return f"data:{content_type};base64,{encoded}"
        return reference

    def _extract_url(self, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str) and value.startswith("http"):
            return value
        if isinstance(value, dict):
            for key in ("image", "url", "output", "result", "swapped_image"):
                candidate = self._extract_url(value.get(key))
                if candidate:
                    return candidate
            images = value.get("images")
            if isinstance(images, list) and images:
                return self._extract_url(images[0])
        if isinstance(value, (list, tuple)) and value:
            return self._extract_url(value[0])
        url = getattr(value, "url", None)
        if isinstance(url, str) and url.startswith("http"):
            return url
        return None
