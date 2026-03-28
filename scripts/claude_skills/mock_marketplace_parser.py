#!/usr/bin/env python3
"""
@file mock_marketplace_parser.py
@brief Marketplace Parser Simulator for Re:new's "Import via URL" feature.

Simulates parsing product pages from Russian fashion marketplaces WITHOUT making
real HTTP requests. This protects against IP bans during development and provides
deterministic, reproducible test data.

Supported marketplaces: Wildberries, Ozon, Lamoda.

@usage python mock_marketplace_parser.py '<url>'
@exitcode 0  Parsed successfully — JSON printed to stdout.
@exitcode 1  Unsupported marketplace or malformed URL.
"""

import sys
import json
import re
import hashlib
from typing import TypedDict
from urllib.parse import urlparse

# ─────────────────────────────────────────────────────────────────────────────
# Type definitions
# ─────────────────────────────────────────────────────────────────────────────

class ParsedProduct(TypedDict):
    source_url: str
    marketplace: str
    product_id: str
    brand: str
    name: str
    category: str
    material: str
    color: str
    price_rub: int
    original_image_url: str
    background_removed_image_url: str
    decade_origin: int
    tags: list[str]
    note: str


class ParseError(TypedDict):
    error: str
    code: str
    url: str


# ─────────────────────────────────────────────────────────────────────────────
# Marketplace registry — hostname → internal key
# ─────────────────────────────────────────────────────────────────────────────
SUPPORTED: dict[str, str] = {
    "wildberries.ru": "wildberries",
    "www.wildberries.ru": "wildberries",
    "ozon.ru": "ozon",
    "www.ozon.ru": "ozon",
    "lamoda.ru": "lamoda",
    "www.lamoda.ru": "lamoda",
}

# ─────────────────────────────────────────────────────────────────────────────
# Mock product pools — deterministic based on product_id hash
# ─────────────────────────────────────────────────────────────────────────────
_BRANDS: list[str] = ["COS", "Arket", "Befree", "12 Storeez", "Sela", "Love Republic", "Zarina"]
_CATEGORIES: list[str] = ["shirt", "pants", "dress", "jacket", "sweater", "coat", "skirt"]
_MATERIALS: list[str] = ["cotton", "polyester", "wool", "linen", "denim", "silk", "synthetic"]
_COLORS: list[str] = ["black", "white", "navy", "beige", "grey", "olive", "camel"]
_DECADES: list[int] = [1980, 1990, 2000, 2010, 2020]

MOCK_CDN = "https://mock-cdn.renew.local/parsed"


def _deterministic_pick(lst: list, seed: str) -> object:
    """Pick a list item deterministically from a URL-derived seed (no randomness)."""
    idx = int(hashlib.sha256(seed.encode()).hexdigest(), 16) % len(lst)
    return lst[idx]


def _extract_product_id(url: str, marketplace: str) -> str:
    """
    @brief Extract a product identifier from a marketplace URL path.
    Falls back to a hash of the full URL if no numeric ID is found.
    """
    # Wildberries: /catalog/12345678/detail.aspx  or  /catalog/12345678/
    # Ozon:        /product/some-slug-12345678/
    # Lamoda:      /p/la123456/
    match = re.search(r'(\d{5,12})', url)
    if match:
        return match.group(1)
    # Fallback: hash-based pseudo-ID
    return hashlib.md5(url.encode()).hexdigest()[:10]


def parse_url(raw_url: str) -> tuple[ParsedProduct | None, ParseError | None]:
    """
    @brief Validate URL and return mock parsed product data.

    @param raw_url  The URL string submitted by the user.
    @return         Tuple of (product, None) on success, (None, error) on failure.
    """
    # ── Basic URL validation ──────────────────────────────────────────────────
    try:
        parsed = urlparse(raw_url)
    except Exception as exc:
        return None, {"error": f"Malformed URL: {exc}", "code": "INVALID_URL", "url": raw_url}

    if not parsed.scheme or not parsed.netloc:
        return None, {
            "error": "URL must include scheme (https://) and hostname.",
            "code": "INVALID_URL",
            "url": raw_url,
        }

    hostname = parsed.netloc.lower()
    marketplace = SUPPORTED.get(hostname)

    if not marketplace:
        supported_list = ", ".join(sorted(set(SUPPORTED.values())))
        return None, {
            "error": (
                f"Unsupported marketplace: '{hostname}'. "
                f"Supported: {supported_list}."
            ),
            "code": "UNSUPPORTED_MARKETPLACE",
            "url": raw_url,
        }

    # ── Deterministic mock data generation ───────────────────────────────────
    product_id = _extract_product_id(raw_url, marketplace)
    seed = f"{marketplace}:{product_id}"

    brand = str(_deterministic_pick(_BRANDS, seed + "brand"))
    category = str(_deterministic_pick(_CATEGORIES, seed + "cat"))
    material = str(_deterministic_pick(_MATERIALS, seed + "mat"))
    color = str(_deterministic_pick(_COLORS, seed + "color"))
    decade = int(_deterministic_pick(_DECADES, seed + "decade"))  # type: ignore[arg-type]
    # Price determinism: derive from product_id numeric hash
    price_seed = int(hashlib.sha256((seed + "price").encode()).hexdigest(), 16)
    price_rub = 1_500 + (price_seed % 48_500)  # Range: 1,500–50,000 RUB

    product: ParsedProduct = {
        "source_url": raw_url,
        "marketplace": marketplace,
        "product_id": product_id,
        "brand": brand,
        "name": f"{brand} {color} {category}",
        "category": category,
        "material": material,
        "color": color,
        "price_rub": price_rub,
        # Simulated original image — Edge AI will process this on-device
        "original_image_url": f"{MOCK_CDN}/{marketplace}/{product_id}/original.webp",
        # Background removal happens ON-DEVICE (CoreML/ONNX). This field is populated
        # AFTER local processing, not by a cloud API call.
        "background_removed_image_url": f"{MOCK_CDN}/{marketplace}/{product_id}/nobg.png",
        "decade_origin": decade,
        "tags": [color, material, category, f"decade-{decade}", marketplace],
        "note": (
            "[MOCK DATA] Background removal is performed on-device via ONNX Runtime. "
            "Never send original images to a cloud API for processing. "
            "Run simulate_edge_ml.js to validate Edge AI pipeline."
        ),
    }

    return product, None


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: mock_marketplace_parser.py '<url>'")
        print("Example: mock_marketplace_parser.py 'https://www.wildberries.ru/catalog/12345678/detail.aspx'")
        sys.exit(1)

    raw_url = sys.argv[1]
    product, error = parse_url(raw_url)

    if error:
        print(json.dumps(error, ensure_ascii=False, indent=2))
        sys.exit(1)

    print(json.dumps(product, ensure_ascii=False, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
