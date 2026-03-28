import { describe, it, expect } from './runner.js';
import {
  BODY_ZONE_ORDER,
  groupGarmentsByZone,
  inferBodySlotFromGarment,
  normalizeGarmentSelection,
  resolveBodySlotPlacement,
  resolvePreferredVisualAsset,
} from '../src/models/garment-presentation.js';
import { createGarment } from '../src/models/garment.js';

const pos = { x: 0, y: 0, width: 50, height: 50 };

describe('Garment Presentation — zone routing', () => {
  it('routes hats to the head zone', () => {
    expect(inferBodySlotFromGarment({
      category: 'accessory',
      name: 'Wool Beanie',
    })).toBe('head');
  });

  it('places caps above the avatar instead of inside the face area', () => {
    const placement = resolveBodySlotPlacement({
      category: 'accessory',
      name: 'Trucker Cap',
    });

    expect(placement.bodySlot).toBe('head');
    expect(placement.y).toBeLessThan(3);
    expect(placement.height).toBeLessThan(12);
  });

  it('routes bags to the accessory zone', () => {
    const placement = resolveBodySlotPlacement({
      category: 'accessory',
      name: 'Crossbody Bag',
    });

    expect(placement.bodySlot).toBe('accessory');
    expect(placement.y).toBeLessThan(40);
  });

  it('keeps pants in the legs zone', () => {
    const placement = resolveBodySlotPlacement({
      category: 'pants',
      name: 'Wide Jeans',
    });

    expect(placement.bodySlot).toBe('legs');
    expect(placement.y).toBeGreaterThan(40);
  });

  it('keeps torso garments visually larger than bottoms on the mannequin', () => {
    const topPlacement = resolveBodySlotPlacement({
      category: 'shirt',
      name: 'Ruched Top',
    });
    const bottomPlacement = resolveBodySlotPlacement({
      category: 'pants',
      name: 'Wide Jeans',
    });

    expect(topPlacement.bodySlot).toBe('torso');
    expect(topPlacement.width).toBeGreaterThan(bottomPlacement.width);
    expect(topPlacement.y).toBeLessThan(bottomPlacement.y);
  });

  it('lets torso and leg garments overlap so the look reads as a single outfit', () => {
    const topPlacement = resolveBodySlotPlacement({
      category: 'shirt',
      name: 'Black Short Sleeve Shirt',
    });
    const bottomPlacement = resolveBodySlotPlacement({
      category: 'pants',
      name: 'Blue Jeans',
    });

    expect(topPlacement.y + topPlacement.height).toBeGreaterThan(bottomPlacement.y);
    expect(bottomPlacement.y).toBeLessThan(48);
  });

  it('keeps footwear large enough to sit under the silhouette instead of shrinking to a dot', () => {
    const shoePlacement = resolveBodySlotPlacement({
      category: 'shoes',
      name: 'White Sneakers',
    });

    expect(shoePlacement.bodySlot).toBe('feet');
    expect(shoePlacement.width).toBeGreaterThan(30);
    expect(shoePlacement.height).toBeGreaterThan(12);
    expect(shoePlacement.y).toBeLessThan(81);
  });

  it('routes socks to the feet zone and keeps them above the shoe line', () => {
    const sockPlacement = resolveBodySlotPlacement({
      category: 'socks',
      name: 'White Crew Socks',
      subcategory: 'socks',
    });

    expect(sockPlacement.bodySlot).toBe('socks');
    expect(sockPlacement.y).toBeLessThan(76);
    expect(sockPlacement.height).toBeGreaterThan(16);
  });

  it('keeps earrings near the head instead of dropping them on the chest', () => {
    const placement = resolveBodySlotPlacement({
      category: 'accessory',
      name: 'Star Earrings',
      subcategory: 'earrings',
    });

    expect(placement.bodySlot).toBe('accessory');
    expect(placement.y).toBeLessThan(18);
    expect(placement.width).toBeLessThan(10);
  });

  it('keeps headphones around the head area instead of using the torso anchor', () => {
    const placement = resolveBodySlotPlacement({
      category: 'accessory',
      name: 'Black Headphones',
      subcategory: 'headphones',
    });

    expect(placement.bodySlot).toBe('accessory');
    expect(placement.y).toBeLessThan(18);
    expect(placement.width).toBeGreaterThan(25);
  });

  it('groups garments by the canonical body zones', () => {
    const garments = [
      createGarment({ name: 'Beanie', category: 'accessory', imageUrl: '', position: pos }),
      createGarment({ name: 'Shirt', category: 'shirt', imageUrl: '', position: pos }),
      createGarment({ name: 'Jeans', category: 'pants', imageUrl: '', position: pos }),
      createGarment({ name: 'Socks', category: 'socks', imageUrl: '', position: pos }),
      createGarment({ name: 'Sneakers', category: 'shoes', imageUrl: '', position: pos }),
      createGarment({ name: 'Watch', category: 'accessory', imageUrl: '', position: pos }),
    ];

    const grouped = groupGarmentsByZone(garments);
    expect(BODY_ZONE_ORDER).toEqual(['head', 'torso', 'legs', 'socks', 'feet', 'accessory']);
    expect(grouped.head).toHaveLength(1);
    expect(grouped.torso).toHaveLength(1);
    expect(grouped.legs).toHaveLength(1);
    expect(grouped.socks).toHaveLength(1);
    expect(grouped.feet).toHaveLength(1);
    expect(grouped.accessory).toHaveLength(1);
  });

  it('normalizes selection so only one primary item remains per zone', () => {
    const shirt = createGarment({ name: 'Shirt', category: 'shirt', imageUrl: '', position: pos });
    const dress = createGarment({ name: 'Dress', category: 'dress', imageUrl: '', position: pos });
    const pants = createGarment({ name: 'Jeans', category: 'pants', imageUrl: '', position: pos });
    const watch = createGarment({ name: 'Watch', category: 'accessory', imageUrl: '', position: pos });
    const bracelet = createGarment({ name: 'Bracelet', category: 'accessory', imageUrl: '', position: pos });

    const normalized = normalizeGarmentSelection(
      [shirt, dress, pants, watch, bracelet],
      [shirt.id, pants.id, dress.id, watch.id, bracelet.id],
    );

    expect(normalized.includes(shirt.id)).toBeFalsy();
    expect(normalized.includes(dress.id)).toBeTruthy();
    expect(normalized.includes(pants.id)).toBeFalsy();
    expect(normalized.includes(watch.id)).toBeTruthy();
    expect(normalized.includes(bracelet.id)).toBeTruthy();
  });

  it('prefers the processed transparent asset stored in metadata when present', () => {
    const asset = resolvePreferredVisualAsset({
      category: 'shoes',
      name: 'White Crew Socks',
      backgroundRemoved: true,
      metadata: {
        backgroundRemoved: true,
        processedImageUrl: 'data:image/png;base64,transparent-socks',
      },
      originalUrl: 'file://raw-socks.png',
    });

    expect(asset.source).toBe('processed_transparent');
    expect(asset.url).toBe('data:image/png;base64,transparent-socks');
    expect(asset.fallbackUsed).toBeFalsy();
  });
});
