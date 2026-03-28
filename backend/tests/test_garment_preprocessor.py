"""Comprehensive tests for GarmentPreprocessor.

Covers:
- Background removal success / failure / API key missing
- Graceful degradation (original returned on any error)
- fal.ai CDN upload
- Temp file cleanup
- _save_temp naming
- has_bg_removal()
- Integration: preprocess_garment end-to-end
"""
from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.services.garment_preprocessor import GarmentPreprocessor


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_preprocessor(api_key: str = "test-key") -> GarmentPreprocessor:
    return GarmentPreprocessor(remove_bg_api_key=api_key)


def _fake_fal_client(cdn_url: str = "https://cdn.fal.ai/garment_nobg.png") -> MagicMock:
    client = MagicMock()
    client.upload_file.return_value = cdn_url
    return client


# ---------------------------------------------------------------------------
# 1. Constructor / has_bg_removal
# ---------------------------------------------------------------------------

class TestConstructor(unittest.TestCase):

    def test_has_bg_removal_true_when_key_provided(self):
        self.assertTrue(_make_preprocessor("somekey").has_bg_removal())

    def test_has_bg_removal_false_when_key_empty(self):
        self.assertFalse(GarmentPreprocessor(remove_bg_api_key="").has_bg_removal())

    def test_has_bg_removal_false_when_key_whitespace(self):
        self.assertFalse(GarmentPreprocessor(remove_bg_api_key="   ").has_bg_removal())

    def test_api_key_stripped(self):
        p = GarmentPreprocessor(remove_bg_api_key="  abc  ")
        self.assertEqual(p.remove_bg_api_key, "abc")


# ---------------------------------------------------------------------------
# 2. _remove_background — API key missing
# ---------------------------------------------------------------------------

class TestRemoveBackgroundNoKey(unittest.TestCase):

    def test_returns_original_when_no_api_key(self):
        p = GarmentPreprocessor(remove_bg_api_key="")
        original = b"fake-image-bytes"
        result_bytes, result_ct = p._remove_background(original, "image/jpeg")
        self.assertEqual(result_bytes, original)
        self.assertEqual(result_ct, "image/jpeg")


# ---------------------------------------------------------------------------
# 3. _remove_background — API success
# ---------------------------------------------------------------------------

class TestRemoveBackgroundSuccess(unittest.TestCase):

    def _mock_response(self, status: int, content: bytes) -> MagicMock:
        resp = MagicMock()
        resp.status_code = status
        resp.content = content
        resp.text = content.decode("latin-1", errors="replace")
        return resp

    def test_returns_processed_bytes_on_200(self):
        p = _make_preprocessor()
        processed = b"processed-png-bytes"
        with patch("app.services.garment_preprocessor.httpx.post") as mock_post:
            mock_post.return_value = self._mock_response(200, processed)
            result_bytes, result_ct = p._remove_background(b"original", "image/jpeg")
        self.assertEqual(result_bytes, processed)
        self.assertEqual(result_ct, "image/png")

    def test_content_type_becomes_png_on_success(self):
        p = _make_preprocessor()
        with patch("app.services.garment_preprocessor.httpx.post") as mock_post:
            mock_post.return_value = self._mock_response(200, b"processed")
            _, ct = p._remove_background(b"original", "image/jpeg")
        self.assertEqual(ct, "image/png")

    def test_sends_correct_api_key_header(self):
        p = _make_preprocessor("my-api-key")
        with patch("app.services.garment_preprocessor.httpx.post") as mock_post:
            mock_post.return_value = self._mock_response(200, b"processed")
            p._remove_background(b"original", "image/png")
        call_kwargs = mock_post.call_args.kwargs
        self.assertEqual(call_kwargs["headers"]["X-Api-Key"], "my-api-key")

    def test_sends_to_correct_url(self):
        p = _make_preprocessor()
        with patch("app.services.garment_preprocessor.httpx.post") as mock_post:
            mock_post.return_value = self._mock_response(200, b"processed")
            p._remove_background(b"original", "image/png")
        called_url = mock_post.call_args.args[0]
        self.assertIn("remove.bg", called_url)


