from __future__ import annotations

from collections.abc import Iterator

import cv2
from fastapi.testclient import TestClient
import numpy as np
import pytest

import app.main as main_module
from app.auth import AuthenticatedUser, get_authenticated_user
from app.main import app
from app.services.face_detection_service import FaceDetectionResult
from app.services.identity_reference_service import IdentityReferenceService
from app.services.local_storage_service import LocalStorageService


def _build_test_image_bytes() -> bytes:
  image = np.full((32, 32, 3), 200, dtype=np.uint8)
  ok, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
  assert ok
  return bytes(encoded.tobytes())


def _valid_face_result() -> FaceDetectionResult:
  return FaceDetectionResult(
    success=True,
    face_detected=True,
    face_count=1,
    valid=True,
    confidence=0.95,
    bbox={"x": 0.2, "y": 0.2, "width": 0.4, "height": 0.4},
    metrics={
      "faceCount": 1,
      "faceAreaRatio": 0.16,
      "blurScore": 120.0,
      "occlusionScore": 0.0,
      "imageWidth": 32,
      "imageHeight": 32,
    },
    warnings=[],
    cropped_face_bytes=b"cropped",
    error=None,
  )


def _no_face_result() -> FaceDetectionResult:
  return FaceDetectionResult(
    success=True,
    face_detected=False,
    face_count=0,
    valid=False,
    confidence=0.0,
    bbox=None,
    metrics={
      "faceCount": 0,
      "faceAreaRatio": 0.0,
      "blurScore": 100.0,
      "occlusionScore": 0.0,
      "imageWidth": 32,
      "imageHeight": 32,
    },
    warnings=[],
    cropped_face_bytes=b"",
    error="Face not detected clearly. Please upload a better photo.",
  )


@pytest.fixture()
def identity_test_client(tmp_path: str, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
  original_storage_service = main_module.storage_service
  original_identity_reference_service = main_module.identity_reference_service

  test_storage_service = LocalStorageService(tmp_path)
  monkeypatch.setattr(main_module, "storage_service", test_storage_service)
  monkeypatch.setattr(
    main_module,
    "identity_reference_service",
    IdentityReferenceService(
      face_detection_service=main_module.face_service,
      storage_service=test_storage_service,
    ),
  )
  app.dependency_overrides[get_authenticated_user] = lambda: AuthenticatedUser(
    user_id="user-123",
    access_token="header.payload.signature",
    claims={"sub": "user-123"},
  )

  with TestClient(app) as client:
    yield client

  app.dependency_overrides.clear()
  monkeypatch.setattr(main_module, "storage_service", original_storage_service)
  monkeypatch.setattr(main_module, "identity_reference_service", original_identity_reference_service)


def test_upload_reference_returns_400_when_any_photo_has_no_face(
  identity_test_client: TestClient,
  tmp_path: str,
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  results = iter([
    _valid_face_result(),
    _valid_face_result(),
    _valid_face_result(),
    _valid_face_result(),
    _no_face_result(),
  ])

  def fake_detect_face(_: bytes) -> FaceDetectionResult:
    return next(results)

  monkeypatch.setattr(main_module.face_service, "detect_face", fake_detect_face)

  image_bytes = _build_test_image_bytes()
  files = [
    ("files", (f"reference-{index + 1}.jpg", image_bytes, "image/jpeg"))
    for index in range(5)
  ]

  response = identity_test_client.post(
    "/api/v1/identity/upload-reference",
    headers={"Authorization": "Bearer header.payload.signature"},
    files=files,
  )

  assert response.status_code == 400, response.text
  payload = response.json()
  assert isinstance(payload.get("detail"), dict)
  assert payload["detail"]["failed_index"] == 4
  assert payload["detail"]["error_code"] == "identity_face_not_found"
  assert "No face detected" in payload["detail"]["message"]
  assert not any(tmp_path.rglob("*.webp"))


@pytest.mark.parametrize("photo_count", [4, 6])
def test_upload_reference_returns_400_when_photo_count_is_not_exactly_five(
  identity_test_client: TestClient,
  monkeypatch: pytest.MonkeyPatch,
  photo_count: int,
) -> None:
  monkeypatch.setattr(main_module.face_service, "detect_face", lambda _: _valid_face_result())

  image_bytes = _build_test_image_bytes()
  files = [
    ("files", (f"reference-{index + 1}.jpg", image_bytes, "image/jpeg"))
    for index in range(photo_count)
  ]

  response = identity_test_client.post(
    "/api/v1/identity/upload-reference",
    headers={"Authorization": "Bearer header.payload.signature"},
    files=files,
  )

  assert response.status_code == 400, response.text
  payload = response.json()
  assert payload["detail"]["error_code"] == "identity_photo_count_invalid"
  assert payload["detail"]["message"] == "Exactly 5 identity photos are required."
