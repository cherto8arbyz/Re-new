# Public Web Deploy

This project can be published as a public web app with near-Expo behavior if you deploy two parts:

1. A static Expo web build.
2. The Python backend from `backend/`, which now also proxies Gemini requests.

## 1. Backend on Railway (recommended)

1. Create a new Railway project from this repository.
2. Create a service with `Root Directory` set to `backend`.
3. Railway will build from `backend/Dockerfile`.
4. Enable a public domain for the service.
5. Set the environment variables below.
6. Use `backend/.env.railway.example` as a line-by-line template for Railway Variables.

Required backend environment variables:

- `GEMINI_API_KEY` (Gemini proxy endpoint)
- `REMOVE_BG_API_KEY` or `CLIPDROP_API_KEY` (background removal provider)

Optional backend environment variables:

- `AI_GENERATION_PROVIDER=fal` (recommended)
- `FAL_KEY` and `FAL_MODEL_ID` if `AI_GENERATION_PROVIDER=fal`
- `BACKGROUND_REMOVAL_PROVIDER=remove_bg`
- `PORT=8000`
- `PUBLIC_BASE_URL=https://<your-railway-domain>` (if not set, request base URL is used)
- `DATABASE_URL=...` (Railway Postgres plugin connection string)

Health check:

- `GET /health`

Core public endpoints used by the web app:

- `POST /api/ai/generate-content`
- `POST /api/image/background-remove`
- `POST /api/image/face-detect`
- `POST /api/image/look-face-generate`

Notes:

- If `DATABASE_URL` points to Postgres, the backend now runs without sqlite-only arguments.
- Uploaded/generated files are stored in container filesystem by default and may reset on redeploy.

## 2. Frontend

Set these build-time variables in your web host:

- `EXPO_PUBLIC_BACKEND_PROVIDER=supabase`
- `EXPO_PUBLIC_SUPABASE_URL=...`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY=...`
- `EXPO_PUBLIC_SUPABASE_BUCKET_ORIGINALS=wardrobe-originals`
- `EXPO_PUBLIC_SUPABASE_BUCKET_CUTOUTS=wardrobe-cutouts`
- `EXPO_PUBLIC_IMAGE_PIPELINE_URL=https://<your-railway-domain>`
- `EXPO_PUBLIC_AI_PROXY_URL=https://<your-railway-domain>`
- `EXPO_PUBLIC_GOOGLE_CALENDAR_ID=primary`
- `EXPO_PUBLIC_USER_TIMEZONE=Europe/Minsk`

Optional public variables:

- `EXPO_PUBLIC_GCP_CALENDAR_KEY`
- `EXPO_PUBLIC_OPENWEATHER_API_KEY`

Avoid exposing `EXPO_PUBLIC_GEMINI_API_KEY` in a public production build when the backend proxy is available.

Build command:

`npm run build:web`

Output directory:

`dist`

## 3. Suggested hosting split

- Frontend: Vercel or Netlify
- Backend: Render, Railway, Fly.io, or any VPS with Docker

## 4. Local verification

Frontend:

`npm run build:web`

Backend:

`cd backend`

`uvicorn app.main:app --host 127.0.0.1 --port 8000`
