# Re:new Claude Code Skills — Validation Toolkit

**Owner:** Claude Code (Lead Backend/Architecture Engineer)
**Audience:** Internal — used by Claude Code before every commit. Do not skip.

These scripts are the **enforcement layer** for the architectural contracts defined in `CLAUDE.md`. Running them is not optional — they replace the need for calling real APIs, databases, or cloud services during local development.

---

## Prerequisites

```bash
# Python 3.10+ required (for TypedDict, match-case, type union syntax)
python --version

# Node.js 18+ required (for crypto.randomUUID(), structuredClone())
node --version
```

---

## Skill 1 — Deterministic Styling Validator

**File:** `validate_outfit_rules.py`
**When to run:** Before committing ANY code that touches the styling engine, outfit canvas, or garment state.

### Usage

```bash
# ── Basic valid outfit ────────────────────────────────────────────────────────
python scripts/claude_skills/validate_outfit_rules.py \
  '[{"name":"White Shirt","category":"shirt","material":"cotton","fit":"slim"},{"name":"Navy Chinos","category":"pants","material":"cotton","fit":"regular"}]' \
  20

# Expected: exit 0 — "Outfit is VALID at 20.0°C"

# ── FATAL: Wool coat at 28°C ──────────────────────────────────────────────────
python scripts/claude_skills/validate_outfit_rules.py \
  '[{"name":"Wool Coat","category":"coat","material":"wool","fit":"regular"}]' \
  28

# Expected: exit 1 — FATAL HOT_WEATHER_MATERIAL

# ── WARNING: Double oversize ──────────────────────────────────────────────────
python scripts/claude_skills/validate_outfit_rules.py \
  '[{"name":"Big Hoodie","category":"hoodie","material":"cotton","fit":"oversize"},{"name":"Baggy Pants","category":"pants","material":"cotton","fit":"oversize"}]' \
  15

# Expected: exit 1 — WARNING DOUBLE_OVERSIZE_CLASH

# ── FATAL: Layer inversion (jacket under shirt) ───────────────────────────────
python scripts/claude_skills/validate_outfit_rules.py \
  '[{"name":"Heavy Jacket","category":"jacket","material":"leather","fit":"regular"},{"name":"Slim Shirt","category":"shirt","material":"cotton","fit":"slim"}]' \
  15

# Expected: exit 1 — FATAL LAYER_INVERSION + JACKET_UNDER_SHIRT
```

### What it enforces

| Rule | Trigger | Severity |
|---|---|---|
| `HOT_WEATHER_MATERIAL` | wool/fur/fleece/cashmere above 25°C | FATAL |
| `DOUBLE_OVERSIZE_CLASH` | oversize top AND oversize bottom | WARNING |
| `LAYER_INVERSION` | heavy outer layer (z≥2) beneath lighter layer (z<2) | FATAL |
| `JACKET_UNDER_SHIRT` | jacket z-index < shirt z-index | FATAL |

---

## Skill 2 — UI Stress Tester / Mock Seeder

**File:** `seed_heavy_wardrobe.js`
**When to run:** Before committing changes to any FlashList, WatermelonDB schema, or wardrobe list component.

### Usage

```bash
# ── Default: 1000 items → ./mock_db.json ─────────────────────────────────────
node scripts/claude_skills/seed_heavy_wardrobe.js

# ── Stress test: 5000 items ───────────────────────────────────────────────────
node scripts/claude_skills/seed_heavy_wardrobe.js 5000

# ── Custom output path ────────────────────────────────────────────────────────
node scripts/claude_skills/seed_heavy_wardrobe.js 1000 ./src/__mocks__/mock_db.json
```

### Pass criteria

- Total seed time under **500ms** for 1000 items.
- File must contain valid JSON with `items[]` and `meta` keys.
- Inspect `cost_per_wear`, `is_synced`, `decade_origin` distribution for realism.

### Using mock_db.json in tests

```typescript
// In your Jest/Detox test:
import mockDb from '../../scripts/claude_skills/mock_db.json';
const items = mockDb.items; // WardrobeItem[]
```

---

## Skill 3 — Marketplace Parser Simulator

**File:** `mock_marketplace_parser.py`
**When to run:** Before committing any code in the "Import via URL" feature flow.

### Usage

