from __future__ import annotations

import asyncio
from pathlib import Path
import time
import unittest
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app, storage_service, vton_job_service
from app.services.ai_generation_providers import VTONGenerationResult


class SlowFakeProvider:
  last_user_image_url: str | None = None
  last_garment_image_url: str | None = None

  async def generate_vton(self, user_image_url: str, garment_image_url: str) -> VTONGenerationResult:
    SlowFakeProvider.last_user_image_url = user_image_url
    SlowFakeProvider.last_garment_image_url = garment_image_url
    await asyncio.sleep(0.75)
    file_path = storage_service.uploads_dir / f"fake-provider-{uuid4().hex}.png"
    file_path.write_bytes(b"fake-image-bytes")
    return VTONGenerationResult(
      output_path=str(file_path),
      provider_name="fake-provider",
      masked_output_path=None,
    )


class VTONAsyncFlowTestCase(unittest.TestCase):
  def setUp(self) -> None:
    self.original_provider_factory = vton_job_service.provider_factory
    vton_job_service.provider_factory = lambda: SlowFakeProvider()

  def tearDown(self) -> None:
    vton_job_service.provider_factory = self.original_provider_factory

  def test_generate_endpoint_returns_immediately_and_job_completes(self) -> None:
    with TestClient(app) as client:
      upload = client.post(
        "/api/v1/upload",
        files={"file": ("user.png", b"upload-bytes", "image/png")},
      )
      self.assertEqual(upload.status_code, 200, upload.text)
      upload_url = upload.json()["url"]

      started_at = time.perf_counter()
      response = client.post(
        "/api/v1/generate-look",
        json={
          "user_image_url": upload_url,
          "garment_image_url": upload_url,
        },
      )
      duration_ms = (time.perf_counter() - started_at) * 1000

      self.assertEqual(response.status_code, 200, response.text)
      payload = response.json()
      self.assertLess(duration_ms, 250, payload)
      self.assertEqual(payload["status"], "pending", payload)
      self.assertTrue(payload["job_id"], payload)

      job_id = payload["job_id"]
      final_payload = None
      seen_processing = False
      for _ in range(40):
        status_response = client.get(f"/api/v1/jobs/{job_id}")
        self.assertEqual(status_response.status_code, 200, status_response.text)
        final_payload = status_response.json()
        if final_payload["status"] == "processing":
          seen_processing = True
        if final_payload["status"] == "completed":
          break
        time.sleep(0.1)

      self.assertIsNotNone(final_payload)
      self.assertTrue(seen_processing, final_payload)
      self.assertEqual(final_payload["status"], "completed", final_payload)
      self.assertTrue(final_payload["result_url"], final_payload)
      self.assertEqual(final_payload["result_url"], final_payload["result_image_url"], final_payload)
      self.assertIsNotNone(SlowFakeProvider.last_user_image_url)
      self.assertIsNotNone(SlowFakeProvider.last_garment_image_url)
      self.assertTrue(Path(SlowFakeProvider.last_user_image_url).exists(), SlowFakeProvider.last_user_image_url)
      self.assertTrue(Path(SlowFakeProvider.last_garment_image_url).exists(), SlowFakeProvider.last_garment_image_url)

      result_path = final_payload["result_url"].replace("http://testserver", "")
      file_response = client.get(result_path)
      self.assertEqual(file_response.status_code, 200, file_response.text)


if __name__ == "__main__":
  unittest.main()
