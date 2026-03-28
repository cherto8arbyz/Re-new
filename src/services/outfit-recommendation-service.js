import { createOutfit } from '../models/outfit.js';
import { sortByLayer, validateLayers } from '../canvas/z-index-manager.js';

/**
 * @typedef {Object} RecommendationInput
 * @property {string} date
 * @property {import('../models/weather.js').Weather} weather
 * @property {import('../models/user.js').User | null} user
 * @property {import('../models/garment.js').Garment[]} wardrobe
 * @property {import('../models/domain-models.js').TrendSignal[]} trendSignals
 */

export class OutfitRecommendationService {
  constructor() {
    this.minBaseSet = ['shirt', 'pants', 'shoes'];
  }

  /**
   * @param {RecommendationInput} input
   * @returns {{ success: boolean, suggestions: import('../models/outfit.js').Outfit[], reason?: string }}
   */
  generateSuggestions(input) {
    const wardrobe = (input.wardrobe || []).filter(item => !item.requiresReview);
    if (wardrobe.length === 0) {
      return { success: false, suggestions: [], reason: 'empty_wardrobe' };
    }

    const pools = this.buildPools(wardrobe);
    const missing = this.minBaseSet.filter(cat => (pools[cat] || []).length === 0);
    if (missing.length > 0) {
      return {
        success: false,
        suggestions: [],
        reason: `not_enough_items:${missing.join(',')}`,
      };
    }

    const combos = this.buildCombinations(pools, input.weather.temperature);
    if (combos.length === 0) {
      return { success: false, suggestions: [], reason: 'no_valid_combinations' };
    }

    const ranked = combos
      .map(combo => ({
        garments: combo,
        score: this.scoreCombination(combo, input),
      }))
      .sort((a, b) => b.score - a.score || this.stableTieBreak(a.garments, b.garments));

    const suggestions = ranked
      .slice(0, 3)
      .map((entry, idx) => createOutfit({
        name: `Suggestion ${idx + 1}`,
        garments: sortByLayer(entry.garments),
        styleName: this.buildStyleName(entry.garments, input.user?.style || ''),
        confidenceScore: Number((entry.score / 100).toFixed(2)),
        renderMetadata: {
          recommendation: {
            score: entry.score,
            reasons: this.buildReasons(entry.garments, input),
          },
        },
      }));

    return {
      success: suggestions.length > 0,
      suggestions,
    };
  }

  /**
   * @param {Record<string, import('../models/garment.js').Garment[]>} pools
   * @param {number} temperature
   * @returns {import('../models/garment.js').Garment[][]}
   */
  buildCombinations(pools, temperature) {
    /** @type {import('../models/garment.js').Garment[][]} */
    const combos = [];
    const shirts = pools.shirt || [];
    const pants = pools.pants || [];
    const shoes = pools.shoes || [];
    const sweaters = pools.sweater || [];
    const outerwear = pools.outerwear || [];
    const accessories = pools.accessory || [];
    const bases = pools.base || [];

    for (const shirt of shirts) {
      for (const pant of pants) {
        for (const shoe of shoes) {
          /** @type {import('../models/garment.js').Garment[]} */
          const combo = [];
          if (bases.length > 0) combo.push(bases[0]);
          combo.push(shirt, pant, shoe);

          if (temperature <= 15 && sweaters.length > 0) combo.push(sweaters[0]);
          if (temperature <= 8 && outerwear.length > 0) combo.push(outerwear[0]);
          if (accessories.length > 0) combo.push(accessories[0]);

          const validation = validateLayers(combo);
          if (validation.valid) combos.push(combo);
        }
      }
    }
    return dedupeCombinations(combos).slice(0, 20);
  }

  /**
   * @param {import('../models/garment.js').Garment[]} combo
   * @param {RecommendationInput} input
   * @returns {number}
   */
  scoreCombination(combo, input) {
    let score = 0;
    score += this.scoreWeather(combo, input.weather.temperature);
    score += this.scoreStyle(combo, input.user?.style || '');
    score += this.scoreTrend(combo, input.trendSignals || []);
    score += this.scoreColorHarmony(combo);
    score += this.scoreConfidence(combo);
    return Number(score.toFixed(2));
  }

