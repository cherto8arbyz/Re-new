import { describe, it, expect } from './runner.js';
import { generateOptimalOutfit } from '../src/services/forecast-service.js';
import { createGarment } from '../src/models/garment.js';

const mockWardrobe = [
  createGarment({ id: 's1', name: 'White Shirt', category: 'shirt', imageUrl: '', position: { x: 15, y: 8, width: 45, height: 28 }, color: '#FFF' }),
  createGarment({ id: 'sw1', name: 'Wool Sweater', category: 'sweater', imageUrl: '', position: { x: 13, y: 6, width: 50, height: 30 }, color: '#1B2A4A' }),
  createGarment({ id: 'o1', name: 'Trench Coat', category: 'outerwear', imageUrl: '', position: { x: 10, y: 4, width: 56, height: 50 }, color: '#C4A882' }),
  createGarment({ id: 'p1', name: 'Chinos', category: 'pants', imageUrl: '', position: { x: 18, y: 38, width: 38, height: 38 }, color: '#D4C5A9' }),
  createGarment({ id: 'sh1', name: 'Sneakers', category: 'shoes', imageUrl: '', position: { x: 20, y: 78, width: 35, height: 14 }, color: '#F0F0F0' }),
  createGarment({ id: 'a1', name: 'Watch', category: 'accessory', imageUrl: '', position: { x: 5, y: 25, width: 8, height: 6 }, color: '#C0C0C0' }),
];

/** @type {import('../src/models/weather.js').Weather} */
const mockWeather = { temperature: 5, condition: 'cloudy', humidity: 70, windSpeed: 15, icon: '☁️' };
/** @type {import('../src/models/weather.js').Weather} */
const warmWeather = { temperature: 25, condition: 'sunny', humidity: 40, windSpeed: 5, icon: '☀️' };

describe('Forecast Service — generateOptimalOutfit', () => {
  it('should return an array of outfit alternatives', async () => {
    const result = await generateOptimalOutfit('2026-03-22', mockWeather, null, mockWardrobe);
    expect(Array.isArray(result)).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return outfits containing only garments from the provided wardrobe', async () => {
    const result = await generateOptimalOutfit('2026-03-22', mockWeather, null, mockWardrobe);
    const wardrobeIds = mockWardrobe.map(g => g.id);
    for (const outfit of result) {
      for (const garment of outfit.garments) {
        expect(wardrobeIds.includes(garment.id)).toBeTruthy();
      }
    }
  });

  it('should include outerwear for cold weather (temp < 5)', async () => {
    /** @type {import('../src/models/weather.js').Weather} */
    const coldWeather = { temperature: -5, condition: 'snowy', humidity: 80, windSpeed: 20, icon: '❄️' };
    const result = await generateOptimalOutfit('2026-01-15', coldWeather, null, mockWardrobe);
    const hasOuterwear = result.some(o => o.garments.some(g => g.category === 'outerwear'));
    expect(hasOuterwear).toBeTruthy();
  });

  it('should NOT include outerwear for warm weather (temp > 20)', async () => {
    const result = await generateOptimalOutfit('2026-07-15', warmWeather, null, mockWardrobe);
    const hasOuterwear = result.some(o => o.garments.some(g => g.category === 'outerwear'));
    expect(hasOuterwear).toBeFalsy();
  });

  it('should NOT include sweaters for hot weather (temp > 22)', async () => {
    const result = await generateOptimalOutfit('2026-07-15', warmWeather, null, mockWardrobe);
    const hasSweater = result.some(o => o.garments.some(g => g.category === 'sweater'));
    expect(hasSweater).toBeFalsy();
  });

  it('should always include a shirt in every outfit', async () => {
    const result = await generateOptimalOutfit('2026-03-22', mockWeather, null, mockWardrobe);
    for (const outfit of result) {
      const hasShirt = outfit.garments.some(g => g.category === 'shirt');
      expect(hasShirt).toBeTruthy();
    }
  });

  it('should always include pants and shoes in every outfit', async () => {
    const result = await generateOptimalOutfit('2026-03-22', mockWeather, null, mockWardrobe);
    for (const outfit of result) {
      const hasPants = outfit.garments.some(g => g.category === 'pants');
      const hasShoes = outfit.garments.some(g => g.category === 'shoes');
      expect(hasPants).toBeTruthy();
      expect(hasShoes).toBeTruthy();
    }
  });

  it('should return outfits with valid layer composition', async () => {
    const result = await generateOptimalOutfit('2026-03-22', mockWeather, null, mockWardrobe);
    for (const outfit of result) {
      // Outerwear should not exist without shirt/sweater
      const hasOuterwear = outfit.garments.some(g => g.category === 'outerwear');
      if (hasOuterwear) {
        const hasInner = outfit.garments.some(g => g.category === 'shirt' || g.category === 'sweater');
        expect(hasInner).toBeTruthy();
      }
    }
  });

  it('should handle empty wardrobe gracefully', async () => {
    const result = await generateOptimalOutfit('2026-03-22', mockWeather, null, []);
    expect(Array.isArray(result)).toBeTruthy();
    expect(result).toHaveLength(0);
  });

  it('should sort garments by z-index in each outfit', async () => {
    const { CATEGORY_Z_INDEX } = await import('../src/models/garment.js');
    const result = await generateOptimalOutfit('2026-03-22', mockWeather, null, mockWardrobe);
    for (const outfit of result) {
      for (let i = 1; i < outfit.garments.length; i++) {
        const prevZ = CATEGORY_Z_INDEX[outfit.garments[i - 1].category];
        const currZ = CATEGORY_Z_INDEX[outfit.garments[i].category];
        expect(currZ >= prevZ).toBeTruthy();
      }
    }
  });
});
