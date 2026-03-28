from __future__ import annotations

from dataclasses import dataclass
import mimetypes
from pathlib import Path
import shutil
from urllib.parse import urlparse
from uuid import uuid4

import httpx


APP_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = APP_DIR / "static"
UPLOADS_DIR = STATIC_DIR / "uploads"


@dataclass(frozen=True)
class StoredAsset:
  file_path: Path
  file_name: str
  public_url: str


class LocalStorageService:
  def __init__(self, uploads_dir: Path = UPLOADS_DIR) -> None:
    self.uploads_dir = uploads_dir
    self.uploads_dir.mkdir(parents=True, exist_ok=True)

  def save_upload(
    self,
    file_bytes: bytes,
    original_filename: str,
    content_type: str,
    base_url: str,
  ) -> StoredAsset:
    extension = self._resolve_extension(original_filename=original_filename, content_type=content_type)
    file_name = f"upload-{uuid4().hex}{extension}"
    file_path = self.uploads_dir / file_name
    file_path.write_bytes(file_bytes)
    return StoredAsset(
      file_path=file_path,
      file_name=file_name,
      public_url=self._build_public_url(base_url, file_name),
    )

  def save_generated_asset(
    self,
    source_reference: str,
    job_id: str,
    base_url: str,
  ) -> StoredAsset:
    extension = self._resolve_extension(original_filename=source_reference, content_type="")
    file_name = f"vton-{job_id}{extension}"
    file_path = self.uploads_dir / file_name

    if self._is_http_url(source_reference):
      response = httpx.get(source_reference, timeout=60.0)
      response.raise_for_status()
      file_path.write_bytes(response.content)
    else:
      source_path = Path(source_reference)
      if not source_path.exists():
        raise FileNotFoundError(f"Generated asset not found: {source_reference}")
      shutil.copyfile(source_path, file_path)

    return StoredAsset(
      file_path=file_path,
      file_name=file_name,
      public_url=self._build_public_url(base_url, file_name),
    )

  def resolve_provider_input_reference(self, reference: str) -> str:
    parsed = urlparse(reference or "")
    if parsed.scheme in {"http", "https"} and parsed.path.startswith("/static/uploads/"):
      file_name = Path(parsed.path).name
      candidate = self.uploads_dir / file_name
      if candidate.exists():
        return str(candidate)

    return reference

  def _build_public_url(self, base_url: str, file_name: str) -> str:
    clean_base_url = (base_url or "").rstrip("/")
    return f"{clean_base_url}/static/uploads/{file_name}"

  def _resolve_extension(self, original_filename: str, content_type: str) -> str:
    suffix = Path(urlparse(original_filename).path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}:
      return ".jpg" if suffix == ".jpeg" else suffix

    guessed = mimetypes.guess_extension(content_type or "") or ""
    guessed = guessed.lower()
    if guessed == ".jpe":
      guessed = ".jpg"

    return guessed if guessed in {".png", ".jpg", ".webp", ".bmp", ".gif"} else ".png"

  def _is_http_url(self, value: str) -> bool:
    lowered = (value or "").lower()
    return lowered.startswith("http://") or lowered.startswith("https://")
