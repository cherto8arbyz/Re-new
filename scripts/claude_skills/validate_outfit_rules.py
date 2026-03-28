#!/usr/bin/env python3
"""
@file validate_outfit_rules.py
@brief Deterministic Styling Validator for Re:new's Hard Constraint Rules Engine.

This script is the source of truth for outfit validation. It ensures the styling engine
produces zero hallucinations by enforcing strict, deterministic business rules.
The AI/ML layer may suggest outfits, but every suggestion MUST pass through this validator.

@usage python validate_outfit_rules.py '<json_string>' <temperature_celsius>
@exitcode 0  Valid outfit — safe to render on canvas.
@exitcode 1  Invalid outfit — contains FATAL or WARNING violations.
"""

import sys
import json
from typing import Any

# ─────────────────────────────────────────────────────────────────────────────
# Type aliases (no `Any` in production paths)
# ─────────────────────────────────────────────────────────────────────────────
Outfit = list[dict[str, Any]]

# ─────────────────────────────────────────────────────────────────────────────
# Z-Index layer order constraint (mirrors the Flutter canvas spec)
# lower index = closer to body
# ─────────────────────────────────────────────────────────────────────────────
LAYER_ORDER: dict[str, int] = {
    "base": 0,
    "shirt": 1,
    "sweater": 1,
    "hoodie": 1,
    "pants": 1,
    "skirt": 1,
    "dress": 1,
    "jacket": 2,
    "coat": 3,
    "outerwear": 3,
    "accessory": 4,
}

WARM_MATERIALS: frozenset[str] = frozenset({"wool", "fur", "fleece", "cashmere"})
HEAVY_OUTER: frozenset[str] = frozenset({"jacket", "coat", "outerwear"})

# ─────────────────────────────────────────────────────────────────────────────
# Severity constants
# ─────────────────────────────────────────────────────────────────────────────
FATAL = "FATAL"
WARNING = "WARNING"


