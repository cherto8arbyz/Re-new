"""Step 2 of the look generation pipeline: face swap via fal-ai/face-swap."""
from __future__ import annotations

import asyncio
import base64
import logging
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger("image-pipeline.pipeline.step2")

DEFAULT_FACE_SWAP_MODEL_ID = "fal-ai/face-swap"


@dataclass(frozen=True)
class FaceSwapResult:
    image_url: str
    provider_name: str


class FalFaceSwapProvider:
    """Replaces the face on a base image with the user's face (Step 2)."""

    def __init__(
        self,
        api_key: str,
        model_id: str = DEFAULT_FACE_SWAP_MODEL_ID,
        client_timeout_seconds: float = 120.0,
        start_timeout_seconds: float = 60.0,
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
        result = client.subscribe(
            self.model_id,
            arguments=payload,
            with_logs=False,
            start_timeout=self.start_timeout_seconds,
            client_timeout=self.client_timeout_seconds,
        )
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
