# Runtime Stability Playbook (Expo + Vercel + Railway)

This document is the single source of truth for keeping feature parity between:

- Expo native app
- Expo web build deployed on Vercel
- Python backend deployed on Railway

## 1) Architecture contract

- Frontend (web/native) must call backend for:
  - background removal
  - face detection/look-face generation
  - Stripe upgrade payment verification
- Frontend must never rely on `localhost` in hosted production builds.

## 2) Required environment variables

### Vercel (frontend)

- `EXPO_PUBLIC_IMAGE_PIPELINE_URL=https://<backend-domain>`
- `EXPO_PUBLIC_AI_PROXY_URL=https://<backend-domain>`

### Railway (backend)

- `HOST=0.0.0.0`
- `PORT=8000`
- `PUBLIC_BASE_URL=https://<backend-domain>`
- `GEMINI_API_KEY=...`
- `STRIPE_SECRET_KEY=...`
- `STRIPE_WARDROBE_UPGRADE_PAYMENT_LINK_URL=https://buy.stripe.com/test_9B65kw1kzgrG8WB3Xu04800`
- `STRIPE_AI_LOOKS_UPGRADE_PAYMENT_LINK_URL=https://buy.stripe.com/test_9B65kw1kzgrG8WB3Xu04800`
- one of:
  - `REMOVE_BG_API_KEY=...`
  - `CLIPDROP_API_KEY=...`

## 3) Build-time guardrails

- `vercel.json` runs:
  - `npm run verify:web-env && npm run build:web`
- `npm run verify:web-env` fails CI/build if hosted env points to localhost or is missing backend URL.

## 4) Known parity-sensitive flows

1. AI generation limit flow:
   - free: 2
   - paid: 20
   - uses pending payment record + backend Stripe verification + fallback rules for test checkout.
2. Wardrobe limit flow:
   - free: 10
   - paid: 50
   - same verification model as AI flow.
3. CV pipeline flow:
   - all image processing paths must resolve backend URL via shared resolver.

## 5) Smoke test after each deploy

1. Open `https://<backend-domain>/health`.
2. Confirm:
   - `ok: true`
   - `stripe_upgrade_configured: true`
   - `stripe_wardrobe_payment_link_configured: true`
   - `stripe_ai_looks_payment_link_configured: true`
3. On Vercel web:
   - upload image -> background removal request succeeds.
   - AI generation reaches `2/2` -> upgrade modal opens.
   - complete Stripe payment -> return to app -> limit unlocks to 20.
4. On Expo native:
   - repeat same payment unlock check.

## 6) Cache notes

- After production deploy, do hard refresh (`Ctrl+Shift+R`) on web.
- If testing limit resets, clear local storage keys `renew_v3_*`.
