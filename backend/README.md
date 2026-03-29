# Image Pipeline Backend

## Setup

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and set keys.

Background removal provider keys:
- `BACKGROUND_REMOVAL_PROVIDER=remove_bg` (default) or `clipdrop`
- `REMOVE_BG_API_KEY=...`
- `CLIPDROP_API_KEY=...` (optional fallback/alternative)
- `GEMINI_API_KEY=...` (used by `/api/ai/generate-content`)
- `AI_GENERATION_PROVIDER=replicate` or `huggingface`
- `DATABASE_URL=...` (optional; by default SQLite is created under `backend/app/data/renew_mvp.db`)
- `PUBLIC_BASE_URL=http://127.0.0.1:8000`
- `HUGGING_FACE_SPACE_ID=yisol/IDM-VTON`
- `HUGGING_FACE_API_NAME=/tryon`
- `HUGGING_FACE_TOKEN=...` (optional)
- `REPLICATE_API_TOKEN=...`
- `REPLICATE_MODEL=owner/name` or `owner/name:version`
- `REPLICATE_USER_IMAGE_INPUT_NAME=human_img`
- `REPLICATE_GARMENT_IMAGE_INPUT_NAME=garm_img`
- `REPLICATE_GARMENT_DESCRIPTION_INPUT_NAME=garment_des`
- `REPLICATE_GARMENT_DESCRIPTION=...`
- `REPLICATE_EXTRA_INPUT_JSON={}`

## Run

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## Railway quick deploy

1. Connect the repository in Railway.
2. Set service `Root Directory` to `backend`.
3. Enable a public domain.
4. Set required env vars: `GEMINI_API_KEY`, and `REMOVE_BG_API_KEY` or `CLIPDROP_API_KEY`.
5. Set Stripe vars for paid unlock verification: `STRIPE_SECRET_KEY` (required), optionally `STRIPE_WARDROBE_UPGRADE_PAYMENT_LINK_URL` and `STRIPE_AI_LOOKS_UPGRADE_PAYMENT_LINK_URL`.
6. For fal.ai generation also set: `AI_GENERATION_PROVIDER=fal`, `FAL_KEY`, `FAL_MODEL_ID` (optional override).
7. Optionally set `DATABASE_URL` to Railway Postgres.
8. Use `backend/.env.railway.example` to copy variables line-by-line.

Health check endpoint: `GET /health`

## Endpoints

- `POST /api/ai/generate-content` - server-side Gemini proxy for public web builds
- `POST /api/v1/upload` - save source image under `/static/uploads` and return a fully qualified URL
- `POST /api/v1/vton/generate` - create an async VTON generation job and return a job id immediately
- `POST /api/v1/generate-look` - alias for the async VTON generation endpoint
- `GET /api/v1/vton/jobs/{job_id}` - poll generation status and result URL
- `GET /api/v1/jobs/{job_id}` - alias for polling generation status
- `POST /api/image/background-remove` - remove.bg background removal
- `POST /api/image/face-detect` - MediaPipe face detection
- `POST /api/image/look-face-generate` - normalized look-face portrait asset
- `GET /health`
