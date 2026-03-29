# Codebase Stability Audit (2026-03-29)

## Scope

- Runtime parity between Expo native and Vercel web.
- Backend dependency correctness (Railway).
- Payment unlock and CV pipeline reliability.

## Findings (before fixes)

1. Production web/backend URL drift:
   - Multiple services still defaulted to `127.0.0.1`, causing hosted web requests to fail when env vars were incomplete.
2. Incomplete web payment verification:
   - Web payment flow did not consistently verify Stripe checkout against backend session state.
3. Missing deployment guardrail:
   - Vercel build could succeed with broken backend env configuration.
4. Documentation drift:
   - Environment requirements for Stripe verification were not explicit enough in deploy docs.

## Implemented fixes

1. Added shared backend URL resolver:
   - `src/shared/backend-base-url.js`
   - Dev-only local fallback; no silent localhost fallback in hosted production.
2. Switched CV-related services to shared resolver:
   - `src/services/cv-service.js`
   - `src/services/background-removal-service.js`
   - `src/services/look-face-generation-service.js`
3. Unified payment verification URL resolution:
   - `src/services/upgrade-payment.js`
   - `src/native/services/upgrade-payment.ts`
4. Added Vercel env build guard:
   - `scripts/verify-web-env.mjs`
   - `package.json` script: `verify:web-env`
   - `vercel.json` build command now runs env validation before build.
5. Updated deployment documentation:
   - `docs/public-web-deploy.md`
   - `docs/runtime-stability-playbook.md`
   - `backend/README.md`
6. Updated config examples to avoid misleading hosted defaults:
   - `src/config.example.js`

## Verification executed

- `npm run typecheck` passed.
- `npm test` passed (`237 passed`).
- `npm run verify:web-env` executed (warns in local env, blocks broken hosted env).
- `npm run build:web` passed.

## Residual operational risks

1. Stripe mode mismatch:
   - test payment links must use test secret keys.
   - live payment links must use live secret keys.
2. Hosted env changes require redeploy:
   - Vercel env edits do not apply until rebuild/redeploy.
3. Browser cache/local storage:
   - stale local keys can mask expected behavior in manual QA.

## Recommended release process

1. Deploy backend first and verify `/health`.
2. Deploy frontend with validated env (`verify:web-env`).
3. Run smoke test checklist from `docs/runtime-stability-playbook.md`.
