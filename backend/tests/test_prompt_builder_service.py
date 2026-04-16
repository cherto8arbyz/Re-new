from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

from app.services.prompt_builder_service import PromptBuilderService


def test_build_prompt_skips_gemini_and_uses_placeholder_when_no_core_garments() -> None:
  gemini_proxy_service = AsyncMock()
  gemini_proxy_service.configured = True
  service = PromptBuilderService(gemini_proxy_service=gemini_proxy_service)

  result = asyncio.run(
    service.build_prompt(
      gender="female",
      weather_context={"temperature_celsius": 4.0, "summary": "snow"},
      garment_summaries=[],
      has_core_garments=False,
    )
  )

  assert "female model" in result
  assert "clean white shorts and a fitted white tank top" in result
  assert "clean neutral studio backdrop" in result
  gemini_proxy_service.generate_content.assert_not_awaited()
