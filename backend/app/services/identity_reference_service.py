from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .face_detection_service import FaceDetectionService
from .local_storage_service import LocalStorageService


REQUIRED_REFERENCE_PHOTO_COUNT = 5
MAX_REFERENCE_FILE_BYTES = 5 * 1024 * 1024
WEBP_QUALITY = 82
ALLOWED_IMAGE_CONTENT_TYPES = {
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
}
ALLOWED_IMAGE_EXTENSIONS = {
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
}


@dataclass(frozen=True)
class IdentityReferenceUploadItem:
  index: int
  file_bytes: bytes
  filename: str
  content_type: str


@dataclass(frozen=True)
class IdentityReferenceUploadResult:
  uploaded_count: int
  reference_urls: list[str]


class IdentityReferenceValidationError(ValueError):
  def __init__(self, file_index: int, detail: str, error_code: str = "identity_validation_failed") -> None:
    super().__init__(detail)
    self.file_index = file_index
    self.detail = detail
    self.error_code = error_code


class IdentityReferenceCountError(ValueError):
  def __init__(self, detail: str) -> None:
    super().__init__(detail)
    self.detail = detail


class IdentityReferenceService:
  def __init__(
    self,
    face_detection_service: FaceDetectionService,
    storage_service: LocalStorageService,
    required_photo_count: int = REQUIRED_REFERENCE_PHOTO_COUNT,
    max_file_bytes: int = MAX_REFERENCE_FILE_BYTES,
    webp_quality: int = WEBP_QUALITY,
  ) -> None:
    self.face_detection_service = face_detection_service
    self.storage_service = storage_service
    self.required_photo_count = required_photo_count
    self.max_file_bytes = max_file_bytes
    self.webp_quality = max(1, min(100, int(webp_quality)))

  def validate_and_store(
    self,
    user_id: str,
    files: list[IdentityReferenceUploadItem],
    base_url: str,
  ) -> IdentityReferenceUploadResult:
    safe_user_id = str(user_id or "").strip()
    if not safe_user_id:
      raise ValueError("Authenticated user id is required.")

    self._validate_file_count(len(files))

    prepared_images: list[bytes] = []
    for file in files:
      self._validate_file_payload(file)
      face_result = self.face_detection_service.detect_face(file.file_bytes)

      if not face_result.success:
        raise IdentityReferenceValidationError(
          file_index=file.index,
          detail=face_result.error or "Image could not be processed.",
          error_code="identity_image_decode_failed",
        )
      if face_result.face_count == 0:
        raise IdentityReferenceValidationError(
          file_index=file.index,
          detail="No face detected. Upload a photo with one clearly visible face.",
          error_code="identity_face_not_found",
        )
      if face_result.face_count > 1:
        raise IdentityReferenceValidationError(
          file_index=file.index,
          detail="Multiple faces detected. Upload a photo with only your face.",
          error_code="identity_multiple_faces_detected",
        )
      if not face_result.valid:
        raise IdentityReferenceValidationError(
          file_index=file.index,
          detail=face_result.error or "Face is not clear enough. Upload a sharper close-up photo.",
          error_code="identity_face_not_clear",
        )

      prepared_images.append(self._convert_image_to_webp(file))

    stored_assets = self.storage_service.replace_identity_references(
      user_id=safe_user_id,
      image_bytes_list=prepared_images,
      base_url=base_url,
    )
    return IdentityReferenceUploadResult(
      uploaded_count=len(stored_assets),
      reference_urls=[asset.public_url for asset in stored_assets],
    )

  def _validate_file_count(self, count: int) -> None:
    if count != self.required_photo_count:
      raise IdentityReferenceCountError(
        f"Exactly {self.required_photo_count} identity photos are required."
      )

  def _validate_file_payload(self, file: IdentityReferenceUploadItem) -> None:
    if not file.file_bytes:
      raise IdentityReferenceValidationError(
        file_index=file.index,
        detail="Empty image payload.",
        error_code="identity_empty_file",
      )
    if len(file.file_bytes) > self.max_file_bytes:
      raise IdentityReferenceValidationError(
        file_index=file.index,
        detail="Image file is too large. Compress the photo and try again.",
        error_code="identity_file_too_large",
      )

    content_type = file.content_type.strip().lower()
    extension = Path(file.filename or "").suffix.lower()
    unsupported_content_type = bool(content_type) and content_type not in ALLOWED_IMAGE_CONTENT_TYPES
    unsupported_extension = bool(extension) and extension not in ALLOWED_IMAGE_EXTENSIONS
    if unsupported_content_type and unsupported_extension:
      raise IdentityReferenceValidationError(
        file_index=file.index,
        detail="Unsupported image format.",
        error_code="identity_unsupported_format",
      )
    if not content_type and unsupported_extension:
      raise IdentityReferenceValidationError(
        file_index=file.index,
        detail="Unsupported image format.",
        error_code="identity_unsupported_format",
      )

  def _convert_image_to_webp(self, file: IdentityReferenceUploadItem) -> bytes:
    image = self._decode_image(file.file_bytes)
    if image is None:
      raise IdentityReferenceValidationError(
        file_index=file.index,
        detail="Image could not be processed.",
        error_code="identity_image_decode_failed",
      )

    ok, encoded = cv2.imencode(".webp", image, [int(getattr(cv2, "IMWRITE_WEBP_QUALITY", 64)), self.webp_quality])
    if not ok:
      raise IdentityReferenceValidationError(
        file_index=file.index,
        detail="Image could not be converted to WebP.",
        error_code="identity_webp_conversion_failed",
      )
    return bytes(encoded.tobytes())

  def _decode_image(self, image_bytes: bytes) -> np.ndarray | None:
    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    return cv2.imdecode(buffer, cv2.IMREAD_COLOR)
