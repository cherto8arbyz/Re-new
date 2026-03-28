from dataclasses import dataclass
import logging

import cv2
import mediapipe as mp
import numpy as np

logger = logging.getLogger("image-pipeline.face")


@dataclass
class FaceDetectionResult:
  success: bool
  face_detected: bool
  valid: bool
  confidence: float
  bbox: dict[str, float] | None
  metrics: dict[str, float | int]
  warnings: list[str]
  cropped_face_bytes: bytes
  error: str | None = None


class FaceDetectionService:
  def __init__(self):
    self._mp_face = mp.solutions.face_detection
    self.min_face_area_ratio = 0.08
    self.blur_warning_threshold = 60.0

  def detect_face(self, image_bytes: bytes) -> FaceDetectionResult:
    image = self._decode_image(image_bytes)
    if image is None:
      logger.warning("face_detection_failed reason=decode_error")
      return FaceDetectionResult(
        success=False,
        face_detected=False,
        valid=False,
        confidence=0.0,
        bbox=None,
        metrics={},
        warnings=[],
        cropped_face_bytes=b"",
        error="Failed to decode image.",
      )

    image_h, image_w = image.shape[:2]
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    with self._mp_face.FaceDetection(model_selection=1, min_detection_confidence=0.5) as detector:
      result = detector.process(rgb)

    detections = result.detections if result and result.detections else []
    if not detections:
      logger.warning("face_detection_failed reason=no_face_detected")
      return FaceDetectionResult(
        success=True,
        face_detected=False,
        valid=False,
        confidence=0.0,
        bbox=None,
        metrics={
          "faceCount": 0,
          "faceAreaRatio": 0.0,
          "blurScore": self._blur_score(image),
          "occlusionScore": 0.0,
          "imageWidth": image_w,
          "imageHeight": image_h,
        },
        warnings=[],
        cropped_face_bytes=b"",
        error="Face not detected clearly. Please upload a better photo.",
      )

    best = max(detections, key=lambda d: float(d.score[0] if d.score else 0.0))
    confidence = float(best.score[0] if best.score else 0.0)
    rel_box = best.location_data.relative_bounding_box
    bbox = self._normalize_bbox(rel_box.xmin, rel_box.ymin, rel_box.width, rel_box.height)

    face_area_ratio = float(bbox["width"] * bbox["height"])
    blur_score = self._blur_score(image)
    warnings: list[str] = []
    if blur_score < self.blur_warning_threshold:
      warnings.append("image_blurry")
      logger.info(
        "face_detection_warning reason=image_blurry blur_score=%s threshold=%s",
        blur_score,
        self.blur_warning_threshold,
      )

    if face_area_ratio < self.min_face_area_ratio:
      logger.warning(
        "face_detection_failed reason=face_too_small area_ratio=%s threshold=%s",
        face_area_ratio,
        self.min_face_area_ratio,
      )
      return FaceDetectionResult(
        success=True,
        face_detected=True,
        valid=False,
        confidence=confidence,
        bbox=bbox,
        metrics={
          "faceCount": len(detections),
          "faceAreaRatio": face_area_ratio,
          "blurScore": blur_score,
          "occlusionScore": 0.0,
          "imageWidth": image_w,
          "imageHeight": image_h,
        },
        warnings=warnings,
        cropped_face_bytes=b"",
        error="Face not detected clearly. Please upload a better photo.",
      )

    cropped = self._crop_face(image, bbox)
    if not cropped:
      logger.warning("face_detection_failed reason=crop_failed")
      return FaceDetectionResult(
        success=True,
        face_detected=True,
        valid=False,
        confidence=confidence,
        bbox=bbox,
        metrics={
          "faceCount": len(detections),
          "faceAreaRatio": face_area_ratio,
          "blurScore": blur_score,
          "occlusionScore": 0.0,
          "imageWidth": image_w,
          "imageHeight": image_h,
        },
        warnings=warnings,
        cropped_face_bytes=b"",
        error="Face not detected clearly. Please upload a better photo.",
      )

    logger.info(
      "face_detection_success confidence=%s face_area_ratio=%s warnings=%s",
      confidence,
      face_area_ratio,
      ",".join(warnings) if warnings else "none",
    )
    return FaceDetectionResult(
      success=True,
      face_detected=True,
      valid=True,
      confidence=confidence,
      bbox=bbox,
      metrics={
        "faceCount": len(detections),
        "faceAreaRatio": face_area_ratio,
        "blurScore": blur_score,
        "occlusionScore": 0.0,
        "imageWidth": image_w,
        "imageHeight": image_h,
      },
      warnings=warnings,
      cropped_face_bytes=cropped,
      error=None,
    )

  def _decode_image(self, image_bytes: bytes) -> np.ndarray | None:
    if not image_bytes:
      return None
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)

  def _blur_score(self, image: np.ndarray) -> float:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    return float(lap.var())

  def _normalize_bbox(self, x: float, y: float, w: float, h: float) -> dict[str, float]:
    x = max(0.0, min(1.0, float(x)))
    y = max(0.0, min(1.0, float(y)))
    w = max(0.0, min(1.0, float(w)))
    h = max(0.0, min(1.0, float(h)))
    if x + w > 1.0:
      w = max(0.0, 1.0 - x)
    if y + h > 1.0:
      h = max(0.0, 1.0 - y)
    return {"x": x, "y": y, "width": w, "height": h}

  def _crop_face(self, image: np.ndarray, bbox: dict[str, float]) -> bytes:
    h, w = image.shape[:2]
    x = int(bbox["x"] * w)
    y = int(bbox["y"] * h)
    bw = int(bbox["width"] * w)
    bh = int(bbox["height"] * h)

    margin = 0.22
    ex = max(0, int(x - bw * margin))
    ey = max(0, int(y - bh * margin))
    ew = min(w - ex, int(bw * (1 + margin * 2)))
    eh = min(h - ey, int(bh * (1 + margin * 2)))
    if ew <= 0 or eh <= 0:
      return b""

    crop = image[ey : ey + eh, ex : ex + ew]
    resized = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA)
    ok, encoded = cv2.imencode(".jpg", resized, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    return bytes(encoded.tobytes()) if ok else b""
