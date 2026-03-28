"""Garment image preprocessing for VTON pipeline.

Responsibilities:
  1. Auto-remove background from garment images (required by leffa/IDM-VTON).
  2. Resize to VTON-friendly dimensions.
  3. Convert to PNG (transparent background after BG removal).

fal-ai/leffa requires:
  - garment_image_url: PNG with white OR transparent background (no scene background).
  - human_image_url: any clear full-body photo.

If garment has a background → leffa returns 500. This service prevents that.
"""
from __future__ import annotations

import io
import logging
import mimetypes
from pathlib import Path
from typing import Any

import httpx

try:
    from PIL import Image as PilImage
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False

logger = logging.getLogger("image-pipeline.garment_preprocessor")

REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg"

# leffa works best at these dimensions
VTON_TARGET_WIDTH = 768
VTON_TARGET_HEIGHT = 1024


class GarmentPreprocessor:
    """Strips background from garment images and resizes for VTON."""

    def __init__(self, remove_bg_api_key: str = "") -> None:
        self.remove_bg_api_key = (remove_bg_api_key or "").strip()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def preprocess_garment(self, image_path: Path, fal_client: Any) -> str:
        """Normalize + remove background + upload to fal.ai CDN.

        Steps:
          1. Resize to VTON_TARGET_WIDTH x VTON_TARGET_HEIGHT (keeps aspect ratio, pads).
          2. Convert to PNG (HEIC/HEIF/BMP → PNG, required by leffa).
          3. Remove background via remove.bg.
          4. Upload to fal.ai CDN.

        Returns a fal.ai CDN URL ready for use in VTON payload.
        Falls back gracefully if any step fails.
        """
        if not image_path.exists():
            raise FileNotFoundError(f"Garment file not found: {image_path}")

        original_bytes = image_path.read_bytes()
        content_type = mimetypes.guess_type(image_path.name)[0] or "image/png"

        # Step 1+2: resize and normalise format
        normalized_bytes, content_type = self._normalize_image(original_bytes, content_type)

        # Step 3: remove background
        processed_bytes, processed_ct = self._remove_background(normalized_bytes, content_type)

        # Upload processed (or original) bytes to fal.ai CDN
        upload_path = self._save_temp(image_path, processed_bytes, processed_ct)
        try:
            cdn_url = str(fal_client.upload_file(upload_path))
            logger.info("garment_uploaded_to_cdn path=%s url=%s", upload_path, cdn_url)
            return cdn_url
        finally:
            # Clean up temp file
            if upload_path != image_path:
                try:
                    upload_path.unlink(missing_ok=True)
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # Image normalization (resize + format)
    # ------------------------------------------------------------------

    def _normalize_image(self, image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
        """Resize to VTON dimensions and convert to PNG.

        leffa works best with ~768x1024 images.
        HEIC/BMP/TIFF formats are unsupported — convert to PNG.
        Returns original bytes if Pillow is not available or conversion fails.
        """
        if not _PIL_AVAILABLE:
            return image_bytes, content_type

        try:
            img = PilImage.open(io.BytesIO(image_bytes))
            # Convert to RGBA so we can save as PNG with transparency support
            img = img.convert("RGBA")

            # Resize: fit inside VTON_TARGET_WIDTH x VTON_TARGET_HEIGHT, preserve aspect ratio
            img.thumbnail((VTON_TARGET_WIDTH, VTON_TARGET_HEIGHT), PilImage.LANCZOS)

            # Pad to exact dimensions with white background (required for BG removal to work)
            padded = PilImage.new("RGBA", (VTON_TARGET_WIDTH, VTON_TARGET_HEIGHT), (255, 255, 255, 255))
            x_offset = (VTON_TARGET_WIDTH - img.width) // 2
            y_offset = (VTON_TARGET_HEIGHT - img.height) // 2
            padded.paste(img, (x_offset, y_offset))

            buf = io.BytesIO()
            padded.save(buf, format="PNG")
            normalized = buf.getvalue()
            logger.info(
                "garment_normalized orig_size=%d norm_size=%d",
                len(image_bytes),
                len(normalized),
            )
            return normalized, "image/png"
        except Exception as exc:
            logger.warning("garment_normalize_failed err=%s — using original", exc)
            return image_bytes, content_type

    # ------------------------------------------------------------------
    # Background removal
    # ------------------------------------------------------------------

    def _remove_background(self, image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
        """Call remove.bg API. Returns (processed_bytes, content_type).

        On any failure returns the original bytes unchanged (graceful degradation).
        """
        if not self.remove_bg_api_key:
            logger.warning("garment_bg_removal_skipped reason=no_api_key")
            return image_bytes, content_type

        try:
            response = httpx.post(
                REMOVE_BG_URL,
                headers={"X-Api-Key": self.remove_bg_api_key},
                files={"image_file": ("garment", image_bytes, content_type)},
                data={"size": "auto", "format": "png"},
                timeout=30.0,
            )
            if response.status_code == 200:
                logger.info("garment_bg_removed size_before=%d size_after=%d", len(image_bytes), len(response.content))
                return response.content, "image/png"
            else:
                logger.warning(
                    "garment_bg_removal_failed status=%d body=%.200s",
                    response.status_code,
                    response.text,
                )
                return image_bytes, content_type
        except Exception as exc:
            logger.warning("garment_bg_removal_error err=%s", exc)
            return image_bytes, content_type

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _save_temp(self, original_path: Path, data: bytes, content_type: str) -> Path:
        """Save processed bytes next to the original with _nobg suffix."""
        suffix = ".png" if content_type == "image/png" else original_path.suffix
        temp_path = original_path.with_name(original_path.stem + "_nobg" + suffix)
        temp_path.write_bytes(data)
        return temp_path

    def has_bg_removal(self) -> bool:
        return bool(self.remove_bg_api_key)
