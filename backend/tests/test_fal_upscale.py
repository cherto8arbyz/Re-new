"""Comprehensive tests for FalUpscaleProvider (Step 4).

Covers:
- Model ID validation and fallback (guards against typos like fal-ai/real-esrgan)
- Payload correctness for fal-ai/esrgan vs fal-ai/aura-sr
- Scale clamping
- URL extraction from every response shape fal.ai can return
- Error handling (missing key, empty URL, import error, bad response)
- Async contract
"""
from __future__ import annotations

import asyncio
import types
import unittest
from unittest.mock import MagicMock, patch

from app.services.fal_upscale import (
    DEFAULT_UPSCALE_MODEL_ID,
    KNOWN_FAL_UPSCALE_MODELS,
    FalUpscaleProvider,
    UpscaleResult,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_provider(
    model_id: str = DEFAULT_UPSCALE_MODEL_ID,
    scale: int = 2,
    face_enhance: bool = False,
) -> FalUpscaleProvider:
    return FalUpscaleProvider(api_key="test-key", model_id=model_id, scale=scale, face_enhance=face_enhance)


def _fal_module_with_response(response: object) -> MagicMock:
    """Creates a fake fal_client module whose SyncClient.subscribe returns `response`."""
    mock_client = MagicMock()
    mock_client.subscribe.return_value = response
    fal_module = MagicMock()
    fal_module.SyncClient.return_value = mock_client
    return fal_module


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# 1. Model ID validation
# ---------------------------------------------------------------------------

class TestModelIdValidation(unittest.TestCase):

    def test_default_model_is_esrgan(self):
        """Default must be fal-ai/esrgan — not fal-ai/real-esrgan (doesn't exist)."""
        self.assertEqual(DEFAULT_UPSCALE_MODEL_ID, "fal-ai/esrgan")

    def test_real_esrgan_is_not_in_known_models(self):
        """fal-ai/real-esrgan must never appear in the allowed set."""
        self.assertNotIn("fal-ai/real-esrgan", KNOWN_FAL_UPSCALE_MODELS)

    def test_esrgan_is_in_known_models(self):
        self.assertIn("fal-ai/esrgan", KNOWN_FAL_UPSCALE_MODELS)

    def test_aura_sr_is_in_known_models(self):
        self.assertIn("fal-ai/aura-sr", KNOWN_FAL_UPSCALE_MODELS)

    def test_unknown_model_falls_back_to_default(self):
        """A typo like 'fal-ai/real-esrgan' must silently fall back, not crash."""
        provider = FalUpscaleProvider(api_key="k", model_id="fal-ai/real-esrgan")
        self.assertEqual(provider.model_id, DEFAULT_UPSCALE_MODEL_ID)

    def test_unknown_model_completely_wrong_falls_back(self):
        provider = FalUpscaleProvider(api_key="k", model_id="some-random/model")
        self.assertEqual(provider.model_id, DEFAULT_UPSCALE_MODEL_ID)

    def test_empty_model_id_falls_back_to_default(self):
        provider = FalUpscaleProvider(api_key="k", model_id="")
        self.assertEqual(provider.model_id, DEFAULT_UPSCALE_MODEL_ID)

    def test_whitespace_model_id_falls_back_to_default(self):
        provider = FalUpscaleProvider(api_key="k", model_id="   ")
        self.assertEqual(provider.model_id, DEFAULT_UPSCALE_MODEL_ID)

    def test_valid_esrgan_model_id_accepted(self):
        provider = FalUpscaleProvider(api_key="k", model_id="fal-ai/esrgan")
        self.assertEqual(provider.model_id, "fal-ai/esrgan")

    def test_valid_aura_sr_model_id_accepted(self):
        provider = FalUpscaleProvider(api_key="k", model_id="fal-ai/aura-sr")
        self.assertEqual(provider.model_id, "fal-ai/aura-sr")


# ---------------------------------------------------------------------------
# 2. Scale clamping
# ---------------------------------------------------------------------------

class TestScaleClamping(unittest.TestCase):

    def test_scale_0_clamps_to_1(self):
        self.assertEqual(FalUpscaleProvider(api_key="k", scale=0).scale, 1)

    def test_scale_negative_clamps_to_1(self):
        self.assertEqual(FalUpscaleProvider(api_key="k", scale=-5).scale, 1)

    def test_scale_1_accepted(self):
        self.assertEqual(FalUpscaleProvider(api_key="k", scale=1).scale, 1)

    def test_scale_2_accepted(self):
        self.assertEqual(FalUpscaleProvider(api_key="k", scale=2).scale, 2)

    def test_scale_4_accepted(self):
        self.assertEqual(FalUpscaleProvider(api_key="k", scale=4).scale, 4)

    def test_scale_8_accepted(self):
        self.assertEqual(FalUpscaleProvider(api_key="k", scale=8).scale, 8)

    def test_scale_9_clamps_to_8(self):
        self.assertEqual(FalUpscaleProvider(api_key="k", scale=9).scale, 8)

    def test_scale_100_clamps_to_8(self):
        self.assertEqual(FalUpscaleProvider(api_key="k", scale=100).scale, 8)


# ---------------------------------------------------------------------------
# 3. Payload correctness — fal-ai/esrgan
# ---------------------------------------------------------------------------

class TestEsrganPayload(unittest.TestCase):

    def _subscribe_payload(self, provider: FalUpscaleProvider, image_url: str) -> dict:
        fal_module = _fal_module_with_response({"image": {"url": "https://cdn.fal.ai/up.png"}})
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            _run(provider.upscale(image_url))
        call_args = fal_module.SyncClient.return_value.subscribe.call_args
        return call_args.kwargs.get("arguments") or call_args.args[1]

    def test_esrgan_uses_scale_key_not_upscaling_factor(self):
        provider = _make_provider(model_id="fal-ai/esrgan", scale=2)
        payload = self._subscribe_payload(provider, "https://cdn.fal.ai/vton.png")
        self.assertIn("scale", payload)
        self.assertNotIn("upscale_factor", payload)
        self.assertNotIn("upscaling_factor", payload)

    def test_esrgan_scale_value_matches_provider_scale(self):
        provider = _make_provider(model_id="fal-ai/esrgan", scale=4)
        payload = self._subscribe_payload(provider, "https://cdn.fal.ai/vton.png")
        self.assertEqual(payload["scale"], 4)

    def test_esrgan_face_key_present(self):
        provider = _make_provider(model_id="fal-ai/esrgan", face_enhance=True)
        payload = self._subscribe_payload(provider, "https://cdn.fal.ai/vton.png")
        self.assertIn("face", payload)
        self.assertTrue(payload["face"])

    def test_esrgan_face_false_by_default(self):
        provider = _make_provider(model_id="fal-ai/esrgan")
        payload = self._subscribe_payload(provider, "https://cdn.fal.ai/vton.png")
        self.assertFalse(payload["face"])

    def test_esrgan_image_url_in_payload(self):
        provider = _make_provider(model_id="fal-ai/esrgan")
        payload = self._subscribe_payload(provider, "https://cdn.fal.ai/vton.png")
        self.assertEqual(payload["image_url"], "https://cdn.fal.ai/vton.png")

    def test_esrgan_subscribe_called_with_correct_model(self):
        provider = _make_provider(model_id="fal-ai/esrgan")
        fal_module = _fal_module_with_response({"image": {"url": "https://cdn.fal.ai/up.png"}})
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            _run(provider.upscale("https://cdn.fal.ai/vton.png"))
        call_args = fal_module.SyncClient.return_value.subscribe.call_args
        model_arg = call_args.args[0] if call_args.args else call_args.kwargs.get("application")
        self.assertEqual(model_arg, "fal-ai/esrgan")


# ---------------------------------------------------------------------------
# 4. Payload correctness — fal-ai/aura-sr
# ---------------------------------------------------------------------------

class TestAuraSrPayload(unittest.TestCase):

    def _subscribe_payload(self, provider: FalUpscaleProvider, image_url: str) -> dict:
        fal_module = _fal_module_with_response({"image": {"url": "https://cdn.fal.ai/up.png"}})
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            _run(provider.upscale(image_url))
        call_args = fal_module.SyncClient.return_value.subscribe.call_args
        return call_args.kwargs.get("arguments") or call_args.args[1]

    def test_aura_sr_uses_upscale_factor_key(self):
        """aura-sr uses 'upscale_factor', NOT 'scale' or 'upscaling_factor'."""
        provider = _make_provider(model_id="fal-ai/aura-sr")
        payload = self._subscribe_payload(provider, "https://cdn.fal.ai/vton.png")
        self.assertIn("upscale_factor", payload)
        self.assertNotIn("scale", payload)
        self.assertNotIn("upscaling_factor", payload)

    def test_aura_sr_upscale_factor_is_4(self):
        provider = _make_provider(model_id="fal-ai/aura-sr")
        payload = self._subscribe_payload(provider, "https://cdn.fal.ai/vton.png")
        self.assertEqual(payload["upscale_factor"], 4)

    def test_aura_sr_does_not_send_face_param(self):
        """aura-sr doesn't support the 'face' parameter."""
        provider = _make_provider(model_id="fal-ai/aura-sr", face_enhance=True)
        payload = self._subscribe_payload(provider, "https://cdn.fal.ai/vton.png")
        self.assertNotIn("face", payload)

    def test_aura_sr_image_url_in_payload(self):
        provider = _make_provider(model_id="fal-ai/aura-sr")
        payload = self._subscribe_payload(provider, "https://cdn.fal.ai/vton.png")
        self.assertEqual(payload["image_url"], "https://cdn.fal.ai/vton.png")

    def test_aura_sr_subscribe_called_with_correct_model(self):
        provider = _make_provider(model_id="fal-ai/aura-sr")
        fal_module = _fal_module_with_response({"image": {"url": "https://cdn.fal.ai/up.png"}})
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            _run(provider.upscale("https://cdn.fal.ai/vton.png"))
        call_args = fal_module.SyncClient.return_value.subscribe.call_args
        model_arg = call_args.args[0] if call_args.args else call_args.kwargs.get("application")
        self.assertEqual(model_arg, "fal-ai/aura-sr")


# ---------------------------------------------------------------------------
# 5. URL extraction (_extract_url)
# ---------------------------------------------------------------------------

class TestExtractUrl(unittest.TestCase):

    def _p(self) -> FalUpscaleProvider:
        return _make_provider()

    # --- Shapes that fal.ai actually returns ---

    def test_image_dict_with_url(self):
        """Standard fal.ai response: {"image": {"url": "..."}}"""
        self.assertEqual(
            self._p()._extract_url({"image": {"url": "https://cdn.fal.ai/up.png"}}),
            "https://cdn.fal.ai/up.png",
        )

    def test_flat_url_key(self):
        self.assertEqual(
            self._p()._extract_url({"url": "https://cdn.fal.ai/up.png"}),
            "https://cdn.fal.ai/up.png",
        )

    def test_images_list(self):
        self.assertEqual(
            self._p()._extract_url({"images": [{"url": "https://cdn.fal.ai/up.png"}]}),
            "https://cdn.fal.ai/up.png",
        )

    def test_direct_http_string(self):
        self.assertEqual(
            self._p()._extract_url("https://cdn.fal.ai/up.png"),
            "https://cdn.fal.ai/up.png",
        )

    def test_list_of_dicts(self):
        self.assertEqual(
            self._p()._extract_url([{"url": "https://cdn.fal.ai/up.png"}]),
            "https://cdn.fal.ai/up.png",
        )

    def test_object_with_url_attribute(self):
        obj = types.SimpleNamespace(url="https://cdn.fal.ai/up.png")
        self.assertEqual(self._p()._extract_url(obj), "https://cdn.fal.ai/up.png")

    def test_nested_output_key(self):
        self.assertEqual(
            self._p()._extract_url({"output": {"url": "https://cdn.fal.ai/up.png"}}),
            "https://cdn.fal.ai/up.png",
        )

    def test_nested_result_key(self):
        self.assertEqual(
            self._p()._extract_url({"result": "https://cdn.fal.ai/up.png"}),
            "https://cdn.fal.ai/up.png",
        )

    # --- None / empty cases ---

    def test_none_returns_none(self):
        self.assertIsNone(self._p()._extract_url(None))

    def test_empty_dict_returns_none(self):
        self.assertIsNone(self._p()._extract_url({}))

    def test_empty_list_returns_none(self):
        self.assertIsNone(self._p()._extract_url([]))

    def test_non_http_string_returns_none(self):
        self.assertIsNone(self._p()._extract_url("not-a-url"))

    def test_integer_returns_none(self):
        self.assertIsNone(self._p()._extract_url(42))

    def test_images_empty_list_returns_none(self):
        self.assertIsNone(self._p()._extract_url({"images": []}))

    def test_object_with_non_http_url_attribute_returns_none(self):
        obj = types.SimpleNamespace(url="ftp://not-http.example.com")
        self.assertIsNone(self._p()._extract_url(obj))


# ---------------------------------------------------------------------------
# 6. Error handling
# ---------------------------------------------------------------------------

class TestErrorHandling(unittest.TestCase):

    def test_raises_runtime_error_when_api_key_missing(self):
        provider = FalUpscaleProvider(api_key="")
        with self.assertRaises(RuntimeError, msg="FAL_KEY is missing."):
            asyncio.run(provider.upscale("https://cdn.fal.ai/vton.png"))

    def test_raises_value_error_when_image_url_empty(self):
        provider = _make_provider()
        with self.assertRaises(ValueError):
            asyncio.run(provider.upscale(""))

    def test_raises_value_error_when_image_url_whitespace(self):
        provider = _make_provider()
        with self.assertRaises(ValueError):
            asyncio.run(provider.upscale("   "))

    def test_raises_runtime_error_when_fal_client_not_installed(self):
        provider = _make_provider()
        with patch.dict("sys.modules", {"fal_client": None}):
            with self.assertRaises((RuntimeError, ImportError)):
                asyncio.run(
                    provider.upscale("https://cdn.fal.ai/vton.png")
                )

    def test_raises_runtime_error_on_unexpected_response_shape(self):
        """If fal.ai returns something we can't extract a URL from, raise RuntimeError."""
        fal_module = _fal_module_with_response({"status": "done"})  # no image URL
        provider = _make_provider()
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            with self.assertRaises(RuntimeError, msg="Unexpected response shape"):
                asyncio.run(
                    provider.upscale("https://cdn.fal.ai/vton.png")
                )

    def test_raises_runtime_error_on_none_response(self):
        fal_module = _fal_module_with_response(None)
        provider = _make_provider()
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            with self.assertRaises(RuntimeError):
                asyncio.run(
                    provider.upscale("https://cdn.fal.ai/vton.png")
                )


# ---------------------------------------------------------------------------
# 7. Successful end-to-end flow
# ---------------------------------------------------------------------------

class TestSuccessfulUpscale(unittest.TestCase):

    def _run_upscale(self, model_id: str, response: object, image_url: str = "https://cdn.fal.ai/vton.png") -> UpscaleResult:
        provider = _make_provider(model_id=model_id, scale=2)
        fal_module = _fal_module_with_response(response)
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            return asyncio.run(provider.upscale(image_url))

    def test_esrgan_returns_upscale_result(self):
        result = self._run_upscale(
            "fal-ai/esrgan",
            {"image": {"url": "https://cdn.fal.ai/upscaled.png"}},
        )
        self.assertIsInstance(result, UpscaleResult)
        self.assertEqual(result.image_url, "https://cdn.fal.ai/upscaled.png")

    def test_esrgan_provider_name_is_set(self):
        result = self._run_upscale(
            "fal-ai/esrgan",
            {"image": {"url": "https://cdn.fal.ai/upscaled.png"}},
        )
        self.assertEqual(result.provider_name, "fal:fal-ai/esrgan")

    def test_aura_sr_returns_upscale_result(self):
        result = self._run_upscale(
            "fal-ai/aura-sr",
            {"image": {"url": "https://cdn.fal.ai/upscaled.png"}},
        )
        self.assertEqual(result.image_url, "https://cdn.fal.ai/upscaled.png")

    def test_aura_sr_provider_name_is_set(self):
        result = self._run_upscale(
            "fal-ai/aura-sr",
            {"image": {"url": "https://cdn.fal.ai/upscaled.png"}},
        )
        self.assertEqual(result.provider_name, "fal:fal-ai/aura-sr")

    def test_result_with_flat_url_response(self):
        result = self._run_upscale(
            "fal-ai/esrgan",
            {"url": "https://cdn.fal.ai/upscaled.png"},
        )
        self.assertEqual(result.image_url, "https://cdn.fal.ai/upscaled.png")

    def test_result_with_images_list_response(self):
        result = self._run_upscale(
            "fal-ai/esrgan",
            {"images": [{"url": "https://cdn.fal.ai/upscaled.png"}]},
        )
        self.assertEqual(result.image_url, "https://cdn.fal.ai/upscaled.png")

    def test_image_url_passed_through_unchanged(self):
        """image_url must not be modified (no accidental stripping beyond whitespace)."""
        image_url = "https://v3b.fal.media/files/b/0a93f92c/xXpas9ay_Ht48tLcamSgB.png"
        fal_module = _fal_module_with_response({"image": {"url": "https://cdn.fal.ai/up.png"}})
        provider = _make_provider()
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            asyncio.run(provider.upscale(image_url))
        call_args = fal_module.SyncClient.return_value.subscribe.call_args
        payload = call_args.kwargs.get("arguments") or call_args.args[1]
        self.assertEqual(payload["image_url"], image_url)

    def test_whitespace_trimmed_from_image_url(self):
        """Leading/trailing whitespace in URL must be stripped."""
        fal_module = _fal_module_with_response({"image": {"url": "https://cdn.fal.ai/up.png"}})
        provider = _make_provider()
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            asyncio.run(
                provider.upscale("  https://cdn.fal.ai/vton.png  ")
            )
        call_args = fal_module.SyncClient.return_value.subscribe.call_args
        payload = call_args.kwargs.get("arguments") or call_args.args[1]
        self.assertEqual(payload["image_url"], "https://cdn.fal.ai/vton.png")


if __name__ == "__main__":
    unittest.main()
