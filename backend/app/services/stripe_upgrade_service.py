from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class StripeUpgradeVerificationResult:
  paid: bool
  configured: bool
  matched_session_id: str | None = None
  reason: str | None = None


class StripeUpgradeService:
  def __init__(
    self,
    secret_key: str,
    payment_link_url: str = "",
    api_base_url: str = "https://api.stripe.com",
  ) -> None:
    self.secret_key = (secret_key or "").strip()
    self.payment_link_url = (payment_link_url or "").strip().rstrip("/")
    self.api_base_url = (api_base_url or "https://api.stripe.com").strip().rstrip("/")
    self._resolved_payment_link_id: str | None = None

  @property
  def configured(self) -> bool:
    return bool(self.secret_key)

  def _headers(self) -> dict[str, str]:
    return {
      "Authorization": f"Bearer {self.secret_key}",
    }

  async def verify_upgrade_payment(
    self,
    reference_id: str,
    customer_email: str | None = None,
    created_after: int | None = None,
  ) -> StripeUpgradeVerificationResult:
    if not self.configured:
      return StripeUpgradeVerificationResult(
        paid=False,
        configured=False,
        reason="stripe_secret_key_not_configured",
      )

    clean_reference_id = (reference_id or "").strip()
    if not clean_reference_id:
      return StripeUpgradeVerificationResult(
        paid=False,
        configured=True,
        reason="missing_reference_id",
      )

    clean_email = (customer_email or "").strip()
    clean_created_after = max(0, int(created_after or 0))

    try:
      payment_link_id = await self._resolve_payment_link_id()
      session = await self._find_matching_paid_session(
        reference_id=clean_reference_id,
        customer_email=clean_email or None,
        created_after=clean_created_after or None,
        payment_link_id=payment_link_id,
      )
      if session:
        return StripeUpgradeVerificationResult(
          paid=True,
          configured=True,
          matched_session_id=str(session.get("id") or ""),
          reason="matched_paid_checkout_session",
        )
      return StripeUpgradeVerificationResult(
        paid=False,
        configured=True,
        reason="paid_session_not_found",
      )
    except Exception as exc:
      return StripeUpgradeVerificationResult(
        paid=False,
        configured=True,
        reason=f"verification_error:{exc}",
      )

  async def _resolve_payment_link_id(self) -> str | None:
    if self._resolved_payment_link_id:
      return self._resolved_payment_link_id
    if not self.payment_link_url:
      return None

    url = f"{self.api_base_url}/v1/payment_links"
    starting_after = None
    async with httpx.AsyncClient(timeout=20.0) as client:
      while True:
        params: dict[str, Any] = {"limit": 100}
        if starting_after:
          params["starting_after"] = starting_after

        response = await client.get(url, params=params, headers=self._headers())
        response.raise_for_status()
        payload = response.json() if response.content else {}
        data = payload.get("data", []) if isinstance(payload, dict) else []

        for link in data:
          link_url = str(link.get("url") or "").strip().rstrip("/")
          if link_url and link_url == self.payment_link_url:
            self._resolved_payment_link_id = str(link.get("id") or "").strip() or None
            return self._resolved_payment_link_id

        has_more = bool(payload.get("has_more")) if isinstance(payload, dict) else False
        if not has_more or not data:
          break

        starting_after = str(data[-1].get("id") or "").strip() or None
        if not starting_after:
          break
    return None

  async def _find_matching_paid_session(
    self,
    reference_id: str,
    customer_email: str | None,
    created_after: int | None,
    payment_link_id: str | None,
  ) -> dict[str, Any] | None:
    url = f"{self.api_base_url}/v1/checkout/sessions"
    starting_after = None
    fallback_email_match: dict[str, Any] | None = None
    fallback_any_match: dict[str, Any] | None = None
    async with httpx.AsyncClient(timeout=20.0) as client:
      while True:
        params: dict[str, Any] = {
          "limit": 100,
          "status": "complete",
        }
        if payment_link_id:
          params["payment_link"] = payment_link_id
        if created_after:
          params["created[gte]"] = str(created_after)
        if starting_after:
          params["starting_after"] = starting_after

        response = await client.get(url, params=params, headers=self._headers())
        response.raise_for_status()
        payload = response.json() if response.content else {}
        data = payload.get("data", []) if isinstance(payload, dict) else []

        for session in data:
          if str(session.get("status") or "") != "complete":
            continue
          payment_status = str(session.get("payment_status") or "")
          if payment_status not in {"paid", "no_payment_required"}:
            continue

          session_reference_id = str(session.get("client_reference_id") or "").strip()
          session_email = str((session.get("customer_details") or {}).get("email") or "").strip().lower()
          expected_email = str(customer_email or "").strip().lower()
          email_matches = not expected_email or (session_email and session_email == expected_email)

          if session_reference_id and session_reference_id == reference_id:
            if email_matches:
              return session
            continue

          if not created_after:
            continue

          # Fallback for Checkout Sessions where client_reference_id was not preserved.
          # Restrict fallback to recent sessions only and prefer exact email matches.
          if email_matches and fallback_email_match is None:
            fallback_email_match = session
          elif fallback_any_match is None:
            fallback_any_match = session

        has_more = bool(payload.get("has_more")) if isinstance(payload, dict) else False
        if not has_more or not data:
          break

        starting_after = str(data[-1].get("id") or "").strip() or None
        if not starting_after:
          break

    if fallback_email_match:
      return fallback_email_match
    if fallback_any_match:
      return fallback_any_match
    return None
