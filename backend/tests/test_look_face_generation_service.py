from __future__ import annotations

import cv2
import numpy as np

from app.services.look_face_generation_service import LookFaceGenerationService


def test_look_face_generation_returns_avatar_base_png() -> None:
  image = np.full((420, 320, 3), 220, dtype=np.uint8)
  cv2.circle(image, (160, 120), 62, (170, 180, 210), -1)
  ok, encoded = cv2.imencode(".jpg", image)
  assert ok

  service = LookFaceGenerationService()
  result = service.generate(original_image_bytes=encoded.tobytes())

  assert result.success is True
  assert result.content_type == "image/png"
  assert len(result.image_bytes) > 0