# ---------------------------------------------------------------------------
# 4. _remove_background — API failure (graceful degradation)
# ---------------------------------------------------------------------------

class TestRemoveBackgroundFailure(unittest.TestCase):

    def _mock_response(self, status: int) -> MagicMock:
        resp = MagicMock()
        resp.status_code = status
        resp.content = b""
        resp.text = "error"
        return resp

    def test_returns_original_on_402(self):
        """402 = quota exhausted — must not crash, return original."""
        p = _make_preprocessor()
        original = b"original-bytes"
        with patch("app.services.garment_preprocessor.httpx.post") as mock_post:
            mock_post.return_value = self._mock_response(402)
            result_bytes, result_ct = p._remove_background(original, "image/jpeg")
        self.assertEqual(result_bytes, original)

    def test_returns_original_on_429(self):
        p = _make_preprocessor()
        original = b"original-bytes"
        with patch("app.services.garment_preprocessor.httpx.post") as mock_post:
            mock_post.return_value = self._mock_response(429)
            result_bytes, _ = p._remove_background(original, "image/jpeg")
        self.assertEqual(result_bytes, original)

    def test_returns_original_on_network_error(self):
        p = _make_preprocessor()
        original = b"original-bytes"
        with patch("app.services.garment_preprocessor.httpx.post", side_effect=ConnectionError("timeout")):
            result_bytes, _ = p._remove_background(original, "image/jpeg")
        self.assertEqual(result_bytes, original)

    def test_returns_original_on_any_exception(self):
        p = _make_preprocessor()
        original = b"original-bytes"
        with patch("app.services.garment_preprocessor.httpx.post", side_effect=RuntimeError("boom")):
            result_bytes, _ = p._remove_background(original, "image/jpeg")
        self.assertEqual(result_bytes, original)

    def test_content_type_unchanged_on_failure(self):
        p = _make_preprocessor()
        with patch("app.services.garment_preprocessor.httpx.post") as mock_post:
            mock_post.return_value = self._mock_response(500)
            _, ct = p._remove_background(b"original", "image/jpeg")
        self.assertEqual(ct, "image/jpeg")


# ---------------------------------------------------------------------------
# 5. _save_temp
# ---------------------------------------------------------------------------

