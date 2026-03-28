"""Step 1 of the look generation pipeline: base mannequin image via fal-ai/flux/dev."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("image-pipeline.pipeline.step1")

DEFAULT_BASE_GEN_MODEL_ID = "fal-ai/flux/dev"

_SEASON_BACKGROUNDS: dict[str, str] = {
    "spring": "spring city park, cherry blossoms, soft morning light",
    "summer": "sunny urban park, green trees, bright daylight",
    "autumn": "autumn park, golden falling leaves, warm afternoon light",
    "winter": "winter street, light snowfall, cold blue-grey sky",
}

_BODY_TYPE_DESCRIPTORS: dict[str, str] = {
    "slim": "slim build",
    "athletic": "athletic build",
    "average": "average build",
    "plus": "plus-size build",
    "curvy": "curvy build",
}


@dataclass(frozen=True)
class BaseGenerationRequest:
    gender: str              # "male" | "female"
    body_type: str           # "slim" | "athletic" | "average" | "plus" | "curvy"
    season: str              # "spring" | "summer" | "autumn" | "winter"
    temperature_celsius: float
    pose: str = "walking towards camera, full body shot"
    image_width: int = 768
    image_height: int = 1024


@dataclass(frozen=True)
class BaseGenerationResult:
    image_url: str
    provider_name: str


class FalBaseGenerationProvider:
    """Generates a neutral mannequin on a weather-appropriate background (Step 1)."""

    def __init__(
        self,
        api_key: str,
        model_id: str = DEFAULT_BASE_GEN_MODEL_ID,
        num_inference_steps: int = 28,
        guidance_scale: float = 3.5,
        client_timeout_seconds: float = 120.0,
        start_timeout_seconds: float = 60.0,
    ) -> None:
        self.api_key = (api_key or "").strip()
        self.model_id = (model_id or DEFAULT_BASE_GEN_MODEL_ID).strip() or DEFAULT_BASE_GEN_MODEL_ID
        self.num_inference_steps = max(1, int(num_inference_steps))
        self.guidance_scale = float(guidance_scale)
        self.client_timeout_seconds = max(30.0, float(client_timeout_seconds))
        self.start_timeout_seconds = max(5.0, float(start_timeout_seconds))
        self.provider_name = f"fal:{self.model_id}"

    async def generate(self, request: BaseGenerationRequest) -> BaseGenerationResult:
        if not self.api_key:
            raise RuntimeError("FAL_KEY is missing.")
        return await asyncio.to_thread(self._generate_sync, request)

    def _generate_sync(self, request: BaseGenerationRequest) -> BaseGenerationResult:
        try:
            from fal_client import SyncClient
        except ImportError as exc:
            raise RuntimeError("fal-client package is not installed.") from exc

        client = SyncClient(key=self.api_key, default_timeout=self.client_timeout_seconds)
        prompt = self._build_prompt(request)
        payload = {
            "prompt": prompt,
            "image_size": {"width": request.image_width, "height": request.image_height},
            "num_inference_steps": self.num_inference_steps,
            "guidance_scale": self.guidance_scale,
            "num_images": 1,
            "output_format": "png",
            "enable_safety_checker": False,
        }

        logger.info(
            "base_generation_start provider=%s prompt=%s",
            self.provider_name,
            prompt[:120],
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

        logger.info("base_generation_done provider=%s url=%s", self.provider_name, image_url)
        return BaseGenerationResult(image_url=image_url, provider_name=self.provider_name)

    def _build_prompt(self, request: BaseGenerationRequest) -> str:
        bg = _SEASON_BACKGROUNDS.get(request.season.lower(), "neutral urban outdoor background")
        body = _BODY_TYPE_DESCRIPTORS.get(request.body_type.lower(), request.body_type)
        gender = request.gender.lower()
        return (
            f"professional fashion photography, {gender} model, {body}, "
            f"{request.pose}, wearing plain light-grey fitted base clothing, "
            f"{bg}, sharp focus, soft bokeh, editorial style, 8k resolution"
        )

    def _extract_url(self, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str) and value.startswith("http"):
            return value
        if isinstance(value, dict):
            # {"images": [{"url": "..."}]}
            images = value.get("images")
            if isinstance(images, list) and images:
                return self._extract_url(images[0])
            for key in ("url", "image", "output"):
                candidate = self._extract_url(value.get(key))
                if candidate:
                    return candidate
        if isinstance(value, (list, tuple)) and value:
            return self._extract_url(value[0])
        url = getattr(value, "url", None)
        if isinstance(url, str) and url.startswith("http"):
            return url
        return None
