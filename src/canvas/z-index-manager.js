import { getZIndex } from '../models/garment.js';

/**
 * Sorts garments by their category z-index (ascending = bottom layer first).
 * Items in the same tier preserve their relative order.
 * @param {import('../models/garment.js').Garment[]} garments
 * @returns {import('../models/garment.js').Garment[]}
 */
export function sortByLayer(garments) {
  return [...garments].sort((a, b) => getZIndex(a) - getZIndex(b));
}

/**
 * Validates a set of garments for layer composition rules.
 * Rules:
 *   1. No duplicate categories (except 'accessory', which allows multiples)
 *   2. Outerwear requires at least one shirt or sweater underneath
 *   3. Sweater requires at least one shirt underneath (soft — warning, not error)
 * @param {import('../models/garment.js').Garment[]} garments
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateLayers(garments) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  // Count garments per category
  /** @type {Record<string, number>} */
  const counts = {};
  for (const g of garments) {
    counts[g.category] = (counts[g.category] || 0) + 1;
  }

  // Rule 1: No duplicate categories (except accessory)
  for (const [category, count] of Object.entries(counts)) {
    if (category !== 'accessory' && count > 1) {
      errors.push(`Duplicate category "${category}": found ${count}, max 1 allowed.`);
    }
  }

  // Rule 2: Outerwear requires shirt or sweater
  if (counts['outerwear'] && !counts['shirt'] && !counts['sweater']) {
    errors.push('Outerwear requires at least one shirt or sweater underneath.');
  }

  // Rule 3 (warning): Shoes recommended if pants present
  if (counts['pants'] && !counts['shoes']) {
    warnings.push('Pants present without shoes — consider adding footwear.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Resolves a conflict when adding a garment to an existing set.
 * If the incoming garment's category already exists (non-accessory), returns
 * the garment to be replaced. Returns null if no conflict.
 * @param {import('../models/garment.js').Garment[]} existing
 * @param {import('../models/garment.js').Garment} incoming
 * @returns {import('../models/garment.js').Garment | null}
 */
export function resolveConflict(existing, incoming) {
  if (incoming.category === 'accessory') return null;
  const conflict = existing.find(g => g.category === incoming.category);
  return conflict || null;
}

/**
 * Computes the effective z-index for rendering. Garments in the same category
 * tier get sub-ordering based on their position in the array.
 * @param {import('../models/garment.js').Garment} garment
 * @param {import('../models/garment.js').Garment[]} allGarments
 * @returns {number}
 */
export function getEffectiveZIndex(garment, allGarments) {
  const baseZ = getZIndex(garment);
  // Find garments in the same tier and determine sub-order
  const sameTier = allGarments.filter(g => getZIndex(g) === baseZ);
  const subIndex = sameTier.indexOf(garment);
  // Sub-order adds 0.1 increments
  return baseZ + (subIndex >= 0 ? subIndex * 0.1 : 0);
}

/**
 * Adds a garment to an outfit, resolving conflicts automatically.
 * If a conflict exists (same non-accessory category), the old one is replaced.
 * @param {import('../models/garment.js').Garment[]} existing
 * @param {import('../models/garment.js').Garment} incoming
 * @returns {import('../models/garment.js').Garment[]}
 */
export function addGarment(existing, incoming) {
  const conflict = resolveConflict(existing, incoming);
  const base = conflict ? existing.filter(g => g.id !== conflict.id) : [...existing];
  base.push(incoming);
  return sortByLayer(base);
}
