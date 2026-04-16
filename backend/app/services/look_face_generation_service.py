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
    target_w = 768
    target_h = 1080

    base = np.zeros((target_h, target_w, 3), dtype=np.uint8)
    for y in range(target_h):
      blend = y / max(1, target_h - 1)
      r = int((248 * (1 - blend)) + (224 * blend))
      g = int((242 * (1 - blend)) + (220 * blend))
      b = int((246 * (1 - blend)) + (236 * blend))
      base[y, :, :] = (b, g, r)

    ambient = np.zeros_like(base)
    cv2.circle(ambient, (int(target_w * 0.78), int(target_h * 0.16)), int(target_w * 0.16), (222, 201, 255), -1)
    cv2.circle(ambient, (int(target_w * 0.22), int(target_h * 0.78)), int(target_w * 0.15), (239, 225, 255), -1)
    ambient = cv2.GaussianBlur(ambient, (0, 0), sigmaX=70, sigmaY=70)
    base = cv2.addWeighted(base, 1.0, ambient, 0.26, 0)

    shadow = np.zeros_like(base)
    cv2.ellipse(
      shadow,
      (target_w // 2, int(target_h * 0.88)),
      (int(target_w * 0.16), int(target_h * 0.03)),
      0,
      0,
      360,
      (86, 74, 108),
      -1,
    )
    shadow = cv2.GaussianBlur(shadow, (0, 0), sigmaX=28, sigmaY=18)
    base = cv2.addWeighted(base, 1.0, shadow, 0.22, 0)

    silhouette = np.zeros_like(base)
    shell_color = (110, 97, 143)
    shell_highlight = (133, 118, 168)

    cv2.ellipse(silhouette, (target_w // 2, int(target_h * 0.33)), (int(target_w * 0.19), int(target_h * 0.085)), 0, 0, 360, shell_color, -1)
    cv2.rectangle(
      silhouette,
      (int(target_w * 0.33), int(target_h * 0.34)),
      (int(target_w * 0.67), int(target_h * 0.62)),
      shell_color,
      -1,
    )
    cv2.ellipse(silhouette, (target_w // 2, int(target_h * 0.62)), (int(target_w * 0.17), int(target_h * 0.08)), 0, 0, 360, shell_color, -1)
    cv2.ellipse(silhouette, (int(target_w * 0.29), int(target_h * 0.44)), (int(target_w * 0.07), int(target_h * 0.19)), 8, 0, 360, shell_color, -1)
    cv2.ellipse(silhouette, (int(target_w * 0.71), int(target_h * 0.44)), (int(target_w * 0.07), int(target_h * 0.19)), -8, 0, 360, shell_color, -1)
    cv2.ellipse(silhouette, (int(target_w * 0.43), int(target_h * 0.79)), (int(target_w * 0.06), int(target_h * 0.18)), 3, 0, 360, shell_color, -1)
    cv2.ellipse(silhouette, (int(target_w * 0.57), int(target_h * 0.79)), (int(target_w * 0.06), int(target_h * 0.18)), -3, 0, 360, shell_color, -1)
    cv2.ellipse(silhouette, (int(target_w * 0.43), int(target_h * 0.93)), (int(target_w * 0.07), int(target_h * 0.025)), 0, 0, 360, shell_color, -1)
    cv2.ellipse(silhouette, (int(target_w * 0.57), int(target_h * 0.93)), (int(target_w * 0.07), int(target_h * 0.025)), 0, 0, 360, shell_color, -1)
    cv2.ellipse(silhouette, (target_w // 2, int(target_h * 0.46)), (int(target_w * 0.13), int(target_h * 0.19)), 0, 0, 360, shell_highlight, -1)
    silhouette = cv2.GaussianBlur(silhouette, (0, 0), sigmaX=4, sigmaY=4)
    base = cv2.addWeighted(base, 1.0, silhouette, 0.62, 0)

    head_size = (int(target_w * 0.20), int(target_h * 0.15))
    face = self._prepare_face_crop(source, head_size[0], head_size[1])
    face_x = (target_w - head_size[0]) // 2
    face_y = int(target_h * 0.10)
    self._composite_face(base, face, face_x, face_y)

    rim = np.zeros_like(base)
    cv2.ellipse(
      rim,
      (target_w // 2, face_y + head_size[1] // 2),
      (int(head_size[0] * 0.60), int(head_size[1] * 0.56)),
      0,
      0,
      360,
      (255, 255, 255),
      6,
    )
    rim = cv2.GaussianBlur(rim, (0, 0), sigmaX=3, sigmaY=3)
    base = cv2.addWeighted(base, 1.0, rim, 0.38, 0)

    return base

  def _prepare_face_crop(self, source: np.ndarray, target_w: int, target_h: int) -> np.ndarray:
    src_h, src_w = source.shape[:2]
    if src_h <= 0 or src_w <= 0:
      return np.zeros((target_h, target_w, 3), dtype=np.uint8)

    crop_size = min(src_h, src_w)
    x = max(0, (src_w - crop_size) // 2)
    y = max(0, (src_h - crop_size) // 2)
    cropped = source[y:y + crop_size, x:x + crop_size]
    resized = cv2.resize(cropped, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
    return cv2.convertScaleAbs(resized, alpha=1.06, beta=4)

  def _composite_face(self, canvas: np.ndarray, face: np.ndarray, x: int, y: int) -> None:
    face_h, face_w = face.shape[:2]
    mask = np.zeros((face_h, face_w), dtype=np.float32)
    cv2.ellipse(
      mask,
      (face_w // 2, int(face_h * 0.52)),
      (int(face_w * 0.40), int(face_h * 0.46)),
      0,
      0,
      360,
      1.0,
      -1,
    )
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=5, sigmaY=5)
    mask3 = np.dstack([mask, mask, mask]).astype(np.float32)

    roi = canvas[y:y + face_h, x:x + face_w].astype(np.float32)
    blended = (face.astype(np.float32) * mask3) + (roi * (1.0 - mask3))
    canvas[y:y + face_h, x:x + face_w] = np.clip(blended, 0, 255).astype(np.uint8)
