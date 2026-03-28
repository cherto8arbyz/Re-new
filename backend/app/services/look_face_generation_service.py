from dataclasses import dataclass
import logging

import cv2
import numpy as np


logger = logging.getLogger("image-pipeline.look-face")


@dataclass
class LookFaceGenerationResult:
  success: bool
  image_bytes: bytes
  content_type: str
  error: str | None = None


class LookFaceGenerationService:
  def generate(
    self,
    original_image_bytes: bytes,
    face_crop_bytes: bytes | None = None,
  ) -> LookFaceGenerationResult:
    source = self._decode(face_crop_bytes) if face_crop_bytes else None
    if source is None:
      source = self._decode(original_image_bytes)
    if source is None:
      return LookFaceGenerationResult(
        success=False,
        image_bytes=b"",
        content_type="image/png",
        error="Failed to decode look-face input image.",
      )

    try:
      portrait = self._render_portrait(source)
      ok, encoded = cv2.imencode(".png", portrait)
      if not ok:
        raise ValueError("Failed to encode look-face asset.")
      return LookFaceGenerationResult(
        success=True,
        image_bytes=encoded.tobytes(),
        content_type="image/png",
        error=None,
      )
    except Exception as exc:
      logger.exception("look_face_generation_failed")
      return LookFaceGenerationResult(
        success=False,
        image_bytes=b"",
        content_type="image/png",
        error=f"Look face normalization failed: {exc}",
      )

  def _decode(self, image_bytes: bytes | None) -> np.ndarray | None:
    if not image_bytes:
      return None
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return image

  def _render_portrait(self, source: np.ndarray) -> np.ndarray:
    target_w = 640
    target_h = 800

    base = np.zeros((target_h, target_w, 3), dtype=np.uint8)
    for y in range(target_h):
      blend = y / max(1, target_h - 1)
      r = int((232 * (1 - blend)) + (156 * blend))
      g = int((236 * (1 - blend)) + (164 * blend))
      b = int((242 * (1 - blend)) + (173 * blend))
      base[y, :, :] = (b, g, r)

    src_h, src_w = source.shape[:2]
    scale = min((target_w * 0.78) / max(1, src_w), (target_h * 0.72) / max(1, src_h))
    scaled_w = max(1, int(src_w * scale))
    scaled_h = max(1, int(src_h * scale))
    resized = cv2.resize(source, (scaled_w, scaled_h), interpolation=cv2.INTER_LANCZOS4)
    resized = cv2.convertScaleAbs(resized, alpha=1.06, beta=6)

    x = (target_w - scaled_w) // 2
    y = int(target_h * 0.12)
    y = min(max(0, y), max(0, target_h - scaled_h))

    mask = np.zeros((scaled_h, scaled_w), dtype=np.float32)
    center = (scaled_w // 2, int(scaled_h * 0.46))
    axes = (int(scaled_w * 0.43), int(scaled_h * 0.54))
    cv2.ellipse(mask, center, axes, 0, 0, 360, color=1.0, thickness=-1)
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=22, sigmaY=22)
    mask = np.clip(mask, 0.0, 1.0)
    mask3 = np.dstack([mask, mask, mask]).astype(np.float32)

    roi = base[y:y + scaled_h, x:x + scaled_w].astype(np.float32)
    fg = resized.astype(np.float32)
    blended = (fg * mask3) + (roi * (1.0 - mask3))
    base[y:y + scaled_h, x:x + scaled_w] = np.clip(blended, 0, 255).astype(np.uint8)

    glow = np.zeros_like(base)
    cv2.ellipse(
      glow,
      (target_w // 2, int(target_h * 0.2)),
      (int(target_w * 0.34), int(target_h * 0.16)),
      0,
      0,
      360,
      color=(255, 255, 255),
      thickness=-1,
    )
    glow = cv2.GaussianBlur(glow, (0, 0), sigmaX=36, sigmaY=36)
    base = cv2.addWeighted(base, 1.0, glow, 0.12, 0)

    return base
