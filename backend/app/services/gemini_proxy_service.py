from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx


GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProxyService:
  def __init__(self, api_key: str) -> None:
    self.api_key = api_key.strip()

  @property
  def configured(self) -> bool:
    return bool(self.api_key)

  async def generate_content(self, model: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    if not self.configured:
      return 503, {"error": "GEMINI_API_KEY is not configured on the backend."}

    clean_model = (model or "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    endpoint = f"{GEMINI_API_BASE}/{quote(clean_model, safe='')}:generateContent"
    params = {"key": self.api_key}

    timeout = httpx.Timeout(60.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
      response = await client.post(endpoint, params=params, json=body)

    try:
      payload = response.json()
    except ValueError:
      payload = {
        "error": "Gemini upstream returned a non-JSON response.",
        "raw_response": response.text[:4000],
      }

    return response.status_code, payload