```bash
# ── Wildberries URL ───────────────────────────────────────────────────────────
python scripts/claude_skills/mock_marketplace_parser.py \
  'https://www.wildberries.ru/catalog/12345678/detail.aspx'

# ── Ozon URL ──────────────────────────────────────────────────────────────────
python scripts/claude_skills/mock_marketplace_parser.py \
  'https://www.ozon.ru/product/some-jacket-98765432/'

# ── Lamoda URL ────────────────────────────────────────────────────────────────
python scripts/claude_skills/mock_marketplace_parser.py \
  'https://www.lamoda.ru/p/la123456/clothes/jacket/'

# ── Unsupported marketplace (must fail) ───────────────────────────────────────
python scripts/claude_skills/mock_marketplace_parser.py \
  'https://www.zara.com/en/shirt-123456.html'

# Expected: exit 1 — UNSUPPORTED_MARKETPLACE error JSON
```

### Output shape (on success, exit 0)

```json
{
  "source_url": "...",
  "marketplace": "wildberries",
  "product_id": "12345678",
  "brand": "COS",
  "name": "COS black shirt",
  "category": "shirt",
  "material": "cotton",
  "color": "black",
  "price_rub": 4200,
  "original_image_url": "https://mock-cdn.renew.local/parsed/wildberries/12345678/original.webp",
  "background_removed_image_url": "https://mock-cdn.renew.local/parsed/wildberries/12345678/nobg.png",
  "decade_origin": 2000,
  "tags": ["black", "cotton", "shirt", "decade-2000", "wildberries"],
  "note": "[MOCK DATA] Background removal is performed on-device..."
}
```

**Note:** The `background_removed_image_url` field is populated after on-device processing. Never call a cloud API to compute it — validate with Skill 4.

---

## Skill 4 — Edge AI Latency Simulator

**File:** `simulate_edge_ml.js`
**When to run:** Before committing ANY code related to background removal, image upload, or image processing pipelines.

### Usage

```bash
# ── Valid local mock path ─────────────────────────────────────────────────────
node scripts/claude_skills/simulate_edge_ml.js ./test/fixtures/jacket_mock.jpg

# Expected: exit 0 — ~1500ms simulated latency, SLA met, 0 cloud calls

# ── ARCHITECTURAL VIOLATION TEST: cloud URL must fail ─────────────────────────
node scripts/claude_skills/simulate_edge_ml.js 'https://some-bucket.s3.amazonaws.com/upload.jpg'
# Expected: exit 1 — FATAL ARCHITECTURAL VIOLATION (AWS detected)

node scripts/claude_skills/simulate_edge_ml.js 'https://api.remove.bg/v1.0/removebg'
# Expected: exit 1 — FATAL ARCHITECTURAL VIOLATION (remove.bg detected)
```

### Pass criteria

- Exit code 0 for local paths.
- Exit code 1 (with ARCHITECTURAL VIOLATION message) for any cloud API URL.
- `inference_ms` ≤ 2000 (SLA from CLAUDE.md).
- `network_calls_made` must always be 0.

---

## Pre-Commit Checklist for Claude Code

Run these commands in sequence before every `git commit`. If any exits with code 1, **do not commit**.

```bash
# 1. Validate a representative outfit (always test edge cases)
python scripts/claude_skills/validate_outfit_rules.py \
  '[{"name":"Wool Sweater","category":"sweater","material":"wool","fit":"regular"}]' 30
# Must exit 1 (FATAL) — confirms the validator is alive

# 2. Seed 1000 items — confirms list components won't lag
node scripts/claude_skills/seed_heavy_wardrobe.js 1000

# 3. Confirm marketplace parser works for all 3 supported markets
python scripts/claude_skills/mock_marketplace_parser.py 'https://www.wildberries.ru/catalog/99999999/detail.aspx'
python scripts/claude_skills/mock_marketplace_parser.py 'https://www.ozon.ru/product/test-item-11111111/'
python scripts/claude_skills/mock_marketplace_parser.py 'https://www.lamoda.ru/p/la999999/clothes/coat/'

# 4. Confirm Edge AI guard blocks cloud APIs
node scripts/claude_skills/simulate_edge_ml.js 'https://bucket.s3.amazonaws.com/img.jpg'
# Must exit 1 — confirms architectural guard is active

# 5. Confirm Edge AI succeeds on local path
node scripts/claude_skills/simulate_edge_ml.js ./test/fixtures/mock_item.jpg
# Must exit 0
```

---

## Architectural Contracts Enforced by These Skills

| Contract | Enforced by |
|---|---|
| No wool/fur above 25°C | Skill 1 (FATAL) |
| No layer inversions on Z-canvas | Skill 1 (FATAL) |
| FlashList renders 1000+ items with 0 lag | Skill 2 (performance gate) |
| No real HTTP calls to marketplaces during dev | Skill 3 (mock only) |
| Background removal is ALWAYS on-device | Skill 4 (cloud URL = exit 1) |
| SLA: bg removal < 2 seconds | Skill 4 (SLA check) |
