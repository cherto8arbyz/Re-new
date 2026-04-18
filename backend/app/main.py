import asyncio
import base64
from datetime import datetime
import ipaddress
import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth import AuthenticatedUser, get_authenticated_user
from .db import SessionLocal, get_db_session, init_db
from .models import GenerationJob
from .services.ai_generation_providers import (
  AIGenerationProvider,
  FalVTONProvider,
  HuggingFaceVTONProvider,
  ProviderOverloadedError,
  ReplicateVTONProvider,
)
from .services.fal_base_generation import FalBaseGenerationProvider
from .services.fal_face_swap import FalFaceSwapProvider
from .services.fal_upscale import FalUpscaleProvider
from .services.full_pipeline_service import (
  FullLookPipelineRequest,
  FullLookPipelineService,
  LookGenerationRequest,
  PipelineGarment,
)
from .services.background_removal_providers import ClipdropProvider, RemoveBgProvider
from .services.background_removal_service import BackgroundRemovalService
from .services.daily_look_job_service import DailyLookJobService
from .services.face_detection_service import FaceDetectionService
from .services.gemini_proxy_service import GeminiProxyService
from .services.identity_reference_service import (
  IdentityReferenceCountError,
  IdentityReferenceService,
  IdentityReferenceUploadItem,
  IdentityReferenceValidationError,
)
from .services.local_storage_service import LocalStorageService, STATIC_DIR
from .services.look_face_generation_service import LookFaceGenerationService
from .services.outfit_recommendation_service import OutfitRecommendationService
from .services.prompt_builder_service import PromptBuilderService
from .services.stripe_upgrade_service import StripeUpgradeService
from .services.user_profile_service import UserProfileService
from .services.vton_job_service import VTONJobService
from .settings import settings


logger = logging.getLogger("image-pipeline")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Re:new Image Pipeline", version="1.0.0")


@app.exception_handler(ProviderOverloadedError)
async def provider_overloaded_handler(request: Request, exc: ProviderOverloadedError) -> JSONResponse:
  """Return 503 instead of 500 when fal.ai is overloaded/times out after all retries."""
  return JSONResponse(
    status_code=503,
    content={"detail": "AI provider is overloaded. Please retry in 30–60 seconds.", "error": str(exc)},
  )
