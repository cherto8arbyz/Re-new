import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
PROJECT_ROOT_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(PROJECT_ROOT_DIR / ".env")
DEFAULT_DATABASE_URL = f"sqlite:///{(APP_DIR / 'data' / 'renew_mvp.db').as_posix()}"
DEFAULT_STRIPE_UPGRADE_PAYMENT_LINK_URL = "https://buy.stripe.com/test_9B65kw1kzgrG8WB3Xu04800"


@dataclass(frozen=True)
class Settings:
  ai_generation_provider: str = os.getenv("AI_GENERATION_PROVIDER", "huggingface").strip().lower() or "huggingface"
  remove_bg_api_key: str = os.getenv("REMOVE_BG_API_KEY", "").strip()
  clipdrop_api_key: str = os.getenv("CLIPDROP_API_KEY", "").strip()
  gemini_api_key: str = os.getenv("GEMINI_API_KEY", "").strip()
  background_removal_provider: str = os.getenv("BACKGROUND_REMOVAL_PROVIDER", "remove_bg").strip().lower() or "remove_bg"
  database_url: str = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL).strip()
  public_base_url: str = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
  supabase_url: str = (
    os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    or os.getenv("EXPO_PUBLIC_SUPABASE_URL", "").strip().rstrip("/")
  )
  supabase_anon_key: str = (
    os.getenv("SUPABASE_ANON_KEY", "").strip()
    or os.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "").strip()
  )
  hugging_face_space_id: str = os.getenv("HUGGING_FACE_SPACE_ID", "yisol/IDM-VTON").strip() or "yisol/IDM-VTON"
  hugging_face_api_name: str = os.getenv("HUGGING_FACE_API_NAME", "/tryon").strip() or "/tryon"
  hugging_face_token: str = os.getenv("HUGGING_FACE_TOKEN", "").strip()
  hugging_face_garment_description: str = os.getenv("HUGGING_FACE_GARMENT_DESCRIPTION", "").strip()
  hugging_face_request_timeout_seconds: float = float(os.getenv("HUGGING_FACE_REQUEST_TIMEOUT_SECONDS", "180"))
  fal_key: str = os.getenv("FAL_KEY", "").strip()
  fal_model_id: str = os.getenv("FAL_MODEL_ID", "fal-ai/leffa/virtual-tryon").strip() or "fal-ai/leffa/virtual-tryon"
  fal_garment_type: str = os.getenv("FAL_GARMENT_TYPE", "upper_body").strip().lower() or "upper_body"
  fal_num_inference_steps: int = int(os.getenv("FAL_NUM_INFERENCE_STEPS", "50"))
  fal_guidance_scale: float = float(os.getenv("FAL_GUIDANCE_SCALE", "2.5"))
  fal_output_format: str = os.getenv("FAL_OUTPUT_FORMAT", "png").strip().lower() or "png"
  fal_enable_safety_checker: bool = os.getenv("FAL_ENABLE_SAFETY_CHECKER", "true").strip().lower() in {"1", "true", "yes", "on"}
  fal_client_timeout_seconds: float = float(os.getenv("FAL_CLIENT_TIMEOUT_SECONDS", "300"))
  fal_start_timeout_seconds: float = float(os.getenv("FAL_START_TIMEOUT_SECONDS", "90"))
  # Step 1 — Base mannequin generation
  fal_base_gen_model_id: str = os.getenv("FAL_BASE_GEN_MODEL_ID", "fal-ai/flux/dev").strip() or "fal-ai/flux/dev"
  fal_base_gen_steps: int = int(os.getenv("FAL_BASE_GEN_STEPS", "28"))
  fal_base_gen_guidance: float = float(os.getenv("FAL_BASE_GEN_GUIDANCE", "3.5"))
  # Step 2 — Face swap
  fal_face_swap_model_id: str = os.getenv("FAL_FACE_SWAP_MODEL_ID", "fal-ai/face-swap").strip() or "fal-ai/face-swap"
  # Step 4 — Upscale (fal-ai/real-esrgan does NOT exist; use fal-ai/esrgan)
  fal_upscale_model_id: str = os.getenv("FAL_UPSCALE_MODEL_ID", "fal-ai/esrgan").strip() or "fal-ai/esrgan"
  fal_upscale_scale: int = int(os.getenv("FAL_UPSCALE_SCALE", "2"))
  replicate_api_token: str = os.getenv("REPLICATE_API_TOKEN", "").strip()
  replicate_model: str = os.getenv("REPLICATE_MODEL", "").strip()
  replicate_user_image_input_name: str = os.getenv("REPLICATE_USER_IMAGE_INPUT_NAME", "human_img").strip() or "human_img"
  replicate_garment_image_input_name: str = os.getenv("REPLICATE_GARMENT_IMAGE_INPUT_NAME", "garm_img").strip() or "garm_img"
  replicate_garment_description_input_name: str = os.getenv("REPLICATE_GARMENT_DESCRIPTION_INPUT_NAME", "garment_des").strip() or "garment_des"
  replicate_garment_description: str = os.getenv("REPLICATE_GARMENT_DESCRIPTION", "").strip()
  replicate_extra_input_json: str = os.getenv("REPLICATE_EXTRA_INPUT_JSON", "{}").strip() or "{}"
  replicate_wait_seconds: int = int(os.getenv("REPLICATE_WAIT_SECONDS", "60"))
  stripe_secret_key: str = os.getenv("STRIPE_SECRET_KEY", "").strip()
  stripe_api_base_url: str = os.getenv("STRIPE_API_BASE_URL", "https://api.stripe.com").strip().rstrip("/") or "https://api.stripe.com"
  stripe_wardrobe_upgrade_payment_link_url: str = (
    os.getenv("STRIPE_WARDROBE_UPGRADE_PAYMENT_LINK_URL", DEFAULT_STRIPE_UPGRADE_PAYMENT_LINK_URL).strip().rstrip("/")
    or DEFAULT_STRIPE_UPGRADE_PAYMENT_LINK_URL
  )
  stripe_ai_looks_upgrade_payment_link_url: str = (
    os.getenv("STRIPE_AI_LOOKS_UPGRADE_PAYMENT_LINK_URL", "").strip().rstrip("/")
    or os.getenv("STRIPE_WARDROBE_UPGRADE_PAYMENT_LINK_URL", DEFAULT_STRIPE_UPGRADE_PAYMENT_LINK_URL).strip().rstrip("/")
    or DEFAULT_STRIPE_UPGRADE_PAYMENT_LINK_URL
  )
  host: str = os.getenv("HOST", "127.0.0.1").strip() or "127.0.0.1"
  port: int = int(os.getenv("PORT", "8000"))


settings = Settings()
