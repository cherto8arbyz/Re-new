"""Step 4 of the look generation pipeline: upscale via fal-ai/esrgan."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("image-pipeline.pipeline.step4")

# fal-ai/esrgan is the real model ID (fal-ai/real-esrgan does NOT exist).
# Supports scale 1-8, accepts image_url + scale + face parameters.
DEFAULT_UPSCALE_MODEL_ID = "fal-ai/esrgan"

# Models that actually exist on fal.ai for upscaling (used for validation).
KNOWN_FAL_UPSCALE_MODELS = frozenset({"fal-ai/esrgan", "fal-ai/aura-sr"})


@dataclass(frozen=True)
class UpscaleResult:
    image_url: str
    provider_name: str


class FalUpscaleProvider:
    """Upscales the final look image via ESRGAN (Step 4).

    Uses fal-ai/esrgan which supports configurable scale (1-8).
    Do NOT use fal-ai/real-esrgan — that model does not exist on fal.ai.
    """

    def __init__(
        self,
        api_key: str,
        model_id: str = DEFAULT_UPSCALE_MODEL_ID,
        scale: int = 2,
        face_enhance: bool = False,
        client_timeout_seconds: float = 90.0,
        start_timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = (api_key or "").strip()
        resolved_model = (model_id or DEFAULT_UPSCALE_MODEL_ID).strip() or DEFAULT_UPSCALE_MODEL_ID
        if resolved_model not in KNOWN_FAL_UPSCALE_MODELS:
            logger.warning(
                "upscale_unknown_model model=%s known=%s — falling back to default",
                resolved_model,
                sorted(KNOWN_FAL_UPSCALE_MODELS),
            )
            resolved_model = DEFAULT_UPSCALE_MODEL_ID
        self.model_id = resolved_model
        # esrgan supports scale 1-8; aura-sr is always 4x (upscale_factor param ignored there)
        self.scale = max(1, min(8, int(scale)))
        self.face_enhance = bool(face_enhance)
        self.client_timeout_seconds = max(30.0, float(client_timeout_seconds))
        self.start_timeout_seconds = max(5.0, float(start_timeout_seconds))
        self.provider_name = f"fal:{self.model_id}"

    async def upscale(self, image_url: str) -> UpscaleResult:
        if not self.api_key:
            raise RuntimeError("FAL_KEY is missing.")
        if not image_url.strip():
            raise ValueError("image_url is required.")
        return await asyncio.to_thread(self._upscale_sync, image_url.strip())

    def _upscale_sync(self, image_url: str) -> UpscaleResult:
        try:
            from fal_client import SyncClient
        except ImportError as exc:
            raise RuntimeError("fal-client package is not installed.") from exc

        client = SyncClient(key=self.api_key, default_timeout=self.client_timeout_seconds)
        # fal-ai/esrgan: image_url + scale (1-8) + face (bool)
        # fal-ai/aura-sr: image_url + upscale_factor (fixed 4) — different param name!
        if self.model_id == "fal-ai/aura-sr":
            payload: dict[str, Any] = {
                "image_url": image_url,
                "upscale_factor": 4,
            }
        else:
            payload = {
                "image_url": image_url,
                "scale": self.scale,
                "face": self.face_enhance,
            }

        logger.info("upscale_start provider=%s scale=%sx url=%s", self.provider_name, self.scale, image_url)
        result = client.subscribe(
            self.model_id,
            arguments=payload,
            with_logs=False,
            start_timeout=self.start_timeout_seconds,
            client_timeout=self.client_timeout_seconds,
        )
        out_url = self._extract_url(result)
        if not out_url:
            raise RuntimeError(f"Unexpected response shape from {self.provider_name}: {result!r}")

        logger.info("upscale_done provider=%s url=%s", self.provider_name, out_url)
        return UpscaleResult(image_url=out_url, provider_name=self.provider_name)

    def _extract_url(self, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str) and value.startswith("http"):
            return value
        if isinstance(value, dict):
            for key in ("image", "url", "output", "result"):
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
