import { describe, expect, it } from './runner.js';
import {
  buildWardrobeSectionEntries,
  getWardrobeSectionDefinition,
} from '../src/native/screens/wardrobe-runtime.js';
import {
  buildWardrobeOverviewRenderModel,
  buildWardrobeSectionSceneRenderModel,
  resolveWardrobeSceneLayout,
  selectWardrobeCategory,
} from '../src/native/components/wardrobe/wardrobeSceneRuntime.js';

const items = [
  { id: 'top-1', category: 'shirt', title: 'Black Tee' },
  { id: 'knit-1', category: 'sweater', title: 'Black Hoodie' },
  { id: 'outer-1', category: 'outerwear', title: 'Olive Jacket' },
  { id: 'bottom-1', category: 'pants', title: 'Blue Jeans' },
  { id: 'shoe-1', category: 'shoes', title: 'White Sneakers' },
  { id: 'sock-1', category: 'socks', title: 'White Socks' },
  { id: 'hat-1', category: 'accessory', title: 'Black Cap', metadata: { closetStorageMode: 'headwear-rail' } },
  { id: 'bag-1', category: 'accessory', title: 'Mini Bag', metadata: { closetStorageMode: 'accessory-hooks' } },
];

describe('Wardrobe scene runtime', () => {
  it('builds overview render cards for wardrobe sections', () => {
    const sections = buildWardrobeSectionEntries(items);
    const overview = buildWardrobeOverviewRenderModel(sections);

    expect(overview.find(section => section.key === 'tops')?.layout).toBe('hanging');
    expect(overview.find(section => section.key === 'bottoms')?.layout).toBe('hanging');
    expect(overview.find(section => section.key === 'shoes')?.layers).toEqual([
      'background-gradient',
      'texture-panel',
      'shelf',
      'garments',
    ]);
  });

  it('builds section scene render state with stable selection fallback', () => {
    const section = getWardrobeSectionDefinition('tops');
    const scene = buildWardrobeSectionSceneRenderModel(section, items.filter(item => item.category === 'shirt'), 'missing-id');

    expect(scene.scene).toBe('section');
    expect(scene.layout).toBe('hanging');
    expect(scene.selectedItemId).toBe('top-1');
    expect(scene.layers).toEqual([
      'background-gradient',
      'texture-panel',
      'rail',
      'hangers',
      'garments',
    ]);
  });

  it('maps wardrobe categories to the correct premium layout', () => {
    expect(resolveWardrobeSceneLayout(getWardrobeSectionDefinition('tops').storageMode)).toBe('hanging');
    expect(resolveWardrobeSceneLayout(getWardrobeSectionDefinition('outerwear').storageMode)).toBe('hanging');
    expect(resolveWardrobeSceneLayout(getWardrobeSectionDefinition('bottoms').storageMode)).toBe('hanging');
    expect(resolveWardrobeSceneLayout(getWardrobeSectionDefinition('shoes').storageMode)).toBe('shoe-shelf');
    expect(resolveWardrobeSceneLayout(getWardrobeSectionDefinition('headwear').storageMode)).toBe('upper-rail');
    expect(resolveWardrobeSceneLayout(getWardrobeSectionDefinition('accessories').storageMode)).toBe('accessory-tray');
  });

  it('selecting a category opens the correct wardrobe scene', () => {
    const sections = buildWardrobeSectionEntries(items);
    const shoesSelection = selectWardrobeCategory('all', 'shoes', sections);
    const overviewSelection = selectWardrobeCategory('shoes', 'all', sections);

    expect(shoesSelection.scene).toBe('section');
    expect(shoesSelection.layout).toBe('shoe-shelf');
    expect(overviewSelection.scene).toBe('overview');
    expect(overviewSelection.layout).toBe('overview');
  });

  it('removes the legacy flat grid contract from wardrobe scenes', () => {
    const section = getWardrobeSectionDefinition('accessories');
    const scene = buildWardrobeSectionSceneRenderModel(section, items.filter(item => item.category === 'accessory'), null);

    expect(scene.usesLegacyGrid).toBe(false);
    expect(scene.layout).toBe('accessory-tray');
    expect(scene.selectedItemId).toBe(null);
    expect(scene.layers.includes('generic-card-grid')).toBeFalsy();
  });
});
