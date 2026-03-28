import { createOutfit } from '../models/outfit.js';
import { validateLayers, sortByLayer } from '../canvas/z-index-manager.js';
import { getAll } from './wardrobe-repository.js';

/**
 * Stub: AI Outfit generation engine.
 * API contract: forecastService.getOptimalOutfit(date, weather, calendarEvent)
 * @param {import('../models/weather.js').Weather} weather
 * @param {import('../models/garment.js').Garment[]} [wardrobe]
 * @returns {Promise<import('../models/outfit.js').Outfit[]>}
 */
export async function generateOutfitSuggestions(weather, wardrobe) {
  await new Promise(r => setTimeout(r, 400));

  const items = wardrobe || getAll();
  const temp = weather.temperature;

  // Filter weather-appropriate garments
  const shirts = items.filter(g => g.category === 'shirt');
  const sweaters = items.filter(g => g.category === 'sweater');
  const outerwear = items.filter(g => g.category === 'outerwear');
  const pants = items.filter(g => g.category === 'pants');
  const socks = items.filter(g => g.category === 'socks');
  const shoes = items.filter(g => g.category === 'shoes');
  const accessories = items.filter(g => g.category === 'accessory');

  /** @type {import('../models/outfit.js').Outfit[]} */
  const outfits = [];
  const styleNames = ['Smart Casual', 'Street Style', 'Minimalist', 'Classic', 'Urban Chic'];

  // Generate 3-5 combinations
  const count = Math.min(5, Math.max(3, shirts.length));

  for (let i = 0; i < count; i++) {
    /** @type {import('../models/garment.js').Garment[]} */
    const garments = [];

    // Always pick a shirt
    if (shirts.length) garments.push(shirts[i % shirts.length]);

    // Add sweater if cold
    if (temp < 15 && sweaters.length) {
      garments.push(sweaters[i % sweaters.length]);
    }

    // Add outerwear if very cold
    if (temp < 5 && outerwear.length) {
      garments.push(outerwear[i % outerwear.length]);
    }

    // Always pants + shoes
    if (pants.length) garments.push(pants[i % pants.length]);
    if (socks.length) garments.push(socks[i % socks.length]);
    if (shoes.length) garments.push(shoes[i % shoes.length]);

    // Add 1-2 accessories
    if (accessories.length) {
      garments.push(accessories[i % accessories.length]);
      if (accessories.length > 1 && i % 2 === 0) {
        garments.push(accessories[(i + 1) % accessories.length]);
      }
    }

    // Validate before adding
    const validation = validateLayers(garments);
    if (validation.valid) {
      outfits.push(createOutfit({
        name: `Look ${i + 1}`,
        garments: sortByLayer(garments),
        styleName: styleNames[i % styleNames.length],
        confidenceScore: parseFloat((0.75 + Math.random() * 0.2).toFixed(2)),
      }));
    }
  }

  return outfits.length > 0 ? outfits : [createOutfit({ name: 'Default', garments: shirts.slice(0, 1), styleName: 'Basic' })];
}
