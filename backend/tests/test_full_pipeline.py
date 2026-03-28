"""Unit tests for the full 4-step look generation pipeline (fal.ai)."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import unittest

from app.services.fal_base_generation import (
    BaseGenerationRequest,
    FalBaseGenerationProvider,
)
from app.services.fal_face_swap import FalFaceSwapProvider
from app.services.fal_upscale import FalUpscaleProvider
from app.services.full_pipeline_service import (
    FullLookPipelineService,
    LookGenerationRequest,
)
from app.services.ai_generation_providers import FalVTONProvider, VTONGenerationResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fal_client_mock(return_value: dict) -> MagicMock:
    """Returns a mock that behaves like fal_client.SyncClient."""
    client = MagicMock()
    client.subscribe.return_value = return_value
    return client


# ---------------------------------------------------------------------------
# Step 1 — FalBaseGenerationProvider
# ---------------------------------------------------------------------------

class TestFalBaseGenerationProvider(unittest.TestCase):

    def _make_provider(self) -> FalBaseGenerationProvider:
        return FalBaseGenerationProvider(api_key="test-key")

    def test_prompt_contains_gender_and_season(self) -> None:
        provider = self._make_provider()
        req = BaseGenerationRequest(
            gender="female",
            body_type="slim",
            season="autumn",
            temperature_celsius=14.0,
        )
        prompt = provider._build_prompt(req)
        self.assertIn("female", prompt)
        self.assertIn("autumn", prompt)
        self.assertIn("slim", prompt)

    def test_prompt_unknown_season_falls_back_gracefully(self) -> None:
        provider = self._make_provider()
        req = BaseGenerationRequest(
            gender="male",
            body_type="athletic",
            season="monsoon",   # not in our map
            temperature_celsius=30.0,
        )
        prompt = provider._build_prompt(req)
        self.assertIn("male", prompt)   # still has gender
        self.assertIn("athletic", prompt)

    def test_extract_url_from_images_list(self) -> None:
        provider = self._make_provider()
        result = {"images": [{"url": "https://cdn.fal.ai/image.png"}]}
        self.assertEqual(provider._extract_url(result), "https://cdn.fal.ai/image.png")

    def test_extract_url_from_flat_dict(self) -> None:
        provider = self._make_provider()
        result = {"url": "https://cdn.fal.ai/image.png"}
        self.assertEqual(provider._extract_url(result), "https://cdn.fal.ai/image.png")

    def test_extract_url_returns_none_on_empty(self) -> None:
        provider = self._make_provider()
        self.assertIsNone(provider._extract_url(None))
        self.assertIsNone(provider._extract_url({}))

    def test_generate_calls_fal_subscribe(self) -> None:
        provider = self._make_provider()
        mock_client = _make_fal_client_mock({"images": [{"url": "https://cdn.fal.ai/base.png"}]})

        fal_module = MagicMock()
        fal_module.SyncClient.return_value = mock_client
        with patch.dict("sys.modules", {"fal_client": fal_module}):
            req = BaseGenerationRequest(
                gender="female", body_type="average",
                season="winter", temperature_celsius=0.0,
            )
            result = asyncio.run(provider.generate(req))

        self.assertEqual(result.image_url, "https://cdn.fal.ai/base.png")
        self.assertEqual(result.provider_name, "fal:fal-ai/flux/dev")

    def test_raises_when_api_key_missing(self) -> None:
        provider = FalBaseGenerationProvider(api_key="")
        req = BaseGenerationRequest(
            gender="male", body_type="slim", season="spring", temperature_celsius=18.0
        )
        with self.assertRaises(RuntimeError, msg="FAL_KEY is missing."):
            asyncio.run(provider.generate(req))


# ---------------------------------------------------------------------------
# Step 2 — FalFaceSwapProvider
# ---------------------------------------------------------------------------

class TestFalFaceSwapProvider(unittest.TestCase):

    def _make_provider(self) -> FalFaceSwapProvider:
        return FalFaceSwapProvider(api_key="test-key")

    def test_extract_url_from_image_key(self) -> None:
        provider = self._make_provider()
        self.assertEqual(
            provider._extract_url({"image": {"url": "https://cdn.fal.ai/swapped.png"}}),
            "https://cdn.fal.ai/swapped.png",
        )

    def test_extract_url_from_swapped_image_key(self) -> None:
        provider = self._make_provider()
        self.assertEqual(
            provider._extract_url({"swapped_image": "https://cdn.fal.ai/swapped.png"}),
            "https://cdn.fal.ai/swapped.png",
        )

    def test_raises_when_base_image_url_empty(self) -> None:
        provider = self._make_provider()
        with self.assertRaises(ValueError):
            asyncio.run(provider.swap_face(base_image_url="", face_image_url="https://face.png"))

    def test_raises_when_face_image_url_empty(self) -> None:
        provider = self._make_provider()
        with self.assertRaises(ValueError):
            asyncio.run(provider.swap_face(base_image_url="https://base.png", face_image_url=""))

    def test_raises_when_api_key_missing(self) -> None:
        provider = FalFaceSwapProvider(api_key="")
        with self.assertRaises(RuntimeError):
            asyncio.run(provider.swap_face("https://base.png", "https://face.png"))

    def test_swap_calls_fal_subscribe_with_correct_payload(self) -> None:
        provider = self._make_provider()
        mock_client = MagicMock()
        mock_client.subscribe.return_value = {"image": {"url": "https://cdn.fal.ai/swapped.png"}}

        fal_module = MagicMock()
        fal_module.SyncClient.return_value = mock_client

        with patch.dict("sys.modules", {"fal_client": fal_module}):
            result = asyncio.run(
                provider.swap_face("https://base.png", "https://face.png")
            )

        call_args = mock_client.subscribe.call_args
        payload = call_args.kwargs.get("arguments") or call_args.args[1]
        self.assertEqual(payload["base_image_url"], "https://base.png")
        self.assertEqual(payload["swap_image_url"], "https://face.png")
        self.assertEqual(result.image_url, "https://cdn.fal.ai/swapped.png")


# ---------------------------------------------------------------------------
# Step 4 — FalUpscaleProvider
# ---------------------------------------------------------------------------

class TestFalUpscaleProvider(unittest.TestCase):

    def _make_provider(self) -> FalUpscaleProvider:
        return FalUpscaleProvider(api_key="test-key", scale=2)

    def test_extract_url_from_image_dict(self) -> None:
        provider = self._make_provider()
        self.assertEqual(
            provider._extract_url({"image": {"url": "https://cdn.fal.ai/upscaled.png"}}),
            "https://cdn.fal.ai/upscaled.png",
        )

    def test_scale_clamped_to_valid_range(self) -> None:
        # esrgan supports scale 1-8
        provider_low = FalUpscaleProvider(api_key="k", scale=0)
        provider_high = FalUpscaleProvider(api_key="k", scale=99)
        self.assertEqual(provider_low.scale, 1)   # 0 → 1 (minimum)
        self.assertEqual(provider_high.scale, 8)  # 99 → 8 (maximum)

    def test_raises_when_image_url_empty(self) -> None:
        provider = self._make_provider()
        with self.assertRaises(ValueError):
            asyncio.run(provider.upscale(""))

    def test_upscale_calls_fal_with_correct_scale(self) -> None:
        provider = self._make_provider()
        mock_client = MagicMock()
        mock_client.subscribe.return_value = {"image": {"url": "https://cdn.fal.ai/up.png"}}

        fal_module = MagicMock()
        fal_module.SyncClient.return_value = mock_client

        with patch.dict("sys.modules", {"fal_client": fal_module}):
            result = asyncio.run(provider.upscale("https://cdn.fal.ai/vton.png"))

        call_args = mock_client.subscribe.call_args
        payload = call_args.kwargs.get("arguments") or call_args.args[1]
        self.assertEqual(payload["scale"], 2)  # esrgan uses "scale"
        self.assertEqual(payload["image_url"], "https://cdn.fal.ai/vton.png")
        self.assertEqual(result.image_url, "https://cdn.fal.ai/up.png")


# ---------------------------------------------------------------------------
# Full pipeline orchestration
# ---------------------------------------------------------------------------

class TestFullLookPipelineService(unittest.TestCase):

    def _make_request(self) -> LookGenerationRequest:
        return LookGenerationRequest(
            user_face_url="https://cdn.example.com/face.jpg",
            garment_image_url="https://cdn.example.com/jacket.png",
            gender="female",
            body_type="slim",
            season="autumn",
            temperature_celsius=14.0,
            garment_type="upper_body",
        )

    def _make_pipeline(
        self,
        base_url: str = "https://cdn.fal.ai/base.png",
        face_url: str = "https://cdn.fal.ai/face.png",
        vton_url: str = "https://cdn.fal.ai/vton.png",
        final_url: str = "https://cdn.fal.ai/final.png",
    ) -> FullLookPipelineService:
        """Builds a pipeline where every provider is mocked with AsyncMock."""
        from app.services.fal_base_generation import BaseGenerationResult
        from app.services.fal_face_swap import FaceSwapResult
        from app.services.fal_upscale import UpscaleResult

        base_gen = MagicMock()
        base_gen.generate = AsyncMock(
            return_value=BaseGenerationResult(image_url=base_url, provider_name="fal:step1")
        )

        face_swap = MagicMock()
        face_swap.swap_face = AsyncMock(
            return_value=FaceSwapResult(image_url=face_url, provider_name="fal:step2")
        )

        vton = MagicMock()
        vton.generate_vton = AsyncMock(
            return_value=VTONGenerationResult(output_path=vton_url, provider_name="fal:step3")
        )

        upscale = MagicMock()
        upscale.upscale = AsyncMock(
            return_value=UpscaleResult(image_url=final_url, provider_name="fal:step4")
        )

        return FullLookPipelineService(
            base_gen=base_gen,
            face_swap=face_swap,
            vton=vton,
            upscale=upscale,
        )

    def test_pipeline_returns_all_intermediate_urls(self) -> None:
        pipeline = self._make_pipeline(
            base_url="https://cdn.fal.ai/base.png",
            face_url="https://cdn.fal.ai/face.png",
            vton_url="https://cdn.fal.ai/vton.png",
            final_url="https://cdn.fal.ai/final.png",
        )
        result = asyncio.run(pipeline.generate_look(self._make_request()))

        self.assertEqual(result.step1_base_url, "https://cdn.fal.ai/base.png")
        self.assertEqual(result.step2_face_swapped_url, "https://cdn.fal.ai/face.png")
        self.assertEqual(result.step3_vton_url, "https://cdn.fal.ai/vton.png")
        self.assertEqual(result.final_image_url, "https://cdn.fal.ai/final.png")

    def test_pipeline_providers_trace_has_4_entries(self) -> None:
        pipeline = self._make_pipeline()
        result = asyncio.run(pipeline.generate_look(self._make_request()))
        self.assertEqual(len(result.providers), 4)

    def test_pipeline_passes_garment_url_to_vton(self) -> None:
        pipeline = self._make_pipeline()
        request = self._make_request()
        asyncio.run(pipeline.generate_look(request))

        vton_call = pipeline._vton.generate_vton.call_args
        kwargs = vton_call.kwargs if vton_call.kwargs else {}
        args = vton_call.args if vton_call.args else ()
        garment_passed = kwargs.get("garment_image_url") or (args[1] if len(args) > 1 else None)
        self.assertEqual(garment_passed, request.garment_image_url)

    def test_pipeline_passes_face_result_to_vton_as_user_image(self) -> None:
        """The output of step 2 (face swap) must be the user_image_url for step 3 (VTON)."""
        pipeline = self._make_pipeline(face_url="https://cdn.fal.ai/face_swapped.png")
        asyncio.run(pipeline.generate_look(self._make_request()))

        vton_call = pipeline._vton.generate_vton.call_args
        kwargs = vton_call.kwargs if vton_call.kwargs else {}
        args = vton_call.args if vton_call.args else ()
        user_image_passed = kwargs.get("user_image_url") or (args[0] if args else None)
        self.assertEqual(user_image_passed, "https://cdn.fal.ai/face_swapped.png")


# ---------------------------------------------------------------------------
# HTTP endpoint smoke test
# ---------------------------------------------------------------------------

class TestFullLookEndpoint(unittest.TestCase):

    def test_endpoint_returns_400_when_face_url_missing(self) -> None:
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/look/generate-full",
                json={
                    "user_face_url": "",
                    "garment_image_url": "https://cdn.example.com/jacket.png",
                },
            )
        self.assertEqual(resp.status_code, 400)

    def test_endpoint_returns_400_when_garment_url_missing(self) -> None:
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/look/generate-full",
                json={
                    "user_face_url": "https://cdn.example.com/face.jpg",
                    "garment_image_url": "",
                },
            )
        self.assertEqual(resp.status_code, 400)


if __name__ == "__main__":
    unittest.main()