class TestSaveTempFile(unittest.TestCase):

    def test_saves_bytes_to_nobg_path(self, tmp_path=None):
        import tempfile, os
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / "garment.jpg"
            original.write_bytes(b"original")
            p = _make_preprocessor()
            temp_path = p._save_temp(original, b"processed", "image/png")
            self.assertTrue(temp_path.exists())
            self.assertEqual(temp_path.read_bytes(), b"processed")
            temp_path.unlink(missing_ok=True)

    def test_temp_path_has_nobg_suffix(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / "garment.jpg"
            original.write_bytes(b"original")
            p = _make_preprocessor()
            temp_path = p._save_temp(original, b"processed", "image/png")
            self.assertIn("_nobg", temp_path.name)
            temp_path.unlink(missing_ok=True)

    def test_temp_path_extension_is_png_for_png_content_type(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / "garment.jpg"
            original.write_bytes(b"original")
            p = _make_preprocessor()
            temp_path = p._save_temp(original, b"processed", "image/png")
            self.assertEqual(temp_path.suffix, ".png")
            temp_path.unlink(missing_ok=True)

    def test_temp_path_keeps_original_extension_for_non_png(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            original = Path(tmp) / "garment.jpg"
            original.write_bytes(b"original")
            p = _make_preprocessor()
            temp_path = p._save_temp(original, b"original", "image/jpeg")
            self.assertEqual(temp_path.suffix, ".jpg")
            temp_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# 6. preprocess_garment — end-to-end
# ---------------------------------------------------------------------------

class TestPreprocessGarmentEndToEnd(unittest.TestCase):

    def test_raises_when_file_not_found(self):
        p = _make_preprocessor()
        fake_client = _fake_fal_client()
        with self.assertRaises(FileNotFoundError):
            p.preprocess_garment(Path("/nonexistent/garment.jpg"), fake_client)

    def test_uploads_to_fal_cdn_and_returns_url(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            garment = Path(tmp) / "garment.jpg"
            garment.write_bytes(b"fake-image-bytes")
            p = _make_preprocessor(api_key="")  # no BG removal
            fake_client = _fake_fal_client("https://cdn.fal.ai/nobg.png")
            url = p.preprocess_garment(garment, fake_client)
        self.assertEqual(url, "https://cdn.fal.ai/nobg.png")

    def test_fal_upload_file_is_called(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            garment = Path(tmp) / "garment.jpg"
            garment.write_bytes(b"fake-image-bytes")
            p = _make_preprocessor(api_key="")
            fake_client = _fake_fal_client()
            p.preprocess_garment(garment, fake_client)
        fake_client.upload_file.assert_called_once()

    def test_bg_removal_called_when_api_key_present(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            garment = Path(tmp) / "garment.jpg"
            garment.write_bytes(b"fake-image-bytes")
            p = _make_preprocessor(api_key="real-key")
            fake_client = _fake_fal_client()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.content = b"processed-no-bg"
            with patch("app.services.garment_preprocessor.httpx.post", return_value=mock_resp) as mock_post:
                p.preprocess_garment(garment, fake_client)
            mock_post.assert_called_once()

    def test_temp_file_cleaned_up_after_upload(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            garment = Path(tmp) / "garment.jpg"
            garment.write_bytes(b"fake-image-bytes")
            p = _make_preprocessor(api_key="key")
            fake_client = _fake_fal_client()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.content = b"processed-no-bg"
            with patch("app.services.garment_preprocessor.httpx.post", return_value=mock_resp):
                p.preprocess_garment(garment, fake_client)
            # nobg temp file must be deleted
            nobg_file = garment.with_name(garment.stem + "_nobg.png")
            self.assertFalse(nobg_file.exists(), "Temp _nobg file was not cleaned up")

    def test_original_file_not_deleted(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            garment = Path(tmp) / "garment.jpg"
            garment.write_bytes(b"fake-image-bytes")
            p = _make_preprocessor(api_key="")
            fake_client = _fake_fal_client()
            p.preprocess_garment(garment, fake_client)
            self.assertTrue(garment.exists(), "Original garment file must not be deleted")


# ---------------------------------------------------------------------------
# 7. is_provider_overloaded — verifying "internal server error" is now caught
# ---------------------------------------------------------------------------

class TestIsProviderOverloaded(unittest.TestCase):
    """Ensures the fix for fal.ai 500/'Internal Server Error' is correct."""

    def _check(self, exc: Exception) -> bool:
        from app.services.ai_generation_providers import FalVTONProvider
        # Use FalVTONProvider's _is_provider_overloaded
        dummy = FalVTONProvider.__new__(FalVTONProvider)
        return dummy._is_provider_overloaded(exc)

    def test_internal_server_error_text_is_overloaded(self):
        self.assertTrue(self._check(Exception("Internal Server Error")))

    def test_internal_server_error_mixed_case(self):
        self.assertTrue(self._check(Exception("INTERNAL SERVER ERROR")))

    def test_504_text_is_overloaded(self):
        self.assertTrue(self._check(Exception("504 Gateway Timeout")))

    def test_timeout_is_overloaded(self):
        self.assertTrue(self._check(Exception("Request timed out")))

    def test_rate_limit_is_overloaded(self):
        self.assertTrue(self._check(Exception("rate limit exceeded")))

    def test_generic_value_error_is_not_overloaded(self):
        self.assertFalse(self._check(ValueError("image_url is required")))

    def test_import_error_is_not_overloaded(self):
        self.assertFalse(self._check(ImportError("fal_client not found")))

    def test_bad_image_format_is_not_overloaded(self):
        self.assertFalse(self._check(Exception("invalid image format")))


if __name__ == "__main__":
    unittest.main()
