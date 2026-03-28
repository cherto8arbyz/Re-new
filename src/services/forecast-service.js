import { createOutfit } from '../models/outfit.js';
import { sortByLayer, validateLayers } from '../canvas/z-index-manager.js';

/**
 * Deterministic fallback outfit generation.
 * Uses wardrobe and weather constraints only; never fabricates items.
 *
 * @param {string} _date
 * @param {import('../models/weather.js').Weather} weather
 * @param {string | null} _userAvatar
 * @param {import('../models/garment.js').Garment[]} wardrobeList
 * @returns {Promise<import('../models/outfit.js').Outfit[]>}
 */
export async function generateOptimalOutfit(_date, weather, _userAvatar, wardrobeList) {
  const wardrobe = Array.isArray(wardrobeList) ? wardrobeList.filter(item => !item.requiresReview) : [];
  if (wardrobe.length === 0) return [];

  const shirts = wardrobe.filter(g => g.category === 'shirt');
  const pants = wardrobe.filter(g => g.category === 'pants');
  const socks = wardrobe.filter(g => g.category === 'socks');
  const shoes = wardrobe.filter(g => g.category === 'shoes');
  const sweaters = wardrobe.filter(g => g.category === 'sweater');
  const outerwear = wardrobe.filter(g => g.category === 'outerwear');
  const accessories = wardrobe.filter(g => g.category === 'accessory');
  const base = wardrobe.filter(g => g.category === 'base');

  if (shirts.length === 0 || pants.length === 0 || shoes.length === 0) {
    return [];
  }

  /** @type {import('../models/outfit.js').Outfit[]} */
  const outfits = [];
  const maxCount = Math.min(3, Math.max(1, shirts.length, pants.length, shoes.length));

  for (let i = 0; i < maxCount; i++) {
    /** @type {import('../models/garment.js').Garment[]} */
    const combo = [];
    if (base.length > 0) combo.push(base[i % base.length]);
    combo.push(shirts[i % shirts.length]);
    combo.push(pants[i % pants.length]);
    if (socks.length > 0) combo.push(socks[i % socks.length]);
    combo.push(shoes[i % shoes.length]);

    if (weather.temperature <= 15 && sweaters.length > 0) combo.push(sweaters[i % sweaters.length]);
    if (weather.temperature <= 8 && outerwear.length > 0) combo.push(outerwear[i % outerwear.length]);
    if (accessories.length > 0) combo.push(accessories[i % accessories.length]);

    const validation = validateLayers(combo);
    if (!validation.valid) continue;

    outfits.push(createOutfit({
      name: `Suggested Look ${i + 1}`,
      garments: sortByLayer(combo),
      styleName: weather.temperature <= 8 ? 'Weather Ready Layered' : 'Weather Ready Daily',
      confidenceScore: 0.84,
    }));
  }

  return dedupeOutfits(outfits).slice(0, 3);
}

/**
 * @param {import('../models/outfit.js').Outfit[]} outfits
 * @returns {import('../models/outfit.js').Outfit[]}
 */
function dedupeOutfits(outfits) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {import('../models/outfit.js').Outfit[]} */
  const unique = [];
  for (const outfit of outfits) {
    const key = outfit.garments.map(g => g.id).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(outfit);
  }
  return unique;
}
