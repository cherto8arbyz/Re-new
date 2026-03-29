from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .full_pipeline_service import PipelineGarment


@dataclass(frozen=True)
class OutfitRecommendationResult:
  selected_garments: list[PipelineGarment]


class OutfitRecommendationService:
  def recommend(
    self,
    garments: list[PipelineGarment],
    weather_context: dict[str, Any],
  ) -> OutfitRecommendationResult:
    groups = {
      "dress": [],
      "top": [],
      "bottom": [],
      "outerwear": [],
      "shoes": [],
      "hat": [],
      "bag": [],
      "accessory": [],
      "unknown": [],
    }

    for garment in garments:
      groups.setdefault(garment.normalized_category, []).append(garment)

    selected: list[PipelineGarment] = []
    cold_weather = self._is_cold_weather(weather_context)
    wet_weather = self._is_wet_weather(weather_context)

    if groups["dress"]:
      selected.append(groups["dress"][0])
      if groups["outerwear"]:
        selected.append(groups["outerwear"][0])
    else:
      if groups["bottom"]:
        selected.append(groups["bottom"][0])
      if groups["top"]:
        selected.append(groups["top"][0])
      if groups["outerwear"] and (cold_weather or wet_weather or not selected):
        selected.append(groups["outerwear"][0])

    if groups["shoes"]:
      selected.append(groups["shoes"][0])
    if groups["hat"] and (cold_weather or wet_weather):
      selected.append(groups["hat"][0])
    if groups["bag"]:
      selected.append(groups["bag"][0])
    if groups["accessory"]:
      selected.append(groups["accessory"][0])

    return OutfitRecommendationResult(selected_garments=self._deduplicate(selected))

  def _is_cold_weather(self, weather_context: dict[str, Any]) -> bool:
    try:
      return float(weather_context.get("temperature_celsius")) <= 12.0
    except (TypeError, ValueError):
      return False

  def _is_wet_weather(self, weather_context: dict[str, Any]) -> bool:
    summary = str(
      weather_context.get("summary")
      or weather_context.get("condition")
      or weather_context.get("precipitation")
      or ""
    ).strip().lower()
    return bool(weather_context.get("is_raining")) or "rain" in summary or "storm" in summary

  def _deduplicate(self, garments: list[PipelineGarment]) -> list[PipelineGarment]:
    seen_ids: set[str] = set()
    unique: list[PipelineGarment] = []
    for garment in garments:
      if garment.garment_id in seen_ids:
        continue
      seen_ids.add(garment.garment_id)
      unique.append(garment)
    return unique
