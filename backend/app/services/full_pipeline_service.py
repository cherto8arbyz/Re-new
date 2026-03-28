"""Orchestrates the full 4-step look generation pipeline via fal.ai."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

from .fal_base_generation import BaseGenerationRequest, BaseGenerationResult, FalBaseGenerationProvider
from .fal_face_swap import FaceSwapResult, FalFaceSwapProvider
from .fal_upscale import FalUpscaleProvider, UpscaleResult
from .ai_generation_providers import FalVTONProvider, ProviderOverloadedError, VTONGenerationResult

logger = logging.getLogger("image-pipeline.pipeline.full")

# Pipeline-level VTON retry: only for job SUBMISSION failures (queue full, 503).
# Result-fetch retries are handled inside FalVTONProvider._generate_vton_sync itself.
# Keep this low (2) — each retry re-submits the job and costs money.
_VTON_MAX_RETRIES = 2
_VTON_RETRY_DELAY_SECONDS = 10.0


@dataclass(frozen=True)
class LookGenerationRequest:
    # User inputs
    user_face_url: str          # full-body photo URL when use_photo_directly=True; face URL otherwise
    garment_image_url: str      # public URL of the clothing item (background removed)
    # User profile
    gender: str                 # "male" | "female"
    body_type: str              # "slim" | "athletic" | "average" | "plus" | "curvy"
    # Weather context
    season: str                 # "spring" | "summer" | "autumn" | "winter"
    temperature_celsius: float
    # Garment config
    garment_type: str = "upper_body"  # "upper_body" | "lower_body" | "dresses"
    # When True: skip steps 1+2 — feed user photo directly to VTON.
    # Preserves the user's actual face and body. Recommended for personal try-on.
    use_photo_directly: bool = False


@dataclass
class LookGenerationResult:
    final_image_url: str
    # Intermediate URLs (useful for debugging)
    step1_base_url: str
    step2_face_swapped_url: str
    step3_vton_url: str
    # Provider trace
    providers: list[str] = field(default_factory=list)


class FullLookPipelineService:
    """
    Runs the 4-step look generation pipeline:
      1. Base mannequin generation (FLUX)
      2. Face swap (InsightFace)
      3. Virtual try-on (Leffa/VTON)
      4. Upscale 2x (RealESRGAN)
    """

    def __init__(
        self,
        base_gen: FalBaseGenerationProvider,
        face_swap: FalFaceSwapProvider,
        vton: FalVTONProvider,
        upscale: FalUpscaleProvider,
    ) -> None:
        self._base_gen = base_gen
        self._face_swap = face_swap
        self._vton = vton
        self._upscale = upscale

    async def _vton_with_retry(
        self,
        user_image_url: str,
        garment_image_url: str,
    ) -> VTONGenerationResult:
        """Call VTON with automatic retry on 504/timeout from fal.ai."""
        last_exc: Exception | None = None
        for attempt in range(1, _VTON_MAX_RETRIES + 1):
            try:
                return await self._vton.generate_vton(
                    user_image_url=user_image_url,
                    garment_image_url=garment_image_url,
                )
            except ProviderOverloadedError as exc:
                last_exc = exc
                if attempt < _VTON_MAX_RETRIES:
                    logger.warning(
                        "vton_timeout_retry attempt=%d/%d delay=%.0fs",
                        attempt,
                        _VTON_MAX_RETRIES,
                        _VTON_RETRY_DELAY_SECONDS,
                    )
                    await asyncio.sleep(_VTON_RETRY_DELAY_SECONDS)
                else:
                    logger.error("vton_timeout_all_retries_exhausted attempts=%d", _VTON_MAX_RETRIES)
        raise last_exc  # type: ignore[misc]

    async def generate_look(self, request: LookGenerationRequest) -> LookGenerationResult:
        logger.info(
            "pipeline_start gender=%s body_type=%s season=%s temp=%.1f garment_type=%s",
            request.gender,
            request.body_type,
            request.season,
            request.temperature_celsius,
            request.garment_type,
        )

        if request.use_photo_directly:
            return await self._run_direct_photo_mode(request)
        return await self._run_full_mannequin_mode(request)

    async def _run_direct_photo_mode(self, request: LookGenerationRequest) -> LookGenerationResult:
        """Steps 3+4 only: user photo → VTON → upscale. Face is preserved exactly."""
        logger.info("pipeline_mode=direct_photo skipping steps 1+2")

        vton_result: VTONGenerationResult = await self._vton_with_retry(
            user_image_url=request.user_face_url,
            garment_image_url=request.garment_image_url,
        )
        logger.info("pipeline_step3_done url=%s", vton_result.output_path)

        upscale_result: UpscaleResult = await self._upscale.upscale(
            image_url=vton_result.output_path,
        )
        logger.info("pipeline_step4_done url=%s", upscale_result.image_url)

        return LookGenerationResult(
            final_image_url=upscale_result.image_url,
            step1_base_url=None,
            step2_face_swapped_url=None,
            step3_vton_url=vton_result.output_path,
            providers=[vton_result.provider_name, upscale_result.provider_name],
        )

    async def _run_full_mannequin_mode(self, request: LookGenerationRequest) -> LookGenerationResult:
        """Full 4-step: generate mannequin → face swap → VTON → upscale."""
        # Step 1: Generate base mannequin image
        base_result: BaseGenerationResult = await self._base_gen.generate(
            BaseGenerationRequest(
                gender=request.gender,
                body_type=request.body_type,
                season=request.season,
                temperature_celsius=request.temperature_celsius,
            )
        )
        logger.info("pipeline_step1_done url=%s", base_result.image_url)

        # Step 2: Swap mannequin face with user face
        face_result: FaceSwapResult = await self._face_swap.swap_face(
            base_image_url=base_result.image_url,
            face_image_url=request.user_face_url,
        )
        logger.info("pipeline_step2_done url=%s", face_result.image_url)

        # Step 3: Virtual try-on — put the garment on the person.
        # Retried up to _VTON_MAX_RETRIES times on 504/timeout.
        vton_result: VTONGenerationResult = await self._vton_with_retry(
            user_image_url=face_result.image_url,
            garment_image_url=request.garment_image_url,
        )
        logger.info("pipeline_step3_done url=%s", vton_result.output_path)

        # Step 4: Upscale 2x for final quality
        upscale_result: UpscaleResult = await self._upscale.upscale(
            image_url=vton_result.output_path,
        )
        logger.info("pipeline_step4_done url=%s", upscale_result.image_url)

        return LookGenerationResult(
            final_image_url=upscale_result.image_url,
            step1_base_url=base_result.image_url,
            step2_face_swapped_url=face_result.image_url,
            step3_vton_url=vton_result.output_path,
            providers=[
                base_result.provider_name,
                face_result.provider_name,
                vton_result.provider_name,
                upscale_result.provider_name,
            ],
        )
