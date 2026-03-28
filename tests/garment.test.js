import { describe, it, expect } from './runner.js';
import { createGarment, getZIndex, isValidCategory } from '../src/models/garment.js';

describe('Garment Model', () => {
  it('creates a garment with valid category', () => {
    const g = createGarment({
      name: 'White T-Shirt',
      category: 'shirt',
      imageUrl: '/assets/shirt.png',
      position: { x: 20, y: 10, width: 60, height: 30 },
    });
    expect(g.name).toBe('White T-Shirt');
    expect(g.category).toBe('shirt');
    expect(g.id).toBeTruthy();
  });

  it('throws on invalid category', () => {
    expect(() => createGarment({
      name: 'Bad',
      category: /** @type {any} */ ('rocket'),
      imageUrl: '/x.png',
      position: { x: 0, y: 0, width: 0, height: 0 },
    })).toThrow();
  });

  it('derives z-index from category', () => {
    const shirt = createGarment({ name: 'S', category: 'shirt', imageUrl: '', position: { x: 0, y: 0, width: 0, height: 0 } });
    const coat = createGarment({ name: 'C', category: 'outerwear', imageUrl: '', position: { x: 0, y: 0, width: 0, height: 0 } });
    const acc = createGarment({ name: 'A', category: 'accessory', imageUrl: '', position: { x: 0, y: 0, width: 0, height: 0 } });

    expect(getZIndex(shirt)).toBe(1);
    expect(getZIndex(coat)).toBe(3);
    expect(getZIndex(acc)).toBe(4);
  });

  it('validates known categories correctly', () => {
    expect(isValidCategory('shirt')).toBe(true);
    expect(isValidCategory('pants')).toBe(true);
    expect(isValidCategory('outerwear')).toBe(true);
    expect(isValidCategory('banana')).toBe(false);
  });

  it('defaults wearCount to 0', () => {
    const g = createGarment({ name: 'T', category: 'base', imageUrl: '', position: { x: 0, y: 0, width: 0, height: 0 } });
    expect(g.wearCount).toBe(0);
  });

  it('preserves optional fields when provided', () => {
    const g = createGarment({
      name: 'Branded Shirt',
      category: 'shirt',
      imageUrl: '',
      position: { x: 0, y: 0, width: 0, height: 0 },
      color: 'blue',
      brand: 'Zara',
      wearCount: 5,
    });
    expect(g.color).toBe('blue');
    expect(g.brand).toBe('Zara');
    expect(g.wearCount).toBe(5);
  });
});
