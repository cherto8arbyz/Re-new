# Re:new - Strategic Project Context & Engineering Guidelines

## 1. Project Identity
**Product:** Re:new — B2C/B2B Fashion Tech App.
**Mission:** Kill the "Data Hostage" model. Provide frictionless wardrobe digitization, deterministic AI styling, and offline-first performance.
**Target:** 0 latency on UI, <2 sec background removal (Edge AI), 0 AI hallucinations.

## 2. CTO's Core Directives (READ CAREFULLY)
I am the CTO. I hate "magic", subjective AI, and bloated AWS bills. Follow these rules strictly:
- **No LLM Hallucinations for Styling:** The styling engine is a **Rules Engine (Hard Constraints)** first, ML second. Do not use generative AI to mix outfits. Use deterministic logic (e.g., `if temp > 25°C -> block wool`; `if layer1 == oversize -> layer2 != slim`).
- **Offline-First is Mandatory:** The app must work in airplane mode. Use local databases (WatermelonDB/SQLite) as the source of truth. Sync to the cloud (PostgreSQL) in the background.
- **Edge AI over Cloud AI:** Background removal and basic image tagging must happen on the device (CoreML/ONNX) to save server costs and ensure instant feedback.
- **Defensive Programming:** Users will upload 10MB HEIC photos sideways. Handle EXIF orientation automatically. Compress images locally before saving/uploading.
- **Strict Typing:** TypeScript and Python type hints are non-negotiable. No `any`.

## 3. Tech Stack
- **Mobile Frontend:** React Native (Expo) + TypeScript + Zustand (State) + WatermelonDB (Local Offline DB).
- **Backend:** Python + FastAPI + SQLAlchemy + PostgreSQL + Redis.
- **Infrastructure:** AWS S3 (Image storage - compressed WebP only).
- **AI/ML:** ONNX Runtime (React Native) for Edge background removal. Python Rules Engine for styling.

## 4. Architectural Patterns
- **Lazy Loading & Pagination:** The user might have 1000 items. Never render all at once. Use FlashList (Shopify) for infinite scrolling.
- **Conflict Resolution:** When syncing local DB with remote DB, use timestamp-based conflict resolution (Last-Write-Wins).
- **Undo/Redo:** The outfit canvas must have a state history. Do not mutate state directly; use immutable updates.

## 5. Development Workflow for Codex
- **Think before you write:** Plan the architecture of a component/module before generating code.
- **Atomic Commits:** Keep changes small and focused.
- **Testable Logic:** Extract business logic (e.g., weather matching, color theory) into pure functions that can be unit-tested without React/FastAPI context.
- **Mock External APIs:** Do not call real Weather or Marketplace APIs during development. Use mock data.

## 6. Key Business Logic (The "Why")
- **Anti-Hostage Policy:** Unlimited items for free. Monetization is in Analytics, Trend Forecasting, and B2B Stylist tools.
- **Cost-Per-Wear (CPW):** Every time an item is used in a logged outfit, update its CPW metric.
- **Fashion Cycles:** Items have a `decade_origin` tag. The system will highlight items when their 20-year cycle returns.

