from dataclasses import dataclass
import logging

from .background_removal_providers import (
  BackgroundRemovalProvider,
  ProviderResult,
)


logger = logging.getLogger("image-pipeline.background")


@dataclass
class BackgroundRemovalResult:
  background_removed: bool
  image_bytes: bytes
  content_type: str
  provider: str
  error: str | None = None


class BackgroundRemovalService:
  def __init__(
    self,
    primary_provider: BackgroundRemovalProvider,
    fallback_provider: BackgroundRemovalProvider | None = None,
  ):
    self.primary_provider = primary_provider
    self.fallback_provider = fallback_provider

  async def remove_background(
    self,
    image_bytes: bytes,
    filename: str,
    content_type: str,
  ) -> BackgroundRemovalResult:
    if not image_bytes:
      logger.warning("background_removal_failed reason=empty_payload")
      return BackgroundRemovalResult(
        background_removed=False,
        image_bytes=image_bytes,
        content_type=content_type,
        provider="none",
        error="Empty image payload.",
      )

    primary = await self.primary_provider.remove_background(
      image_bytes=image_bytes,
      filename=filename,
      content_type=content_type,
    )
    if primary.background_removed:
      logger.info(
        "background_removal_success provider=%s output_bytes=%s",
        primary.provider_name,
        len(primary.image_bytes),
      )
      return self._to_result(primary, fallback_error=None)

    fallback_error = None
    if self.fallback_provider is not None:
      fallback = await self.fallback_provider.remove_background(
        image_bytes=image_bytes,
        filename=filename,
        content_type=content_type,
      )
      if fallback.background_removed:
        logger.info(
          "background_removal_success provider=%s output_bytes=%s",
          fallback.provider_name,
          len(fallback.image_bytes),
        )
        return self._to_result(fallback, fallback_error=primary.error)
      fallback_error = fallback.error

    logger.warning(
      "background_removal_failed provider=%s error=%s fallback_error=%s",
      primary.provider_name,
      primary.error,
      fallback_error,
    )
    return self._to_result(primary, fallback_error=fallback_error)

  def _to_result(
    self,
    provider_result: ProviderResult,
    fallback_error: str | None,
  ) -> BackgroundRemovalResult:
    merged_error = provider_result.error
    if fallback_error:
      merged_error = f"{provider_result.error or 'background removal failed'} | fallback: {fallback_error}"

    return BackgroundRemovalResult(
      background_removed=provider_result.background_removed,
      image_bytes=provider_result.image_bytes,
      content_type=provider_result.content_type,
      provider=provider_result.provider_name,
      error=merged_error,
    )