def validate(outfit: Outfit, temp_celsius: float) -> list[dict[str, str]]:
    """
    @brief Run all hard-constraint rules against the outfit.

    @param outfit         List of garment dicts. Each must have: category, material, fit.
    @param temp_celsius   Current ambient temperature in Celsius.
    @return               List of violation dicts with keys 'severity', 'rule', 'detail'.
    """
    violations: list[dict[str, str]] = []

    # ── Rule 1: Hot-weather material gate ────────────────────────────────────
    if temp_celsius > 25:
        for item in outfit:
            material: str = item.get("material", "").lower()
            if material in WARM_MATERIALS:
                violations.append({
                    "severity": FATAL,
                    "rule": "HOT_WEATHER_MATERIAL",
                    "detail": (
                        f"Item '{item.get('name', item.get('id', '?'))}' uses material "
                        f"'{material}' at {temp_celsius}C. "
                        f"Warm materials (wool/fur/fleece/cashmere) are blocked above 25C."
                    ),
                })

    # ── Rule 2: Double-oversize clash ─────────────────────────────────────────
    tops = [i for i in outfit if i.get("category", "").lower() in
            {"shirt", "sweater", "hoodie", "jacket", "coat", "outerwear", "dress"}]
    bottoms = [i for i in outfit if i.get("category", "").lower() in
               {"pants", "skirt"}]

    oversize_tops = [i for i in tops if i.get("fit", "").lower() == "oversize"]
    oversize_bottoms = [i for i in bottoms if i.get("fit", "").lower() == "oversize"]

    if oversize_tops and oversize_bottoms:
        top_names = ", ".join(i.get("name", i.get("id", "?")) for i in oversize_tops)
        bot_names = ", ".join(i.get("name", i.get("id", "?")) for i in oversize_bottoms)
        violations.append({
            "severity": WARNING,
            "rule": "DOUBLE_OVERSIZE_CLASH",
            "detail": (
                f"Both top(s) [{top_names}] and bottom(s) [{bot_names}] are 'oversize'. "
                "This silhouette typically reads as shapeless. Consider one fitted piece."
            ),
        })

    # ── Rule 3: Layer inversion — heavy outer under lighter layer ─────────────
    # Sort by z-index to detect inversions.
    def z(item: dict[str, Any]) -> int:
        return LAYER_ORDER.get(item.get("category", "").lower(), -1)

    sorted_items = sorted(outfit, key=z)
    for i, lower_item in enumerate(sorted_items):
        lower_cat = lower_item.get("category", "").lower()
        lower_z = LAYER_ORDER.get(lower_cat, -1)
        if lower_cat not in HEAVY_OUTER:
            continue
        # Any item that sits ABOVE this in the array but has LOWER z-index is an inversion
        for upper_item in sorted_items[i + 1:]:
            upper_cat = upper_item.get("category", "").lower()
            upper_z = LAYER_ORDER.get(upper_cat, -1)
            if upper_z < lower_z:
                violations.append({
                    "severity": FATAL,
                    "rule": "LAYER_INVERSION",
                    "detail": (
                        f"Layer inversion detected: '{lower_item.get('name', lower_cat)}' "
                        f"(category='{lower_cat}', z={lower_z}) is positioned UNDER "
                        f"'{upper_item.get('name', upper_cat)}' "
                        f"(category='{upper_cat}', z={upper_z}). "
                        "A heavy outer layer cannot be beneath a lighter layer."
                    ),
                })

    # ── Rule 4: Jacket-under-shirt specific case (explicit CTO rule) ──────────
    has_jacket = any(i.get("category", "").lower() in HEAVY_OUTER for i in outfit)
    slim_shirts_above = [
        i for i in outfit
        if i.get("category", "").lower() in {"shirt"}
        and i.get("fit", "").lower() == "slim"
    ]
    if has_jacket and slim_shirts_above:
        jacket = next(i for i in outfit if i.get("category", "").lower() in HEAVY_OUTER)
        jacket_z = LAYER_ORDER.get(jacket.get("category", "").lower(), -1)
        for shirt in slim_shirts_above:
            shirt_z = LAYER_ORDER.get(shirt.get("category", "").lower(), -1)
            if jacket_z < shirt_z:
                violations.append({
                    "severity": FATAL,
                    "rule": "JACKET_UNDER_SHIRT",
                    "detail": (
                        f"'{jacket.get('name', 'jacket')}' (z={jacket_z}) is layered "
                        f"UNDER slim shirt '{shirt.get('name', 'shirt')}' (z={shirt_z}). "
                        "This is a physically impossible layering state."
                    ),
                })

    return violations


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: validate_outfit_rules.py '<json_outfit>' <temperature_celsius>")
        print("Example: validate_outfit_rules.py '[{\"name\":\"Wool Coat\",\"category\":\"coat\",\"material\":\"wool\",\"fit\":\"slim\"}]' 28")
        sys.exit(1)

    try:
        outfit: Outfit = json.loads(sys.argv[1])
    except json.JSONDecodeError as exc:
        print(f"[FATAL] Invalid JSON input: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        temp = float(sys.argv[2])
    except ValueError:
        print(f"[FATAL] Temperature must be a number, got: '{sys.argv[2]}'", file=sys.stderr)
        sys.exit(1)

    violations = validate(outfit, temp)

    if not violations:
        print(f"[OK] Outfit is VALID at {temp}C. {len(outfit)} item(s) passed all rules.")
        sys.exit(0)

    # ── Print structured report ───────────────────────────────────────────────
    fatals = [v for v in violations if v["severity"] == FATAL]
    warnings = [v for v in violations if v["severity"] == WARNING]

    print(f"\n{'=' * 60}")
    print(f"  OUTFIT VALIDATION REPORT  |  Temp: {temp}C  |  Items: {len(outfit)}")
    print(f"{'=' * 60}")

    for v in violations:
        icon = "[!!]" if v["severity"] == FATAL else "[!] "
        print(f"\n{icon} [{v['severity']}] Rule: {v['rule']}")
        print(f"   {v['detail']}")

    print(f"\n{'-' * 60}")
    print(f"  Result: {len(fatals)} FATAL error(s), {len(warnings)} WARNING(s)")
    print(f"{'-' * 60}\n")

    sys.exit(1)


if __name__ == "__main__":
    main()