  /**
   * @param {import('../models/garment.js').Garment[]} combo
   * @param {number} temperature
   */
  scoreWeather(combo, temperature) {
    const hasSweater = combo.some(item => item.category === 'sweater');
    const hasOuterwear = combo.some(item => item.category === 'outerwear');
    let score = 20;
    if (temperature <= 5) {
      if (hasSweater) score += 15;
      if (hasOuterwear) score += 20;
    } else if (temperature <= 15) {
      if (hasSweater) score += 12;
      if (!hasOuterwear) score += 6;
    } else {
      if (!hasOuterwear) score += 14;
      if (!hasSweater) score += 10;
    }
    return score;
  }

  /**
   * @param {import('../models/garment.js').Garment[]} combo
   * @param {string} style
   */
  scoreStyle(combo, style) {
    if (!style) return 8;
    const normalized = style.toLowerCase();
    let matches = 0;
    for (const item of combo) {
      const tags = Array.isArray(item.styleTags) ? item.styleTags.map(t => String(t).toLowerCase()) : [];
      if (tags.some(tag => tag.includes(normalized))) {
        matches += 1;
      }
    }
    return 8 + matches * 5;
  }

  /**
   * @param {import('../models/garment.js').Garment[]} combo
   * @param {import('../models/domain-models.js').TrendSignal[]} trends
   */
  scoreTrend(combo, trends) {
    if (!Array.isArray(trends) || trends.length === 0) return 5;
    const itemText = combo
      .map(item => `${item.title || item.name} ${(item.styleTags || []).join(' ')} ${(item.subcategory || '')}`.toLowerCase())
      .join(' ');

    let score = 0;
    for (const trend of trends.slice(0, 8)) {
      const tag = String(trend.tag || '').toLowerCase();
      if (!tag) continue;
      if (itemText.includes(tag.split(' ')[0])) {
        score += Number(trend.score || 0) * 10;
      }
    }
    return Math.min(25, score);
  }

  /**
   * @param {import('../models/garment.js').Garment[]} combo
   */
  scoreColorHarmony(combo) {
    const colors = combo
      .map(item => item.colors?.[0] || item.color || '')
      .filter(Boolean)
      .map(c => c.toLowerCase());
    if (colors.length === 0) return 5;

    const unique = new Set(colors);
    if (unique.size <= 2) return 18;
    if (unique.size === 3) return 12;
    return 7;
  }

  /**
   * @param {import('../models/garment.js').Garment[]} combo
   */
  scoreConfidence(combo) {
    const values = combo
      .map(item => typeof item.confidence === 'number' ? item.confidence : 1)
      .filter(v => Number.isFinite(v));
    if (values.length === 0) return 10;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return avg * 12;
  }

  /**
   * @param {import('../models/garment.js').Garment[]} combo
   * @param {string} userStyle
   */
  buildStyleName(combo, userStyle) {
    const warm = combo.some(item => item.category === 'outerwear' || item.category === 'sweater');
    if (warm) return userStyle ? `${capitalize(userStyle)} Layered` : 'Layered Smart';
    return userStyle ? `${capitalize(userStyle)} Daily` : 'Daily Coordinated';
  }

  /**
   * @param {import('../models/garment.js').Garment[]} combo
   * @param {RecommendationInput} input
   */
  buildReasons(combo, input) {
    const reasons = [];
    reasons.push(`Weather: ${input.weather.temperature}°C`);
    reasons.push(`Core categories: ${combo.map(c => c.category).join(', ')}`);
    if (input.trendSignals.length > 0) reasons.push(`Trend-aware (${input.trendSignals[0].tag})`);
    return reasons;
  }

  /**
   * @param {import('../models/garment.js').Garment[]} left
   * @param {import('../models/garment.js').Garment[]} right
   */
  stableTieBreak(left, right) {
    const leftKey = left.map(i => i.id).sort().join('|');
    const rightKey = right.map(i => i.id).sort().join('|');
    return leftKey.localeCompare(rightKey);
  }

  /**
   * @param {import('../models/garment.js').Garment[]} wardrobe
   */
  buildPools(wardrobe) {
    /** @type {Record<string, import('../models/garment.js').Garment[]>} */
    const pools = {};
    for (const item of wardrobe) {
      if (!pools[item.category]) pools[item.category] = [];
      pools[item.category].push(item);
    }
    return pools;
  }
}

/**
 * @param {import('../models/garment.js').Garment[][]} combos
 */
function dedupeCombinations(combos) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {import('../models/garment.js').Garment[][]} */
  const unique = [];
  for (const combo of combos) {
    const key = combo.map(item => item.id).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(combo);
  }
  return unique;
}

/**
 * @param {string} text
 */
function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}
