import { describe, it, expect } from './runner.js';
import { sortByLayer, validateLayers, resolveConflict, getEffectiveZIndex, addGarment } from '../src/canvas/z-index-manager.js';
import { createGarment } from '../src/models/garment.js';

const pos = { x: 0, y: 0, width: 50, height: 50 };
const mkGarment = (/** @type {string} */ name, /** @type {import('../src/models/garment.js').GarmentCategory} */ category) =>
  createGarment({ name, category, imageUrl: '', position: pos });

describe('Z-Index Manager — sortByLayer', () => {
  it('sorts garments ascending by category z-index', () => {
    const coat = mkGarment('Coat', 'outerwear');
    const shirt = mkGarment('Shirt', 'shirt');
    const base = mkGarment('Undershirt', 'base');

    const sorted = sortByLayer([coat, shirt, base]);
    expect(sorted[0].category).toBe('base');
    expect(sorted[1].category).toBe('shirt');
    expect(sorted[2].category).toBe('outerwear');
  });

  it('preserves order for same-tier items', () => {
    const shirt = mkGarment('Shirt', 'shirt');
    const pants = mkGarment('Pants', 'pants');
    // Both shirt and pants are z-index 1
    const sorted = sortByLayer([pants, shirt]);
    expect(sorted[0].name).toBe('Pants');
    expect(sorted[1].name).toBe('Shirt');
  });

  it('handles empty array', () => {
    const sorted = sortByLayer([]);
    expect(sorted).toHaveLength(0);
  });

  it('handles single garment', () => {
    const sorted = sortByLayer([mkGarment('Solo', 'sweater')]);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].category).toBe('sweater');
  });
});

describe('Z-Index Manager — validateLayers', () => {
  it('validates a correct outfit', () => {
    const result = validateLayers([
      mkGarment('Shirt', 'shirt'),
      mkGarment('Pants', 'pants'),
      mkGarment('Shoes', 'shoes'),
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects duplicate categories (non-accessory)', () => {
    const result = validateLayers([
      mkGarment('Shirt 1', 'shirt'),
      mkGarment('Shirt 2', 'shirt'),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('allows multiple accessories', () => {
    const result = validateLayers([
      mkGarment('Necklace', 'accessory'),
      mkGarment('Bracelet', 'accessory'),
      mkGarment('Watch', 'accessory'),
      mkGarment('Shirt', 'shirt'),
    ]);
    expect(result.valid).toBe(true);
  });

  it('rejects outerwear without shirt or sweater', () => {
    const result = validateLayers([
      mkGarment('Coat', 'outerwear'),
      mkGarment('Pants', 'pants'),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('accepts outerwear with sweater', () => {
    const result = validateLayers([
      mkGarment('Coat', 'outerwear'),
      mkGarment('Sweater', 'sweater'),
    ]);
    expect(result.valid).toBe(true);
  });

  it('warns about pants without shoes', () => {
    const result = validateLayers([
      mkGarment('Shirt', 'shirt'),
      mkGarment('Pants', 'pants'),
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
  });

  it('validates empty set as valid', () => {
    const result = validateLayers([]);
    expect(result.valid).toBe(true);
  });

  it('validates single garment of any category', () => {
    for (const cat of ['shirt', 'pants', 'shoes', 'base', 'accessory']) {
      const result = validateLayers([mkGarment('X', /** @type {any} */ (cat))]);
      expect(result.valid).toBe(true);
    }
  });
});

describe('Z-Index Manager — resolveConflict', () => {
  it('returns conflicting garment for same category', () => {
    const existing = [mkGarment('Shirt 1', 'shirt')];
    const incoming = mkGarment('Shirt 2', 'shirt');
    const conflict = resolveConflict(existing, incoming);
    expect(conflict).toBeNotNull();
    expect(conflict?.name).toBe('Shirt 1');
  });

  it('returns null when no conflict', () => {
    const existing = [mkGarment('Shirt', 'shirt')];
    const incoming = mkGarment('Pants', 'pants');
    expect(resolveConflict(existing, incoming)).toBeNull();
  });

  it('never conflicts for accessories', () => {
    const existing = [mkGarment('Ring', 'accessory')];
    const incoming = mkGarment('Watch', 'accessory');
    expect(resolveConflict(existing, incoming)).toBeNull();
  });
});

describe('Z-Index Manager — getEffectiveZIndex', () => {
  it('returns base z-index for single item', () => {
    const shirt = mkGarment('Shirt', 'shirt');
    expect(getEffectiveZIndex(shirt, [shirt])).toBe(1);
  });

  it('assigns sub-order for same-tier items', () => {
    const acc1 = mkGarment('Ring', 'accessory');
    const acc2 = mkGarment('Watch', 'accessory');
    const all = [acc1, acc2];
    expect(getEffectiveZIndex(acc1, all)).toBe(4);
    expect(getEffectiveZIndex(acc2, all)).toBe(4.1);
  });
});

describe('Z-Index Manager — addGarment', () => {
  it('adds garment and sorts', () => {
    const shirt = mkGarment('Shirt', 'shirt');
    const result = addGarment([], shirt);
    expect(result).toHaveLength(1);
  });

  it('replaces same-category garment', () => {
    const shirt1 = mkGarment('Shirt 1', 'shirt');
    const shirt2 = mkGarment('Shirt 2', 'shirt');
    const result = addGarment([shirt1], shirt2);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Shirt 2');
  });

  it('appends accessory without replacing', () => {
    const acc1 = mkGarment('Ring', 'accessory');
    const acc2 = mkGarment('Watch', 'accessory');
    const result = addGarment([acc1], acc2);
    expect(result).toHaveLength(2);
  });
});
