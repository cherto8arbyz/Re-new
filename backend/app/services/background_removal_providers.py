from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Protocol

import httpx


REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg"
CLIPDROP_REMOVE_BG_URL = "https://clipdrop-api.co/remove-background/v1"
logger = logging.getLogger("image-pipeline.background.providers")


@dataclass
class ProviderResult:
  background_removed: bool
  image_bytes: bytes
  content_type: str
  provider_name: str
  error: str | None = None


class BackgroundRemovalProvider(Protocol):
  async def remove_background(
    self,
    image_bytes: bytes,
    filename: str,
    content_type: str,
  ) -> ProviderResult:
    ...


class RemoveBgProvider:
  def __init__(self, api_key: str):
    self.api_key = (api_key or "").strip()
    self.provider_name = "remove.bg"

  async def remove_background(
    self,
    image_bytes: bytes,
    filename: str,
    content_type: str,
  ) -> ProviderResult:
    if not image_bytes:
      return ProviderResult(
        background_removed=False,
        image_bytes=image_bytes,
        content_type=content_type,
        provider_name=self.provider_name,
        error="Empty image payload.",
      )

    if not self.api_key:
      return ProviderResult(
        background_removed=False,
        image_bytes=image_bytes,
        content_type=content_type,
        provider_name=self.provider_name,
        error="REMOVE_BG_API_KEY is missing.",
      )

    headers = {"X-Api-Key": self.api_key}
    files = {
      "image_file": (
        filename or "upload.png",
        image_bytes,
        content_type or "image/png",
      ),
    }
    data = {"size": "auto"}

    try:
      async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
          REMOVE_BG_URL,
          headers=headers,
          files=files,
          data=data,
        )
    except Exception as exc:
      logger.exception("provider_request_failed provider=%s", self.provider_name)
      return ProviderResult(
        background_removed=False,
        image_bytes=image_bytes,
        content_type=content_type,
        provider_name=self.provider_name,
        error=f"remove.bg request failed: {exc}",
      )

    if response.status_code != 200:
      body = response.text[:300].strip()
      return ProviderResult(
        background_removed=False,
        image_bytes=image_bytes,
        content_type=content_type,
        provider_name=self.provider_name,
        error=f"remove.bg error {response.status_code}: {body}",
      )

    return ProviderResult(
      background_removed=True,
      image_bytes=response.content,
      content_type="image/png",
      provider_name=self.provider_name,
      error=None,
    )


class ClipdropProvider:
  def __init__(self, api_key: str):
    self.api_key = (api_key or "").strip()
    self.provider_name = "clipdrop"

  async def remove_background(
    self,
    image_bytes: bytes,
    filename: str,
    content_type: str,
  ) -> ProviderResult:
    if not image_bytes:
      return ProviderResult(
        background_removed=False,
        image_bytes=image_bytes,
        content_type=content_type,
        provider_name=self.provider_name,
        error="Empty image payload.",
      )

    if not self.api_key:
      return ProviderResult(
        background_removed=False,
        image_bytes=image_bytes,
        content_type=content_type,
        provider_name=self.provider_name,
        error="CLIPDROP_API_KEY is missing.",
      )

    headers = {"x-api-key": self.api_key}
    files = {
      "image_file": (
        filename or "upload.png",
        image_bytes,
        content_type or "image/png",
      ),
    }

    try:
      async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
          CLIPDROP_REMOVE_BG_URL,
          headers=headers,
          files=files,
        )
    except Exception as exc:
      logger.exception("provider_request_failed provider=%s", self.provider_name)
      return ProviderResult(
        background_removed=False,
        image_bytes=image_bytes,
        content_type=content_type,
        provider_name=self.provider_name,
        error=f"clipdrop request failed: {exc}",
      )

    if response.status_code != 200:
      body = response.text[:300].strip()
      return ProviderResult(
        background_removed=False,
        image_bytes=image_bytes,
        content_type=content_type,
        provider_name=self.provider_name,
        error=f"clipdrop error {response.status_code}: {body}",
      )

    return ProviderResult(
      background_removed=True,
      image_bytes=response.content,
      content_type="image/png",
      provider_name=self.provider_name,
      error=None,
    )
