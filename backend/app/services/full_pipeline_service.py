"""Orchestrates the full look-generation pipeline."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from inspect import isawaitable
import logging
from typing import Any, TypeVar

from .ai_generation_providers import FalVTONProvider, ProviderOverloadedError, VTONGenerationResult
from .fal_base_generation import BaseGenerationRequest, BaseGenerationResult, FalBaseGenerationProvider
from .fal_face_swap import FaceSwapResult, FalFaceSwapProvider
from .fal_upscale import FalUpscaleProvider, UpscaleResult


logger = logging.getLogger("image-pipeline.pipeline.full")

_PROVIDER_RETRY_DELAYS_SECONDS = (5.0, 15.0, 30.0)
_DEFAULT_BODY_TYPE = "average"
_T = TypeVar("_T")


@dataclass(frozen=True)
class PipelineGarment:
    garment_id: str
    image_url: str
    category: str
    normalized_category: str
    name: str = ""
    color: str = ""


@dataclass(frozen=True)
class FullLookPipelineRequest:
    user_id: str
    gender: str
    weather_context: dict[str, Any]
    garments: list[PipelineGarment]
    reference_face_urls: list[str] | None = None


@dataclass(frozen=True)
class FullLookPipelineResult:
    prompt: str
    final_image_url: str
    base_image_url: str
    face_swapped_image_url: str | None
    applied_garment_ids: list[str] = field(default_factory=list)
    providers: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class LookGenerationRequest:
    user_face_url: str
    garment_image_url: str
    gender: str
    body_type: str
    season: str
    temperature_celsius: float
    garment_type: str = "upper_body"
    use_photo_directly: bool = False


@dataclass
class LookGenerationResult:
    final_image_url: str
    step1_base_url: str | None
    step2_face_swapped_url: str | None
    step3_vton_url: str
    providers: list[str] = field(default_factory=list)


class FullLookPipelineService:
    """
    Legacy flow:
      1. Base mannequin generation
      2. Face swap
      3. Single-garment VTON
      4. Upscale

    New daily-look flow:
      1. Prompt builder
      2. Base generation
      3. Iterative multi-garment VTON
      4. Face swap with available identity references
    """

    def __init__(
        self,
        base_gen: FalBaseGenerationProvider,
        face_swap: FalFaceSwapProvider,
        vton: FalVTONProvider,
        upscale: FalUpscaleProvider,
        prompt_builder: Any | None = None,
        reference_face_url_resolver: Callable[[str], list[str]] | None = None,
        input_reference_resolver: Callable[[str], str] | None = None,
    ) -> None:
        self._base_gen = base_gen
        self._face_swap = face_swap
        self._vton = vton
        self._upscale = upscale
        self._prompt_builder = prompt_builder
        self._reference_face_url_resolver = reference_face_url_resolver
        self._input_reference_resolver = input_reference_resolver

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

    async def generate_daily_look(
        self,
        request: FullLookPipelineRequest,
        stage_callback: Callable[[str, str | None], Awaitable[None] | None] | None = None,
    ) -> FullLookPipelineResult:
        ordered_vton_garments = self._order_vton_garments(request.garments)
        prompt = await self._build_prompt(request, has_core_garments=bool(ordered_vton_garments))

        await self._emit_stage(stage_callback, "generating_base", prompt)
        base_result = await self._run_with_retry(
            "base_generation",
            self._base_gen.generate,
            BaseGenerationRequest(
                gender=request.gender,
                body_type=_DEFAULT_BODY_TYPE,
                season=self._infer_season(request.weather_context),
                temperature_celsius=self._extract_temperature(request.weather_context),
                prompt_override=prompt,
            ),
        )
        providers = [base_result.provider_name]
        current_image_url = base_result.image_url
        applied_garment_ids: list[str] = []

        if ordered_vton_garments:
            await self._emit_stage(stage_callback, "vton_iterating", prompt)
            for garment in ordered_vton_garments:
                vton_result = await self._run_with_retry(
                    f"vton_{garment.normalized_category}",
                    self._vton.generate_vton,
                    user_image_url=current_image_url,
                    garment_image_url=self._resolve_input_reference(garment.image_url),
                    garment_type=self._resolve_vton_garment_type(garment),
                )
                current_image_url = vton_result.output_path
                applied_garment_ids.append(garment.garment_id)
                providers.append(vton_result.provider_name)

        face_swapped_image_url: str | None = None
        reference_face_urls = self._resolve_reference_faces(request)
        if reference_face_urls:
            await self._emit_stage(stage_callback, "face_swap", prompt)
            face_result = await self._run_with_retry(
                "face_swap",
                self._face_swap.swap_face_with_references,
                base_image_url=current_image_url,
                face_image_urls=reference_face_urls,
            )
            current_image_url = face_result.image_url
            face_swapped_image_url = face_result.image_url
            providers.append(face_result.provider_name)

        return FullLookPipelineResult(
            prompt=prompt,
            final_image_url=current_image_url,
            base_image_url=base_result.image_url,
            face_swapped_image_url=face_swapped_image_url,
            applied_garment_ids=applied_garment_ids,
            providers=providers,
        )

    async def resume_submitted_face_swap_request(self, request_id: str) -> FaceSwapResult:
        return await self._face_swap.resume_face_swap_request(request_id)

    async def _run_direct_photo_mode(self, request: LookGenerationRequest) -> LookGenerationResult:
        logger.info("pipeline_mode=direct_photo skipping steps 1+2")
        vton_result = await self._run_with_retry(
            "vton_direct_photo",
            self._vton.generate_vton,
            user_image_url=request.user_face_url,
            garment_image_url=request.garment_image_url,
            garment_type=request.garment_type,
        )
        logger.info("pipeline_step3_done url=%s", vton_result.output_path)

        upscale_result = await self._upscale.upscale(image_url=vton_result.output_path)
        logger.info("pipeline_step4_done url=%s", upscale_result.image_url)

        return LookGenerationResult(
            final_image_url=upscale_result.image_url,
            step1_base_url=None,
            step2_face_swapped_url=None,
            step3_vton_url=vton_result.output_path,
            providers=[vton_result.provider_name, upscale_result.provider_name],
        )

    async def _run_full_mannequin_mode(self, request: LookGenerationRequest) -> LookGenerationResult:
        base_result = await self._base_gen.generate(
            BaseGenerationRequest(
                gender=request.gender,
                body_type=request.body_type,
                season=request.season,
                temperature_celsius=request.temperature_celsius,
            )
        )
        logger.info("pipeline_step1_done url=%s", base_result.image_url)

        face_result = await self._face_swap.swap_face(
            base_image_url=base_result.image_url,
            face_image_url=request.user_face_url,
        )
        logger.info("pipeline_step2_done url=%s", face_result.image_url)

        vton_result = await self._run_with_retry(
            "vton_full_pipeline",
            self._vton.generate_vton,
            user_image_url=face_result.image_url,
            garment_image_url=request.garment_image_url,
            garment_type=request.garment_type,
        )
        logger.info("pipeline_step3_done url=%s", vton_result.output_path)

        upscale_result = await self._upscale.upscale(image_url=vton_result.output_path)
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

    async def _run_with_retry(
        self,
        operation_name: str,
        operation: Callable[..., Awaitable[_T]],
        *args: Any,
        **kwargs: Any,
    ) -> _T:
        attempts_total = len(_PROVIDER_RETRY_DELAYS_SECONDS) + 1
        last_exc: Exception | None = None
        for attempt in range(1, attempts_total + 1):
            try:
                return await operation(*args, **kwargs)
            except Exception as exc:
                last_exc = exc
                if not self._is_retryable_provider_error(exc) or attempt >= attempts_total:
                    raise

                delay_seconds = _PROVIDER_RETRY_DELAYS_SECONDS[attempt - 1]
                logger.warning(
                    "provider_retry operation=%s attempt=%d/%d delay=%.0fs error=%s",
                    operation_name,
                    attempt,
                    attempts_total,
                    delay_seconds,
                    exc,
                )
                await asyncio.sleep(delay_seconds)

        raise last_exc  # type: ignore[misc]

    async def _build_prompt(self, request: FullLookPipelineRequest, has_core_garments: bool) -> str:
        garment_summaries = [
            {
                "garment_id": garment.garment_id,
                "name": garment.name,
                "title": garment.name,
                "color": garment.color,
                "normalized_category": garment.normalized_category,
            }
            for garment in request.garments
        ]
        if self._prompt_builder is None:
            return (
                f"professional fashion photography, {request.gender.lower()} model, full body shot, "
                "confident natural pose, stylish weather-appropriate outfit, realistic lighting"
            )

        return await self._prompt_builder.build_prompt(
            gender=request.gender,
            weather_context=request.weather_context,
            garment_summaries=garment_summaries,
            has_core_garments=has_core_garments,
        )

    def _order_vton_garments(self, garments: list[PipelineGarment]) -> list[PipelineGarment]:
        dresses = [garment for garment in garments if garment.normalized_category == "dress"]
        bottoms = [garment for garment in garments if garment.normalized_category == "bottom"]
        tops = [garment for garment in garments if garment.normalized_category == "top"]
        outerwear = [garment for garment in garments if garment.normalized_category == "outerwear"]

        if dresses:
            ordered = [dresses[0]]
            if outerwear:
                ordered.append(outerwear[0])
            return ordered

        ordered: list[PipelineGarment] = []
        if bottoms:
            ordered.append(bottoms[0])
        if tops:
            ordered.append(tops[0])
        if outerwear:
            ordered.append(outerwear[0])
        return ordered

    def _resolve_vton_garment_type(self, garment: PipelineGarment) -> str:
        if garment.normalized_category == "bottom":
            return "lower_body"
        if garment.normalized_category == "dress":
            return "dresses"
        return "upper_body"

    def _resolve_reference_faces(self, request: FullLookPipelineRequest) -> list[str]:
        if request.reference_face_urls is not None:
            return [self._resolve_input_reference(url) for url in request.reference_face_urls if str(url).strip()]
        if self._reference_face_url_resolver is None:
            return []
        return [
            self._resolve_input_reference(url)
            for url in self._reference_face_url_resolver(request.user_id)
            if str(url).strip()
        ]

    def _resolve_input_reference(self, reference: str) -> str:
        if self._input_reference_resolver is None:
            return reference
        return self._input_reference_resolver(reference)

    def _extract_temperature(self, weather_context: dict[str, Any]) -> float:
        raw_value = weather_context.get("temperature_celsius")
        try:
            return float(raw_value)
        except (TypeError, ValueError):
            return 18.0

    def _infer_season(self, weather_context: dict[str, Any]) -> str:
        explicit = str(weather_context.get("season") or "").strip().lower()
        if explicit in {"spring", "summer", "autumn", "winter"}:
            return explicit

        temperature = self._extract_temperature(weather_context)
        if temperature <= 4:
            return "winter"
        if temperature <= 14:
            return "autumn"
        if temperature >= 24:
            return "summer"
        return "spring"

    def _is_retryable_provider_error(self, exc: Exception) -> bool:
        retry_allowed = getattr(exc, "retry_allowed", None)
        if retry_allowed is False:
            return False

        if isinstance(exc, ProviderOverloadedError):
            return True

        message = f"{type(exc).__name__}: {exc}".lower()
        non_retryable_markers = ("400", "401", "403", "404", "409", "422", "unprocessable", "bad prompt", "validation")
        if any(marker in message for marker in non_retryable_markers):
            return False

        retryable_markers = (
            "500",
            "502",
            "503",
            "504",
            "bad gateway",
            "gateway timeout",
            "internal server error",
            "service unavailable",
            "overloaded",
            "temporarily unavailable",
            "timeout",
            "timed out",
        )
        return any(marker in message for marker in retryable_markers)

    async def _emit_stage(
        self,
        callback: Callable[[str, str | None], Awaitable[None] | None] | None,
        status: str,
        prompt: str | None,
    ) -> None:
        if callback is None:
            return
        result = callback(status, prompt)
        if isawaitable(result):
            await result