app.state.vton_tasks = set()
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)
Path(STATIC_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

if settings.background_removal_provider == "clipdrop":
  primary_provider = ClipdropProvider(settings.clipdrop_api_key)
  fallback_provider = RemoveBgProvider(settings.remove_bg_api_key) if settings.remove_bg_api_key else None
else:
  primary_provider = RemoveBgProvider(settings.remove_bg_api_key)
  fallback_provider = ClipdropProvider(settings.clipdrop_api_key) if settings.clipdrop_api_key else None

background_service = BackgroundRemovalService(
  primary_provider=primary_provider,
  fallback_provider=fallback_provider,
)
face_service = FaceDetectionService()
look_face_service = LookFaceGenerationService()
gemini_proxy_service = GeminiProxyService(settings.gemini_api_key)
prompt_builder_service = PromptBuilderService(gemini_proxy_service)
storage_service = LocalStorageService()
user_profile_service = UserProfileService(session_factory=SessionLocal)
outfit_recommendation_service = OutfitRecommendationService()
identity_reference_service = IdentityReferenceService(
  face_detection_service=face_service,
  storage_service=storage_service,
)
vton_job_service = VTONJobService(
  session_factory=SessionLocal,
  storage_service=storage_service,
  provider_factory=lambda: _build_vton_provider(),
)
daily_look_job_service = DailyLookJobService(
  session_factory=SessionLocal,
  storage_service=storage_service,
  user_profile_service=user_profile_service,
  pipeline_factory=lambda: _build_daily_look_pipeline(),
)
stripe_upgrade_services = {
  "wardrobe": StripeUpgradeService(
    secret_key=settings.stripe_secret_key,
    payment_link_url=settings.stripe_wardrobe_upgrade_payment_link_url,
    api_base_url=settings.stripe_api_base_url,
  ),
  "ai_looks": StripeUpgradeService(
    secret_key=settings.stripe_secret_key,
    payment_link_url=settings.stripe_ai_looks_upgrade_payment_link_url,
    api_base_url=settings.stripe_api_base_url,
  ),
}


class UploadResponse(BaseModel):
  url: str


class IdentityUploadResponse(BaseModel):
  uploaded_count: int
  reference_urls: list[str]


class FullLookGenerateRequest(BaseModel):
  user_face_url: str
  garment_image_url: str
  gender: str = "male"
  body_type: str = "average"
  season: str = "autumn"
  temperature_celsius: float = 15.0
  garment_type: str = "upper_body"
  # When True: skip mannequin generation + face swap.
  # The user's photo goes directly into VTON — preserves face and body exactly.
  use_photo_directly: bool = False


class FullLookGenerateResponse(BaseModel):
  final_image_url: str
  step1_base_url: str | None   # None when use_photo_directly=True
  step2_face_swapped_url: str | None  # None when use_photo_directly=True
  step3_vton_url: str
  providers: list[str]


class VTONGenerateRequest(BaseModel):
  user_image_url: str
  garment_image_url: str


class VTONGenerateResponse(BaseModel):
  job_id: str
  status: str


class VTONJobResponse(BaseModel):
  id: str
  status: str
  result_url: str | None = None
  result_image_url: str | None = None
  error_message: str | None = None
  created_at: datetime


class StripeUpgradeVerifyRequest(BaseModel):
  context: str = "wardrobe"
  reference_id: str
  customer_email: str | None = None
  created_after: int | None = None


class StripeUpgradeVerifyResponse(BaseModel):
  context: str
  paid: bool
  configured: bool
  session_id: str | None = None
  reason: str | None = None


class DailyLookWeatherContext(BaseModel):
  temperature_celsius: float
  condition: str | None = None
  summary: str | None = None
  precipitation: str | None = None
  is_raining: bool = False
  is_snowing: bool = False
  location: str | None = None
  season: str | None = None


class DailyLookGarmentInput(BaseModel):
  garment_id: str = Field(min_length=1)
  image_url: str = Field(min_length=1)
  category: str = Field(min_length=1)
  name: str | None = None
  color: str | list[str] | None = None


class DailyLookGenerateRequest(BaseModel):
  gender: str = "female"
  weather_context: DailyLookWeatherContext
  available_garments: list[DailyLookGarmentInput] = Field(default_factory=list)


class DailyLookGenerateResponse(BaseModel):
  job_id: str
  status: str
  selected_garment_ids: list[str]


class DailyLookJobResponse(BaseModel):
  id: str
  user_id: str
  status: str
  selected_garment_ids: list[str]
  weather_context: dict[str, Any]
  prompt: str | None = None
  final_image_url: str | None = None
  error_message: str | None = None
  created_at: datetime
  completed_at: datetime | None = None


@app.on_event("startup")
async def startup() -> None:
  init_db()


@app.get("/health")
async def health() -> dict[str, Any]:
  return {
    "ok": True,
    "remove_bg_configured": bool(settings.remove_bg_api_key),
    "clipdrop_configured": bool(settings.clipdrop_api_key),
    "gemini_configured": gemini_proxy_service.configured,
    "ai_generation_provider": settings.ai_generation_provider,
    "background_provider": settings.background_removal_provider,
    "database_driver": _resolve_database_driver(settings.database_url),
    "database_configured": bool(settings.database_url),
    "public_base_url": settings.public_base_url,
    "hugging_face_space_id": settings.hugging_face_space_id,
    "fal_configured": bool(settings.fal_key and settings.fal_model_id),
    "fal_model_id": settings.fal_model_id,
    "replicate_configured": bool(settings.replicate_api_token and settings.replicate_model),
    "replicate_model": settings.replicate_model,
    "stripe_upgrade_configured": bool(settings.stripe_secret_key),
    "stripe_wardrobe_payment_link_configured": bool(settings.stripe_wardrobe_upgrade_payment_link_url),
    "stripe_ai_looks_payment_link_configured": bool(settings.stripe_ai_looks_upgrade_payment_link_url),
  }


@app.post("/api/payments/stripe/verify-upgrade", response_model=StripeUpgradeVerifyResponse)
async def verify_stripe_upgrade_payment(payload: StripeUpgradeVerifyRequest) -> StripeUpgradeVerifyResponse:
  context = _normalize_upgrade_context(payload.context)
  service = stripe_upgrade_services.get(context)
  if service is None:
    raise HTTPException(status_code=400, detail="Unsupported upgrade context.")

  verification = await service.verify_upgrade_payment(
    reference_id=payload.reference_id,
    customer_email=payload.customer_email,
    created_after=payload.created_after,
  )
  return StripeUpgradeVerifyResponse(
    context=context,
    paid=verification.paid,
    configured=verification.configured,
    session_id=verification.matched_session_id,
    reason=verification.reason,
  )


@app.post("/api/ai/generate-content")
async def generate_content(payload: dict[str, Any]) -> JSONResponse:
  model = str(payload.get("model") or "").strip() or "gemini-2.5-flash"
  body = payload.get("body")

  if not isinstance(body, dict):
    return JSONResponse(
      status_code=400,
      content={"error": "Request payload must include an object field named 'body'."},
    )

  status_code, response_payload = await gemini_proxy_service.generate_content(model=model, body=body)
  return JSONResponse(status_code=status_code, content=response_payload)


@app.post("/api/v1/upload", response_model=UploadResponse)
async def upload_image(
  request: Request,
  file: UploadFile = File(...),
) -> UploadResponse:
  file_bytes = await file.read()
  if not file_bytes:
    raise HTTPException(status_code=400, detail="Empty image payload.")

  stored_asset = storage_service.save_upload(
    file_bytes=file_bytes,
    original_filename=file.filename or "upload.png",
    content_type=file.content_type or "image/png",
    base_url=_resolve_public_base_url(request),
  )
  return UploadResponse(url=stored_asset.public_url)


@app.post("/api/v1/identity/upload-reference", response_model=IdentityUploadResponse)
async def upload_identity_reference_images(
  request: Request,
  files: list[UploadFile] = File(...),
  current_user: AuthenticatedUser = Depends(get_authenticated_user),
) -> IdentityUploadResponse:
  upload_items: list[IdentityReferenceUploadItem] = []
  for index, file in enumerate(files):
    file_bytes = await file.read()
    upload_items.append(
      IdentityReferenceUploadItem(
        index=index,
        file_bytes=file_bytes,
        filename=file.filename or f"identity-{index + 1}.jpg",
        content_type=file.content_type or "",
      )
    )

  try:
    result = identity_reference_service.validate_and_store(
      user_id=current_user.user_id,
      files=upload_items,
      base_url=_resolve_public_base_url(request),
    )
  except IdentityReferenceCountError as exc:
    raise HTTPException(status_code=400, detail={"message": exc.detail, "error_code": "identity_photo_count_invalid"}) from exc
  except IdentityReferenceValidationError as exc:
    raise HTTPException(
      status_code=400,
      detail={
        "message": exc.detail,
        "error_code": exc.error_code,
        "failed_index": exc.file_index,
      },
    ) from exc

  user_profile_service.replace_reference_face_urls(
    user_id=current_user.user_id,
    reference_face_urls=result.reference_urls,
  )

  return IdentityUploadResponse(
    uploaded_count=result.uploaded_count,
    reference_urls=result.reference_urls,
  )


@app.post("/api/v1/look/generate-full", response_model=FullLookGenerateResponse)
async def generate_full_look(payload: FullLookGenerateRequest) -> FullLookGenerateResponse:
  """Full 4-step pipeline: base generation → face swap → VTON → upscale."""
  if not payload.user_face_url.strip():
    raise HTTPException(status_code=400, detail="user_face_url is required.")
  if not payload.garment_image_url.strip():
    raise HTTPException(status_code=400, detail="garment_image_url is required.")
  if not settings.fal_key:
    raise HTTPException(status_code=503, detail="FAL_KEY is not configured.")

  # Resolve local http://127.0.0.1/static/uploads/... URLs to actual file paths
  # so fal.ai (external) can receive the images via upload instead of unreachable localhost.
  resolved_face_url = storage_service.resolve_provider_input_reference(payload.user_face_url.strip())
  resolved_garment_url = storage_service.resolve_provider_input_reference(payload.garment_image_url.strip())

  pipeline = _build_full_pipeline(garment_type=payload.garment_type)
  result = await pipeline.generate_look(
    LookGenerationRequest(
      user_face_url=resolved_face_url,
      garment_image_url=resolved_garment_url,
      gender=payload.gender,
      body_type=payload.body_type,
      season=payload.season,
      temperature_celsius=payload.temperature_celsius,
      garment_type=payload.garment_type,
      use_photo_directly=payload.use_photo_directly,
    )
  )
  return FullLookGenerateResponse(
    final_image_url=result.final_image_url,
    step1_base_url=result.step1_base_url,
    step2_face_swapped_url=result.step2_face_swapped_url,
    step3_vton_url=result.step3_vton_url,
    providers=result.providers,
  )


@app.post("/api/v1/daily-look/generate", response_model=DailyLookGenerateResponse)
async def generate_daily_look(
  request: Request,
  payload: DailyLookGenerateRequest,
  current_user: AuthenticatedUser = Depends(get_authenticated_user),
) -> DailyLookGenerateResponse:
  avatar_gender = _normalize_avatar_gender(payload.gender)
  weather_context = _serialize_weather_context(payload.weather_context)
  available_garments = [_to_pipeline_garment(item) for item in payload.available_garments]
  recommendation = outfit_recommendation_service.recommend(
    garments=available_garments,
    weather_context=weather_context,
  )
  selected_garment_ids = [garment.garment_id for garment in recommendation.selected_garments]
  reusable_job = daily_look_job_service.find_reusable_job(
    user_id=current_user.user_id,
    selected_garment_ids=selected_garment_ids,
    weather_context=weather_context,
    avatar_gender=avatar_gender,
  )
  if reusable_job is not None:
    resume_task = daily_look_job_service.start_pending_face_swap_resume_task(
      job_id=reusable_job.id,
      public_base_url=_resolve_public_base_url(request),
    )
    if resume_task is not None:
      _track_task(resume_task)
      refreshed_job = daily_look_job_service.get_job(reusable_job.id)
      if refreshed_job is not None:
        reusable_job = refreshed_job
    logger.info("daily_look_job_reused job_id=%s user_id=%s", reusable_job.id, current_user.user_id)
    return DailyLookGenerateResponse(
      job_id=reusable_job.id,
      status=reusable_job.status,
      selected_garment_ids=list(reusable_job.selected_garment_ids or []),
    )

  job = daily_look_job_service.create_job(
    user_id=current_user.user_id,
    selected_garment_ids=selected_garment_ids,
    weather_context=weather_context,
    avatar_gender=avatar_gender,
  )
  task = asyncio.create_task(
    daily_look_job_service.process_job(
      job_id=job.id,
      request=FullLookPipelineRequest(
        user_id=current_user.user_id,
        gender=avatar_gender,
        weather_context=weather_context,
        garments=recommendation.selected_garments,
      ),
      public_base_url=_resolve_public_base_url(request),
    )
  )
  _track_task(task)
  return DailyLookGenerateResponse(
    job_id=job.id,
    status=job.status,
    selected_garment_ids=selected_garment_ids,
  )


@app.get("/api/v1/daily-look/jobs/{job_id}", response_model=DailyLookJobResponse)
async def get_daily_look_job(
  request: Request,
  job_id: str,
  current_user: AuthenticatedUser = Depends(get_authenticated_user),
) -> DailyLookJobResponse:
  job = daily_look_job_service.get_job(job_id)
  if job is None:
    raise HTTPException(status_code=404, detail="Daily look job not found.")
  if job.user_id != current_user.user_id:
    raise HTTPException(status_code=404, detail="Daily look job not found.")

  resume_task = daily_look_job_service.start_pending_face_swap_resume_task(
    job_id=job.id,
    public_base_url=_resolve_public_base_url(request),
  )
  if resume_task is not None:
    _track_task(resume_task)
    refreshed_job = daily_look_job_service.get_job(job.id)
    if refreshed_job is not None:
      job = refreshed_job

  return DailyLookJobResponse(
    id=job.id,
    user_id=job.user_id,
    status=job.status,
    selected_garment_ids=list(job.selected_garment_ids or []),
    weather_context=dict(job.weather_context or {}),
    prompt=job.prompt,
    final_image_url=job.final_image_url,
    error_message=job.error_message,
    created_at=job.created_at,
    completed_at=job.completed_at,
  )


@app.post("/api/v1/vton/generate", response_model=VTONGenerateResponse)
@app.post("/api/v1/generate-look", response_model=VTONGenerateResponse)
async def generate_vton(
  request: Request,
  payload: VTONGenerateRequest,
) -> VTONGenerateResponse:
  if not payload.user_image_url.strip():
    raise HTTPException(status_code=400, detail="user_image_url is required.")
  if not payload.garment_image_url.strip():
    raise HTTPException(status_code=400, detail="garment_image_url is required.")

  job = vton_job_service.create_job()
  task = asyncio.create_task(
    vton_job_service.process_job(
      job_id=job.id,
      user_image_url=payload.user_image_url.strip(),
      garment_image_url=payload.garment_image_url.strip(),
      public_base_url=_resolve_public_base_url(request),
    ),
  )
  _track_task(task)
  return VTONGenerateResponse(job_id=job.id, status=job.status)


@app.get("/api/v1/vton/jobs/{job_id}", response_model=VTONJobResponse)
@app.get("/api/v1/jobs/{job_id}", response_model=VTONJobResponse)
async def get_vton_job(
  job_id: str,
  db: Session = Depends(get_db_session),
) -> VTONJobResponse:
  job = db.get(GenerationJob, job_id)
  if job is None:
    raise HTTPException(status_code=404, detail="Generation job not found.")

  return VTONJobResponse(
    id=job.id,
    status=job.status,
    result_url=job.result_url,
    result_image_url=job.result_url,
    error_message=job.error_message,
    created_at=job.created_at,
  )


@app.post("/api/image/background-remove")
async def background_remove(file: UploadFile = File(...)) -> dict[str, Any]:
  image_bytes = await file.read()
  if not image_bytes:
    return {
      "success": False,
      "background_removed": False,
      "image_data_url": "",
      "error": "Empty image payload.",
    }

  result = await background_service.remove_background(
    image_bytes=image_bytes,
    filename=file.filename or "upload.png",
    content_type=file.content_type or "image/png",
  )
  logger.info(
    "background_remove completed provider=%s background_removed=%s error=%s",
    result.provider,
    result.background_removed,
    result.error,
  )

  out_bytes = result.image_bytes if result.image_bytes else image_bytes
  out_type = result.content_type or (file.content_type or "image/png")
  return {
    "success": True,
    "background_removed": result.background_removed,
    "provider": result.provider,
    "image_data_url": to_data_url(out_bytes, out_type),
    "error": result.error,
  }


@app.post("/api/image/face-detect")
async def face_detect(file: UploadFile = File(...)) -> dict[str, Any]:
  image_bytes = await file.read()
  if not image_bytes:
    return {
      "success": False,
      "face_detected": False,
      "valid": False,
      "error": "Empty image payload.",
    }

  result = face_service.detect_face(image_bytes)
  logger.info(
    "face_detect completed success=%s face_detected=%s valid=%s error=%s",
    result.success,
    result.face_detected,
    result.valid,
    result.error,
  )
  cropped_data_url = (
    to_data_url(result.cropped_face_bytes, "image/jpeg")
    if result.cropped_face_bytes
    else ""
  )

  return {
    "success": result.success,
    "face_detected": result.face_detected,
    "face_count": result.face_count,
    "valid": result.valid,
    "confidence": result.confidence,
    "bbox": result.bbox,
    "metrics": result.metrics,
    "warnings": result.warnings,
    "cropped_face_data_url": cropped_data_url,
    "error": result.error,
  }


@app.post("/api/image/look-face-generate")
async def look_face_generate(
  request: Request,
  file: UploadFile = File(...),
  face_crop: UploadFile | None = File(default=None),
  face_metrics_json: str = Form(default="{}"),
) -> dict[str, Any]:
  original_bytes = await file.read()
  if not original_bytes:
    return {
      "success": False,
      "look_face_data_url": "",
      "error": "Empty image payload.",
    }

  face_crop_bytes = None
  if face_crop is not None:
    face_crop_bytes = await face_crop.read()
  if not face_crop_bytes:
    detection = face_service.detect_face(original_bytes)
    if detection.success and detection.face_detected and detection.cropped_face_bytes:
      face_crop_bytes = detection.cropped_face_bytes

  result = look_face_service.generate(
    original_image_bytes=original_bytes,
    face_crop_bytes=face_crop_bytes,
  )
  logger.info(
    "look_face_generate completed success=%s input_metrics_len=%s error=%s",
    result.success,
    len(face_metrics_json or ""),
    result.error,
  )

  if not result.success:
    return {
      "success": False,
      "look_face_url": "",
      "look_face_data_url": "",
      "error": result.error or "Look face generation failed.",
    }

  stored_asset = storage_service.save_upload(
    file_bytes=result.image_bytes,
    original_filename="look-face.png",
    content_type=result.content_type,
    base_url=_resolve_public_base_url(request),
  )

  return {
    "success": True,
    "look_face_url": stored_asset.public_url,
    "look_face_data_url": to_data_url(result.image_bytes, result.content_type),
    "error": result.error,
  }


def to_data_url(raw: bytes, mime_type: str) -> str:
  encoded = base64.b64encode(raw).decode("ascii")
  safe_mime = mime_type or "application/octet-stream"
  return f"data:{safe_mime};base64,{encoded}"


def _resolve_public_base_url(request: Request) -> str:
  request_base_url = str(request.base_url).rstrip("/")
  configured_base_url = settings.public_base_url

  if not configured_base_url:
    return request_base_url
  if _should_prefer_request_base_url(configured_base_url, request_base_url):
    return request_base_url
  return configured_base_url


def _should_prefer_request_base_url(configured_base_url: str, request_base_url: str) -> bool:
  try:
    configured_host = (urlparse(configured_base_url).hostname or "").strip().lower()
    request_host = (urlparse(request_base_url).hostname or "").strip().lower()
  except ValueError:
    return False

  if not configured_host or not request_host:
    return False
  if configured_host == request_host:
    return False

  return _is_local_network_host(configured_host)


def _is_local_network_host(host: str) -> bool:
  normalized_host = str(host or "").strip().lower()
  if normalized_host in {"localhost", "127.0.0.1", "::1", "0.0.0.0"}:
    return True

  try:
    address = ipaddress.ip_address(normalized_host)
  except ValueError:
    return False

  return address.is_private or address.is_loopback or address.is_link_local


def _resolve_database_driver(database_url: str) -> str:
  raw_value = (database_url or "").strip().lower()
  if not raw_value:
    return "unknown"
  if "://" not in raw_value:
    return "unknown"
  return raw_value.split("://", 1)[0]


def _normalize_upgrade_context(value: str | None) -> str:
  normalized = str(value or "").strip().lower()
  if normalized == "wardrobe":
    return "wardrobe"
  if normalized in {"ai_looks", "ai-looks", "ai"}:
    return "ai_looks"
  raise HTTPException(status_code=400, detail="Unsupported upgrade context.")


def _normalize_avatar_gender(value: str | None) -> str:
  return "male" if str(value or "").strip().lower() == "male" else "female"


def _track_task(task: asyncio.Task[Any]) -> None:
  app.state.vton_tasks.add(task)
  task.add_done_callback(app.state.vton_tasks.discard)


def _serialize_weather_context(payload: DailyLookWeatherContext) -> dict[str, Any]:
  return {
    "temperature_celsius": payload.temperature_celsius,
    "condition": payload.condition,
    "summary": payload.summary,
    "precipitation": payload.precipitation,
    "is_raining": payload.is_raining,
    "is_snowing": payload.is_snowing,
    "location": payload.location,
    "season": payload.season,
  }


def _to_pipeline_garment(payload: DailyLookGarmentInput) -> PipelineGarment:
  return PipelineGarment(
    garment_id=payload.garment_id.strip(),
    image_url=payload.image_url.strip(),
    category=payload.category.strip(),
    normalized_category=_normalize_garment_category(payload.category),
    name=str(payload.name or "").strip(),
    color=_normalize_daily_look_color(payload.color),
  )


def _normalize_daily_look_color(value: str | list[str] | None) -> str:
  if isinstance(value, list):
    return ", ".join(
      str(item).strip()
      for item in value
      if str(item).strip()
    )
  return str(value or "").strip()


def _normalize_garment_category(category: str | None) -> str:
  normalized = str(category or "").strip().lower()
  if normalized in {"dress", "dresses", "jumpsuit", "jumpsuits"}:
    return "dress"
  if normalized in {"bottom", "bottoms", "pants", "trousers", "jeans", "skirt", "shorts"}:
    return "bottom"
  if normalized in {"top", "tops", "shirt", "tshirt", "t-shirt", "blouse", "sweater", "hoodie"}:
    return "top"
  if normalized in {"outerwear", "coat", "jacket", "blazer", "parka"}:
    return "outerwear"
  if normalized in {"shoes", "sneakers", "boots", "heels"}:
    return "shoes"
  if normalized in {"hat", "beanie", "cap"}:
    return "hat"
  if normalized in {"bag", "handbag", "backpack"}:
    return "bag"
  if normalized in {"accessory", "accessories", "scarf", "jewelry", "belt"}:
    return "accessory"
  return "unknown"


def _build_full_pipeline(garment_type: str = "upper_body") -> FullLookPipelineService:
  """Build the pipeline. garment_type MUST come from the request, not from .env."""
  return FullLookPipelineService(
    base_gen=FalBaseGenerationProvider(
      api_key=settings.fal_key,
      model_id=settings.fal_base_gen_model_id,
      num_inference_steps=settings.fal_base_gen_steps,
      guidance_scale=settings.fal_base_gen_guidance,
    ),
    face_swap=FalFaceSwapProvider(
      api_key=settings.fal_key,
      model_id=settings.fal_face_swap_model_id,
      client_timeout_seconds=max(settings.fal_client_timeout_seconds, 600.0),
      start_timeout_seconds=max(settings.fal_start_timeout_seconds, 90.0),
    ),
    vton=FalVTONProvider(
      api_key=settings.fal_key,
      model_id=settings.fal_model_id,
      garment_type=garment_type,           # from request, not from .env
      num_inference_steps=settings.fal_num_inference_steps,
      guidance_scale=settings.fal_guidance_scale,
      output_format=settings.fal_output_format,
      enable_safety_checker=settings.fal_enable_safety_checker,
      client_timeout_seconds=settings.fal_client_timeout_seconds,
      start_timeout_seconds=settings.fal_start_timeout_seconds,
      remove_bg_api_key=settings.remove_bg_api_key,
    ),
    upscale=FalUpscaleProvider(
      api_key=settings.fal_key,
      model_id=settings.fal_upscale_model_id,
      scale=settings.fal_upscale_scale,
    ),
  )


def _build_daily_look_pipeline() -> FullLookPipelineService:
  return FullLookPipelineService(
    base_gen=FalBaseGenerationProvider(
      api_key=settings.fal_key,
      model_id=settings.fal_base_gen_model_id,
      num_inference_steps=settings.fal_base_gen_steps,
      guidance_scale=settings.fal_base_gen_guidance,
    ),
    face_swap=FalFaceSwapProvider(
      api_key=settings.fal_key,
      model_id=settings.fal_face_swap_model_id,
      client_timeout_seconds=max(settings.fal_client_timeout_seconds, 600.0),
      start_timeout_seconds=max(settings.fal_start_timeout_seconds, 90.0),
    ),
    vton=FalVTONProvider(
      api_key=settings.fal_key,
      model_id=settings.fal_model_id,
      garment_type=settings.fal_garment_type,
      num_inference_steps=settings.fal_num_inference_steps,
      guidance_scale=settings.fal_guidance_scale,
      output_format=settings.fal_output_format,
      enable_safety_checker=settings.fal_enable_safety_checker,
      client_timeout_seconds=settings.fal_client_timeout_seconds,
      start_timeout_seconds=settings.fal_start_timeout_seconds,
      remove_bg_api_key=settings.remove_bg_api_key,
    ),
    upscale=FalUpscaleProvider(
      api_key=settings.fal_key,
      model_id=settings.fal_upscale_model_id,
      scale=settings.fal_upscale_scale,
    ),
    prompt_builder=prompt_builder_service,
    reference_face_url_resolver=user_profile_service.get_reference_face_urls,
    input_reference_resolver=storage_service.resolve_provider_input_reference,
  )


def _build_vton_provider() -> AIGenerationProvider:
  if settings.ai_generation_provider == "fal":
    return FalVTONProvider(
      api_key=settings.fal_key,
      model_id=settings.fal_model_id,
      garment_type=settings.fal_garment_type,
      num_inference_steps=settings.fal_num_inference_steps,
      guidance_scale=settings.fal_guidance_scale,
      output_format=settings.fal_output_format,
      enable_safety_checker=settings.fal_enable_safety_checker,
      client_timeout_seconds=settings.fal_client_timeout_seconds,
      start_timeout_seconds=settings.fal_start_timeout_seconds,
    )

  if settings.ai_generation_provider == "replicate":
    return ReplicateVTONProvider(
      api_token=settings.replicate_api_token,
      model_ref=settings.replicate_model,
      user_image_input_name=settings.replicate_user_image_input_name,
      garment_image_input_name=settings.replicate_garment_image_input_name,
      garment_description_input_name=settings.replicate_garment_description_input_name,
      garment_description=settings.replicate_garment_description,
      extra_input=_load_replicate_extra_input(),
      wait_seconds=settings.replicate_wait_seconds,
    )

  return HuggingFaceVTONProvider(
    space_id=settings.hugging_face_space_id,
    api_name=settings.hugging_face_api_name,
    hf_token=settings.hugging_face_token,
    garment_description=settings.hugging_face_garment_description,
    request_timeout_seconds=settings.hugging_face_request_timeout_seconds,
  )


def _load_replicate_extra_input() -> dict[str, Any]:
  raw_value = settings.replicate_extra_input_json.strip()
  if not raw_value:
    return {}

  try:
    parsed = json.loads(raw_value)
  except json.JSONDecodeError:
    logger.warning("replicate_extra_input_json_invalid value=%s", raw_value)
    return {}

  if not isinstance(parsed, dict):
    logger.warning("replicate_extra_input_json_not_object value=%s", raw_value)
    return {}

  return parsed
