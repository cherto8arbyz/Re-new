import { describe, it, expect } from './runner.js';
import { createOutfit, getLayeredGarments, validateOutfit } from '../src/models/outfit.js';
import { createGarment } from '../src/models/garment.js';

const pos = { x: 0, y: 0, width: 50, height: 50 };

describe('Outfit Model', () => {
  it('creates outfit with sorted garments', () => {
    const coat = createGarment({ name: 'Coat', category: 'outerwear', imageUrl: '', position: pos });
    const shirt = createGarment({ name: 'Shirt', category: 'shirt', imageUrl: '', position: pos });

    const outfit = createOutfit({ name: 'Test', garments: [coat, shirt] });
    expect(outfit.garments[0].category).toBe('shirt');
    expect(outfit.garments[1].category).toBe('outerwear');
  });

  it('getLayeredGarments returns ascending z-order', () => {
    const acc = createGarment({ name: 'Watch', category: 'accessory', imageUrl: '', position: pos });
    const base = createGarment({ name: 'Undershirt', category: 'base', imageUrl: '', position: pos });
    const shirt = createGarment({ name: 'Shirt', category: 'shirt', imageUrl: '', position: pos });

    const outfit = createOutfit({ name: 'Layered', garments: [acc, base, shirt] });
    const layers = getLayeredGarments(outfit);
    expect(layers[0].category).toBe('base');
    expect(layers[1].category).toBe('shirt');
    expect(layers[2].category).toBe('accessory');
  });

  it('validates valid outfit', () => {
    const outfit = createOutfit({
      name: 'Valid',
      garments: [
        createGarment({ name: 'Shirt', category: 'shirt', imageUrl: '', position: pos }),
        createGarment({ name: 'Pants', category: 'pants', imageUrl: '', position: pos }),
        createGarment({ name: 'Shoes', category: 'shoes', imageUrl: '', position: pos }),
      ],
    });
    const result = validateOutfit(outfit);
    expect(result.valid).toBe(true);
  });

  it('detects invalid outfit with duplicate categories', () => {
    const outfit = createOutfit({
      name: 'Invalid',
      garments: [
        createGarment({ name: 'Shirt 1', category: 'shirt', imageUrl: '', position: pos }),
        createGarment({ name: 'Shirt 2', category: 'shirt', imageUrl: '', position: pos }),
      ],
    });
    const result = validateOutfit(outfit);
    expect(result.valid).toBe(false);
  });

  it('assigns an ID automatically', () => {
    const outfit = createOutfit({ name: 'Auto ID', garments: [] });
    expect(outfit.id).toBeTruthy();
  });

  it('preserves optional style metadata', () => {
    const outfit = createOutfit({
      name: 'Styled',
      garments: [],
      styleName: 'Smart Casual',
      confidenceScore: 0.87,
    });
    expect(outfit.styleName).toBe('Smart Casual');
    expect(outfit.confidenceScore).toBe(0.87);
  });
});
