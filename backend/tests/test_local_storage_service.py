from __future__ import annotations

from pathlib import Path

from app.services.local_storage_service import LocalStorageService


def test_resolve_provider_input_reference_keeps_nested_identity_assets_local(tmp_path: Path) -> None:
  uploads_dir = tmp_path / "uploads"
  asset_path = uploads_dir / "identity" / "abc123" / "reference-01.webp"
  asset_path.parent.mkdir(parents=True, exist_ok=True)
  asset_path.write_bytes(b"webp-bytes")

  service = LocalStorageService(uploads_dir)

  resolved = service.resolve_provider_input_reference(
    "http://127.0.0.1:8000/static/uploads/identity/abc123/reference-01.webp"
  )

  assert resolved == str(asset_path.resolve())
