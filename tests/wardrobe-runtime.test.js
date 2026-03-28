import { describe, expect, it } from './runner.js';
import {
  buildWardrobeSectionEntries,
  chunkWardrobeItems,
  getWardrobeSectionItems,
} from '../src/native/screens/wardrobe-runtime.js';

const makeItem = (id, category, extra = {}) => ({
  id,
  category,
  name: extra.name || id,
  title: extra.title || extra.name || id,
  shortTitle: extra.shortTitle || extra.title || extra.name || id,
  fullTitle: extra.fullTitle || extra.title || extra.name || id,
  subcategory: extra.subcategory || '',
  bodySlot: extra.bodySlot,
  metadata: extra.metadata,
});

describe('Wardrobe runtime', () => {
  it('groups tops from shirts and base layers into one section', () => {
    const items = [
      makeItem('tee', 'shirt', { title: 'Black Tee' }),
      makeItem('tank', 'base', { title: 'White Tank' }),
      makeItem('pants', 'pants', { title: 'Blue Jeans' }),
    ];

    expect(getWardrobeSectionItems(items, 'tops').map(item => item.id)).toEqual(['tee', 'tank']);
  });

  it('separates headwear from other accessories', () => {
    const items = [
      makeItem('cap', 'accessory', { title: 'Black Cap', subcategory: 'cap' }),
      makeItem('headphones', 'accessory', { title: 'Studio Headphones', subcategory: 'headphones' }),
      makeItem('bag', 'accessory', { title: 'Mini Bag', subcategory: 'bag' }),
    ];

    expect(getWardrobeSectionItems(items, 'headwear').map(item => item.id)).toEqual(['cap']);
    expect(getWardrobeSectionItems(items, 'accessories').map(item => item.id)).toEqual(['headphones', 'bag']);
  });

  it('respects stored closet storage metadata when splitting accessory sections', () => {
    const items = [
      makeItem('cap', 'accessory', { title: 'Cap', metadata: { closetStorageMode: 'headwear-rail' } }),
      makeItem('phones', 'accessory', { title: 'Headphones', metadata: { closetStorageMode: 'accessory-hooks' } }),
    ];

    expect(getWardrobeSectionItems(items, 'headwear').map(item => item.id)).toEqual(['cap']);
    expect(getWardrobeSectionItems(items, 'accessories').map(item => item.id)).toEqual(['phones']);
  });

  it('builds stable section counts and chunks closet rows', () => {
    const items = [
      makeItem('shoe-a', 'shoes'),
      makeItem('shoe-b', 'shoes'),
      makeItem('sock-a', 'socks'),
    ];

    const entries = buildWardrobeSectionEntries(items);
    expect(entries.find(entry => entry.key === 'shoes')?.count).toBe(2);
    expect(entries.find(entry => entry.key === 'socks')?.count).toBe(1);
    expect(chunkWardrobeItems(items, 2)).toHaveLength(2);
  });
});
