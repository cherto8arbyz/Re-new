/**
 * @typedef {'all' | 'tops' | 'knitwear' | 'outerwear' | 'bottoms' | 'dresses' | 'socks' | 'shoes' | 'headwear' | 'accessories'} WardrobeSectionKey
 * @typedef {'overview' | 'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks'} WardrobeStorageMode
 * @typedef {{
 *   id?: string,
 *   category?: string,
 *   bodySlot?: string,
 *   subcategory?: string,
 *   shortTitle?: string,
 *   fullTitle?: string,
 *   title?: string,
 *   name?: string,
 * }} RuntimeWardrobeItem
 * @typedef {{
 *   key: WardrobeSectionKey,
 *   label: string,
 *   sceneTitle: string,
 *   description: string,
 *   storageMode: WardrobeStorageMode,
 *   categories?: string[],
 *   matcher?: (item: RuntimeWardrobeItem) => boolean,
 * }} WardrobeSectionDefinition
 */

const HEADWEAR_KEYWORDS = /\b(trucker cap|baseball cap|bucket hat|cap|caps|hat|hats|beanie|beanies|beret|berets|visor|headband)\b/i;

/** @type {Readonly<WardrobeSectionKey[]>} */
export const WARDROBE_SECTION_ORDER = Object.freeze([
  'all',
  'tops',
  'knitwear',
  'outerwear',
  'bottoms',
  'dresses',
  'socks',
  'shoes',
  'headwear',
  'accessories',
]);

/** @type {Readonly<Record<WardrobeSectionKey, WardrobeSectionDefinition>>} */
const SECTION_MAP = Object.freeze({
  all: {
    key: 'all',
    label: 'All',
    sceneTitle: 'Wardrobe',
    description: 'Pick a section first, then step inside the closet and browse pieces where they live.',
    storageMode: 'overview',
  },
  tops: {
    key: 'tops',
    label: 'Tops',
    sceneTitle: 'Top Rail',
    description: 'Tees, tanks, shirts, and base layers hanging on the daily rail.',
    storageMode: 'hanger',
    categories: ['base', 'shirt'],
  },
  knitwear: {
    key: 'knitwear',
    label: 'Knitwear',
    sceneTitle: 'Knitwear Rail',
    description: 'Hoodies, cardigans, and sweaters on the cozy section of the wardrobe.',
    storageMode: 'hanger',
    categories: ['sweater'],
  },
  outerwear: {
    key: 'outerwear',
    label: 'Outerwear',
    sceneTitle: 'Outerwear Rail',
    description: 'Jackets and coats on a heavier rail with extra spacing.',
    storageMode: 'hanger',
    categories: ['outerwear'],
  },
  bottoms: {
    key: 'bottoms',
    label: 'Bottoms',
    sceneTitle: 'Bottom Rail',
    description: 'Jeans, trousers, and shorts hanging with enough spacing to browse them comfortably.',
    storageMode: 'hanger',
    categories: ['pants'],
  },
  dresses: {
    key: 'dresses',
    label: 'Dresses',
    sceneTitle: 'Dress Rail',
    description: 'Longer silhouettes get their own hanging space so they can breathe.',
    storageMode: 'hanger',
    categories: ['dress'],
  },
  socks: {
    key: 'socks',
    label: 'Socks',
    sceneTitle: 'Sock Drawer',
    description: 'A shallow drawer for socks, kept separate from footwear.',
    storageMode: 'drawer',
    categories: ['socks'],
  },
  shoes: {
    key: 'shoes',
    label: 'Shoes',
    sceneTitle: 'Shoe Shelf',
    description: 'Shoes line up on a dedicated shelf, easy to scan at a glance.',
    storageMode: 'shoe-shelf',
    categories: ['shoes'],
  },
  headwear: {
    key: 'headwear',
    label: 'Headwear',
    sceneTitle: 'Hat Rail',
    description: 'Caps and hats get a dedicated upper hanger so they stay visible.',
    storageMode: 'headwear-rail',
    categories: ['accessory'],
    matcher: matchesHeadwear,
  },
  accessories: {
    key: 'accessories',
    label: 'Accessories',
    sceneTitle: 'Accessory Hooks',
    description: 'Bags, jewelry, headphones, belts, and smaller pieces on a separate accessory zone.',
    storageMode: 'accessory-hooks',
    categories: ['accessory'],
    matcher: matchesAccessory,
  },
});

/**
 * @param {WardrobeSectionKey} [sectionKey]
 * @returns {WardrobeSectionDefinition}
 */
export function getWardrobeSectionDefinition(sectionKey = 'all') {
  return SECTION_MAP[sectionKey] || SECTION_MAP.all;
}

/**
 * @param {RuntimeWardrobeItem[]} items
 * @param {WardrobeSectionKey} [sectionKey]
 * @returns {RuntimeWardrobeItem[]}
 */
export function getWardrobeSectionItems(items, sectionKey = 'all') {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const section = getWardrobeSectionDefinition(sectionKey);
  if (section.key === 'all') return list;

  return list.filter(item => {
    if (!item || typeof item !== 'object') return false;
    if (Array.isArray(section.categories) && section.categories.length > 0 && !section.categories.includes(String(item.category || ''))) {
      return false;
    }
    if (typeof section.matcher === 'function') {
      return section.matcher(item);
    }
    return true;
  });
}

/**
 * @param {RuntimeWardrobeItem[]} items
 * @returns {Array<WardrobeSectionDefinition & { count: number }>}
 */
export function buildWardrobeSectionEntries(items) {
  return WARDROBE_SECTION_ORDER.map(sectionKey => {
    const definition = getWardrobeSectionDefinition(sectionKey);
    return {
      ...definition,
      count: getWardrobeSectionItems(items, sectionKey).length,
    };
  });
}

/**
 * @param {RuntimeWardrobeItem[]} items
 * @param {number} [size]
 * @returns {RuntimeWardrobeItem[][]}
 */
export function chunkWardrobeItems(items, size = 2) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const chunkSize = Math.max(1, Number(size) || 1);
  /** @type {RuntimeWardrobeItem[][]} */
  const groups = [];
  for (let index = 0; index < list.length; index += chunkSize) {
    groups.push(list.slice(index, index + chunkSize));
  }
  return groups;
}

/**
 * @param {RuntimeWardrobeItem} item
 * @returns {boolean}
 */
function matchesHeadwear(item) {
  if (resolveStoredStorageMode(item) === 'headwear-rail') return true;
  if (resolveStoredStorageMode(item) === 'accessory-hooks') return false;
  const marker = readItemMarker(item);
  return HEADWEAR_KEYWORDS.test(marker);
}

/**
 * @param {RuntimeWardrobeItem} item
 * @returns {boolean}
 */
function matchesAccessory(item) {
  if (!item || item.category !== 'accessory') return false;
  if (resolveStoredStorageMode(item) === 'accessory-hooks') return true;
  if (resolveStoredStorageMode(item) === 'headwear-rail') return false;
  return !matchesHeadwear(item);
}

/**
 * @param {RuntimeWardrobeItem} item
 * @returns {string}
 */
function readItemMarker(item) {
  return [
    item.bodySlot,
    item.category,
    item.subcategory,
    item.shortTitle,
    item.fullTitle,
    item.title,
    item.name,
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {RuntimeWardrobeItem & { metadata?: Record<string, unknown> }} item
 * @returns {string}
 */
function resolveStoredStorageMode(item) {
  const value = String(item?.metadata?.closetStorageMode || '').trim().toLowerCase();
  return value;
}
