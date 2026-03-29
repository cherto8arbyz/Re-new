from __future__ import annotations

import json
from typing import Any

from .gemini_proxy_service import GeminiProxyService


class PromptBuilderService:
  def __init__(
    self,
    gemini_proxy_service: GeminiProxyService,
    model: str = "gemini-2.5-flash",
  ) -> None:
    self.gemini_proxy_service = gemini_proxy_service
    self.model = (model or "gemini-2.5-flash").strip() or "gemini-2.5-flash"

  async def build_prompt(
    self,
    gender: str,
    weather_context: dict[str, Any],
    garment_summaries: list[dict[str, str]],
    has_core_garments: bool,
  ) -> str:
    fallback_prompt = self._build_fallback_prompt(
      gender=gender,
      weather_context=weather_context,
      garment_summaries=garment_summaries,
      has_core_garments=has_core_garments,
    )
    if not self.gemini_proxy_service.configured:
      return fallback_prompt

    instruction = (
      "You are building a single photorealistic fashion-image prompt for a full-body model photo. "
      "Return only the final prompt text. "
      "Use the weather context to choose scene, pose, lighting, and mood. "
      "If core garments will be applied later through virtual try-on, keep the clothing neutral base layers "
      "and mention only non-VTON items like shoes, hat, bag, or accessories. "
      "If no garments were selected, describe a stylish weather-appropriate full outfit directly in the prompt."
    )
    body = {
      "contents": [
        {
          "parts": [
            {
              "text": (
                f"{instruction}\n\n"
                f"Gender: {gender}\n"
                f"Weather context JSON: {json.dumps(weather_context, ensure_ascii=True)}\n"
                f"Selected garments JSON: {json.dumps(garment_summaries, ensure_ascii=True)}\n"
                f"Core garments selected for VTON later: {'yes' if has_core_garments else 'no'}"
              )
            }
          ]
        }
      ],
      "generationConfig": {
        "temperature": 0.7,
        "maxOutputTokens": 180,
      },
    }

    status_code, payload = await self.gemini_proxy_service.generate_content(model=self.model, body=body)
    if status_code >= 400:
      return fallback_prompt

    extracted_text = self._extract_text(payload)
    return extracted_text or fallback_prompt

  def _build_fallback_prompt(
    self,
    gender: str,
    weather_context: dict[str, Any],
    garment_summaries: list[dict[str, str]],
    has_core_garments: bool,
  ) -> str:
    scene = self._build_scene(weather_context)
    accessories = self._build_accessories_phrase(garment_summaries)

    if has_core_garments:
      clothing = "wearing neutral fitted base layers prepared for virtual try-on"
    else:
      clothing = self._build_styled_outfit(weather_context)

    accessories_suffix = f", {accessories}" if accessories else ""
    return (
      f"professional fashion photography, {gender.lower()} model, full body shot, confident natural pose, "
      f"{clothing}{accessories_suffix}, {scene}, realistic lighting, sharp focus, editorial style"
    )

  def _build_scene(self, weather_context: dict[str, Any]) -> str:
    summary = str(
      weather_context.get("summary")
      or weather_context.get("condition")
      or weather_context.get("precipitation")
      or ""
    ).strip().lower()
    is_raining = bool(weather_context.get("is_raining"))
    is_snowing = bool(weather_context.get("is_snowing"))
    temperature = self._extract_temperature(weather_context)

    if is_snowing or "snow" in summary:
      return "winter city street, gentle snowfall, cool daylight"
    if is_raining or "rain" in summary or "storm" in summary:
      return "wet urban sidewalk, reflective pavement, soft overcast lighting"
    if temperature >= 24 or "sun" in summary or "clear" in summary:
      return "sunny city street, warm daylight, subtle motion in the background"
    if temperature <= 8:
      return "cold city avenue, crisp air, soft grey sky"
    return "modern urban street, balanced natural light"

  def _build_styled_outfit(self, weather_context: dict[str, Any]) -> str:
    temperature = self._extract_temperature(weather_context)
    if temperature <= 5:
      return "wearing a stylish cold-weather outfit with a tailored coat and scarf"
    if temperature <= 15:
      return "wearing a layered smart-casual outfit suitable for cool weather"
    if temperature >= 26:
      return "wearing a breathable polished summer outfit"
    return "wearing a stylish smart-casual outfit suitable for the weather"

  def _build_accessories_phrase(self, garment_summaries: list[dict[str, str]]) -> str:
    accessory_labels: list[str] = []
    for garment in garment_summaries:
      normalized_category = str(garment.get("normalized_category") or "").strip().lower()
      if normalized_category not in {"shoes", "hat", "bag", "accessory"}:
        continue

      label = str(garment.get("name") or garment.get("title") or "").strip()
      color = str(garment.get("color") or "").strip()
      if label and color:
        accessory_labels.append(f"wearing {color} {label}")
      elif label:
        accessory_labels.append(f"wearing {label}")
      elif color:
        accessory_labels.append(f"wearing {color} {normalized_category}")
      else:
        accessory_labels.append(f"wearing {normalized_category}")

    deduplicated: list[str] = []
    for label in accessory_labels:
      if label not in deduplicated:
        deduplicated.append(label)

    return ", ".join(deduplicated)

  def _extract_temperature(self, weather_context: dict[str, Any]) -> float:
    raw_value = weather_context.get("temperature_celsius")
    try:
      return float(raw_value)
    except (TypeError, ValueError):
      return 18.0

  def _extract_text(self, payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
      return ""

    for candidate in candidates:
      if not isinstance(candidate, dict):
        continue
      content = candidate.get("content")
      if not isinstance(content, dict):
        continue
      parts = content.get("parts")
      if not isinstance(parts, list):
        continue
      fragments: list[str] = []
      for part in parts:
        if isinstance(part, dict):
          text = str(part.get("text") or "").strip()
          if text:
            fragments.append(text)
      if fragments:
        return " ".join(fragments).strip()
    return ""
