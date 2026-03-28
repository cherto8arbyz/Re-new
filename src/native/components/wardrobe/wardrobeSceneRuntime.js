/**
 * @typedef {'overview' | 'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks'} WardrobeStorageMode
 * @typedef {'overview' | 'hanging' | 'upper-rail' | 'folded-shelf' | 'shoe-shelf' | 'drawer-tray' | 'accessory-tray'} WardrobeSceneLayout
 */

/** @type {Readonly<Record<WardrobeStorageMode, WardrobeSceneLayout>>} */
const LAYOUT_BY_STORAGE_MODE = Object.freeze({
  overview: 'overview',
  hanger: 'hanging',
  folded: 'folded-shelf',
  drawer: 'drawer-tray',
  'shoe-shelf': 'shoe-shelf',
  'headwear-rail': 'upper-rail',
  'accessory-hooks': 'accessory-tray',
});

/**
 * @param {WardrobeStorageMode} [storageMode]
 * @returns {WardrobeSceneLayout}
 */
export function resolveWardrobeSceneLayout(storageMode = 'overview') {
  return LAYOUT_BY_STORAGE_MODE[storageMode] || 'overview';
}

/**
 * @param {WardrobeStorageMode} [storageMode]
 * @returns {number}
 */
export function getWardrobeSceneColumnCount(storageMode = 'overview') {
  switch (storageMode) {
    case 'drawer':
    case 'shoe-shelf':
    case 'headwear-rail':
    case 'accessory-hooks':
      return 3;
    default:
      return 2;
  }
}

/**
 * @param {WardrobeStorageMode} [storageMode]
 * @returns {string[]}
 */
export function getWardrobeSceneLayers(storageMode = 'overview') {
  const layout = resolveWardrobeSceneLayout(storageMode);
  const base = ['background-gradient', 'texture-panel'];

  if (layout === 'hanging' || layout === 'upper-rail') {
    return [...base, 'rail', 'hangers', 'garments'];
  }

  if (layout === 'drawer-tray') {
    return [...base, 'drawer-face', 'drawer-inset', 'garments'];
  }

  if (layout === 'accessory-tray') {
    return [...base, 'tray-base', 'tray-lip', 'garments'];
  }

  if (layout === 'overview') {
    return [...base, 'preview-fixture', 'preview-garments'];
  }

  return [...base, 'shelf', 'garments'];
}

/**
 * @param {Array<{ key: string, label: string, count: number, storageMode: WardrobeStorageMode, description: string }>} sections
 * @returns {Array<{ key: string, label: string, count: number, layout: WardrobeSceneLayout, layers: string[], description: string }>}
 */
export function buildWardrobeOverviewRenderModel(sections) {
  const list = Array.isArray(sections) ? sections.filter(section => section && section.key !== 'all') : [];
  return list.map(section => ({
    key: section.key,
    label: section.label,
    count: Number(section.count || 0),
    description: String(section.description || ''),
    layout: resolveWardrobeSceneLayout(section.storageMode || 'overview'),
    layers: getWardrobeSceneLayers(section.storageMode || 'overview'),
  }));
}

/**
 * @param {{ key?: string, storageMode?: WardrobeStorageMode } | null | undefined} section
 * @param {Array<{ id?: string }>} items
 * @param {string | null} selectedItemId
 * @returns {{
 *  scene: 'overview' | 'section',
 *  sectionKey: string,
 *  storageMode: WardrobeStorageMode,
 *  layout: WardrobeSceneLayout,
 *  layers: string[],
 *  itemIds: string[],
 *  selectedItemId: string | null,
 *  columnCount: number,
 *  usesLegacyGrid: false,
 * }}
 */
export function buildWardrobeSectionSceneRenderModel(section, items, selectedItemId) {
  const storageMode = section?.storageMode || 'overview';
  const itemIds = Array.isArray(items)
    ? items.map(item => String(item?.id || '')).filter(Boolean)
    : [];
  const normalizedSelectedItemId = String(selectedItemId || '');
  const safeSelectedItemId = !normalizedSelectedItemId
    ? null
    : itemIds.includes(normalizedSelectedItemId)
      ? normalizedSelectedItemId
      : itemIds[0] || null;

  return {
    scene: section?.key === 'all' || !section?.key ? 'overview' : 'section',
    sectionKey: String(section?.key || 'all'),
    storageMode,
    layout: resolveWardrobeSceneLayout(storageMode),
    layers: getWardrobeSceneLayers(storageMode),
    itemIds,
    selectedItemId: safeSelectedItemId,
    columnCount: getWardrobeSceneColumnCount(storageMode),
    usesLegacyGrid: false,
  };
}

/**
 * @param {string} currentSectionKey
 * @param {string} nextSectionKey
 * @param {Array<{ key: string, storageMode?: WardrobeStorageMode }>} sectionEntries
 * @returns {{
 *  previousSectionKey: string,
 *  activeSectionKey: string,
 *  scene: 'overview' | 'section',
 *  storageMode: WardrobeStorageMode,
 *  layout: WardrobeSceneLayout,
 * }}
 */
export function selectWardrobeCategory(currentSectionKey, nextSectionKey, sectionEntries) {
  const entries = Array.isArray(sectionEntries) ? sectionEntries : [];
  const matched = entries.find(entry => entry?.key === nextSectionKey);
  const safeKey = matched?.key || 'all';
  const storageMode = matched?.storageMode || 'overview';

  return {
    previousSectionKey: String(currentSectionKey || 'all'),
    activeSectionKey: safeKey,
    scene: safeKey === 'all' ? 'overview' : 'section',
    storageMode,
    layout: resolveWardrobeSceneLayout(storageMode),
  };
}
