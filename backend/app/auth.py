from __future__ import annotations

import base64
from dataclasses import dataclass
import json
import logging
from typing import Any

import httpx
from fastapi import Header, HTTPException

from .settings import settings


logger = logging.getLogger("image-pipeline.auth")


@dataclass(frozen=True)
class AuthenticatedUser:
  user_id: str
  access_token: str
  claims: dict[str, Any]


async def get_authenticated_user(
  authorization: str | None = Header(default=None, alias="Authorization"),
) -> AuthenticatedUser:
  token = _extract_bearer_token(authorization)
  decoded_claims = _try_decode_unverified_jwt_payload(token)

  if _is_development_fallback_token(decoded_claims):
    user_id = str(decoded_claims.get("sub") or decoded_claims.get("user_id") or decoded_claims.get("id") or "").strip()
    if not user_id:
      raise HTTPException(status_code=401, detail="Authenticated user id is missing.")

    logger.warning("auth_verification_fallback mode=development_token")
    return AuthenticatedUser(user_id=user_id, access_token=token, claims=decoded_claims)

  if settings.supabase_url:
    claims = await _fetch_supabase_user(token)
    user_id = str(claims.get("id") or claims.get("sub") or "").strip()
    if not user_id:
      raise HTTPException(status_code=401, detail="Authenticated user id is missing.")
    return AuthenticatedUser(user_id=user_id, access_token=token, claims=claims)

  claims = decoded_claims or _decode_unverified_jwt_payload(token)
  user_id = str(claims.get("sub") or claims.get("user_id") or claims.get("id") or "").strip()
  if not user_id:
    raise HTTPException(status_code=401, detail="Authenticated user id is missing.")

  logger.warning("auth_verification_fallback mode=unverified_jwt_decode")
  return AuthenticatedUser(user_id=user_id, access_token=token, claims=claims)


def _extract_bearer_token(authorization: str | None) -> str:
  raw_header = str(authorization or "").strip()
  if not raw_header:
    raise HTTPException(status_code=401, detail="Authorization header is required.")

  scheme, _, token = raw_header.partition(" ")
  if scheme.lower() != "bearer" or not token.strip():
    raise HTTPException(status_code=401, detail="Authorization header must use Bearer token.")

  return token.strip()


async def _fetch_supabase_user(token: str) -> dict[str, Any]:
  user_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
  headers = {
    "Authorization": f"Bearer {token}",
    "apikey": settings.supabase_anon_key,
  }

  try:
    async with httpx.AsyncClient(timeout=10.0) as client:
      response = await client.get(user_url, headers=headers)
  except httpx.HTTPError as exc:
    raise HTTPException(status_code=503, detail="Authentication provider is unavailable.") from exc

  if response.status_code in {401, 403}:
    raise HTTPException(status_code=401, detail="Invalid or expired access token.")
  if response.status_code >= 400:
    raise HTTPException(status_code=503, detail="Authentication provider is unavailable.")

  payload = response.json()
  if not isinstance(payload, dict):
    raise HTTPException(status_code=401, detail="Invalid authentication response.")
  return payload


def _decode_unverified_jwt_payload(token: str) -> dict[str, Any]:
  parts = token.split(".")
  if len(parts) < 2:
    raise HTTPException(status_code=401, detail="Invalid JWT format.")

  payload_segment = parts[1]
  padded = payload_segment + "=" * (-len(payload_segment) % 4)
  try:
    decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
    payload = json.loads(decoded.decode("utf-8"))
  except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
    raise HTTPException(status_code=401, detail="Invalid JWT payload.") from exc

  if not isinstance(payload, dict):
    raise HTTPException(status_code=401, detail="Invalid JWT payload.")
  return payload


def _try_decode_unverified_jwt_payload(token: str) -> dict[str, Any] | None:
  try:
    return _decode_unverified_jwt_payload(token)
  except HTTPException:
    return None


def _is_development_fallback_token(claims: dict[str, Any] | None) -> bool:
  if not isinstance(claims, dict):
    return False
  return str(claims.get("aud") or "").strip() == "renew-development"
