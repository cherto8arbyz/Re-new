import {
  inferBodySlotFromGarment,
  resolveBodySlotPlacement,
  resolveProcessedImageUrl,
} from './garment-presentation.js';

/**
 * @typedef {'base' | 'shirt' | 'sweater' | 'outerwear' | 'dress' | 'accessory' | 'pants' | 'socks' | 'shoes'} GarmentCategory
 */

/** @type {Record<GarmentCategory, number>} */
export const CATEGORY_Z_INDEX = {
  base: 0,
  pants: 1,
  socks: 1,
  shirt: 1,
  dress: 1,
  shoes: 1,
  sweater: 2,
  outerwear: 3,
  accessory: 4,
};

const VALID_CATEGORIES = /** @type {GarmentCategory[]} */ (Object.keys(CATEGORY_Z_INDEX));

/**
 * @typedef {Object} GarmentPosition
 * @property {number} x - Horizontal offset (% of canvas width)
 * @property {number} y - Vertical offset (% of canvas height)
 * @property {number} width - Width (% of canvas width)
 * @property {number} height - Height (% of canvas height)
 */

/**
 * @typedef {Object} Garment
 * @property {string} id
 * @property {string} name
 * @property {string} [title]
 * @property {GarmentCategory} category
 * @property {string} imageUrl
 * @property {string} [thumbnailUrl]
 * @property {string} [iconName]
 * @property {string} [sourceType]
 * @property {boolean} [backgroundRemoved]
 * @property {number} [extractionConfidence]
 * @property {number} [confidence]
 * @property {boolean} [requiresReview]
 * @property {'draft' | 'approved' | 'requires_review' | 'rejected'} [reviewState]
 * @property {string[]} [colors]
 * @property {string[]} [styleTags]
 * @property {string[]} [seasonTags]
 * @property {string[]} [occasionTags]
 * @property {string} [subcategory]
 * @property {string} [createdAt]
 * @property {GarmentPosition} position
 * @property {string} [color]
 * @property {string} [brand]
 * @property {number} [wearCount]
 * @property {number} [costPerWear]
 * @property {string} [originalUrl]
 * @property {string} [cutoutUrl]
 * @property {string} [maskUrl]
 * @property {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} [bodySlot]
 * @property {number} [positionOffsetX]
 * @property {number} [positionOffsetY]
 * @property {string} [processedImageUrl]
 * @property {boolean} [rawImageFallback]
 * @property {Record<string, any>} [metadata]
 */

/**
 * Creates a validated Garment object.
 * Z-index is derived from category, never set manually.
 * @param {Omit<Garment, 'id'> & { id?: string }} data
 * @returns {Garment}
 */
export function createGarment(data) {
  if (!VALID_CATEGORIES.includes(data.category)) {
    throw new Error(`Invalid garment category: "${data.category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  const title = data.title || data.name || 'Unnamed item';
  const iconName = data.iconName || `icon-${data.category}`;
  const confidence = typeof data.confidence === 'number' ? Number(data.confidence) : 1;
  const extractionConfidence = typeof data.extractionConfidence === 'number'
    ? Number(data.extractionConfidence)
    : confidence;
  const requiresReview = Boolean(data.requiresReview);
  const bodySlot = inferBodySlotFromGarment(data);
  const positionOffsetX = Number.isFinite(Number(data.positionOffsetX)) ? Number(data.positionOffsetX) : 0;
  const positionOffsetY = Number.isFinite(Number(data.positionOffsetY)) ? Number(data.positionOffsetY) : 0;
  const fallbackPlacement = resolveBodySlotPlacement({
    ...data,
    bodySlot,
    positionOffsetX,
    positionOffsetY,
  });
  const processedImageUrl = resolveProcessedImageUrl({
    ...data,
    bodySlot,
    positionOffsetX,
    positionOffsetY,
  });
  const rawVisual = safeUrl(data.originalUrl) || safeUrl(data.imageUrl) || safeUrl(data.thumbnailUrl) || '';
  const rawImageFallback = !processedImageUrl && !Boolean(data.backgroundRemoved) && Boolean(rawVisual);
  const sourceVisual = processedImageUrl || rawVisual;

  return {
    id: data.id || crypto.randomUUID?.() || `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: title,
    title,
    category: data.category,
    imageUrl: sourceVisual,
    thumbnailUrl: data.thumbnailUrl || sourceVisual || '',
    iconName,
    sourceType: data.sourceType || 'manual',
    backgroundRemoved: Boolean(data.backgroundRemoved),
    extractionConfidence: Math.max(0, Math.min(1, extractionConfidence)),
    confidence: Math.max(0, Math.min(1, confidence)),
    requiresReview,
    reviewState: data.reviewState || (requiresReview ? 'requires_review' : 'approved'),
    colors: Array.isArray(data.colors)
      ? data.colors.map(String).filter(Boolean)
      : (data.color ? [String(data.color)] : []),
    styleTags: Array.isArray(data.styleTags) ? data.styleTags.map(String).filter(Boolean) : [],
    seasonTags: Array.isArray(data.seasonTags) ? data.seasonTags.map(String).filter(Boolean) : [],
    occasionTags: Array.isArray(data.occasionTags) ? data.occasionTags.map(String).filter(Boolean) : [],
    subcategory: data.subcategory || '',
    createdAt: data.createdAt || new Date().toISOString(),
    position: data.position
      ? { ...data.position }
      : {
        x: fallbackPlacement.x,
        y: fallbackPlacement.y,
        width: fallbackPlacement.width,
        height: fallbackPlacement.height,
      },
    color: data.color,
    brand: data.brand,
    wearCount: data.wearCount ?? 0,
    costPerWear: data.costPerWear,
    originalUrl: data.originalUrl,
    cutoutUrl: data.cutoutUrl,
    maskUrl: data.maskUrl,
    bodySlot,
    positionOffsetX,
    positionOffsetY,
    processedImageUrl: processedImageUrl || undefined,
    rawImageFallback,
    metadata: {
      ...(data.metadata || {}),
      rawImageFallback,
      rawFallbackUrl: rawImageFallback ? (safeUrl(data.originalUrl) || rawVisual) : (data.metadata?.rawFallbackUrl || ''),
    },
  };
}

/**
 * Returns the z-index tier for a garment based on its category.
 * @param {Garment} garment
 * @returns {number}
 */
export function getZIndex(garment) {
  return CATEGORY_Z_INDEX[garment.category];
}

/**
 * Checks if a category string is valid.
 * @param {string} category
 * @returns {category is GarmentCategory}
 */
export function isValidCategory(category) {
  return VALID_CATEGORIES.includes(/** @type {GarmentCategory} */ (category));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function safeUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}
