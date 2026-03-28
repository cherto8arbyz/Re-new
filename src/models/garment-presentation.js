/**
 * Body-slot placement and visual asset resolution for garment rendering.
 */

/** @typedef {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} BodySlot */

/** @type {BodySlot[]} */
export const BODY_ZONE_ORDER = ['head', 'torso', 'legs', 'socks', 'feet', 'accessory'];

/** @type {Record<BodySlot, { x: number, y: number, width: number, height: number }>} */
const SLOT_ANCHORS = {
  head: { x: 35, y: 4, width: 30, height: 12 },
  torso: { x: 18, y: 20, width: 56, height: 31 },
  legs: { x: 23, y: 44, width: 45, height: 40 },
  socks: { x: 31, y: 73, width: 30, height: 16 },
  feet: { x: 28, y: 79, width: 36, height: 13 },
  accessory: { x: 61, y: 34, width: 22, height: 19 },
};

/** @type {Record<string, { width: number, height: number }>} */
const CATEGORY_SIZE = {
  base: { width: 54, height: 27 },
  shirt: { width: 56, height: 30 },
  sweater: { width: 60, height: 34 },
  outerwear: { width: 64, height: 38 },
  dress: { width: 56, height: 60 },
  pants: { width: 45, height: 40 },
  socks: { width: 30, height: 16 },
  shoes: { width: 36, height: 13 },
  accessory: { width: 22, height: 19 },
};

const BODY_SLOT_SET = new Set(['head', 'torso', 'legs', 'socks', 'feet', 'accessory']);

/**
 * @param {unknown} value
 * @returns {BodySlot | null}
 */
export function normalizeBodySlot(value) {
  const slot = String(value || '').trim().toLowerCase();
  return BODY_SLOT_SET.has(slot) ? /** @type {BodySlot} */ (slot) : null;
}

/**
 * @param {Record<string, any>} garment
 * @returns {BodySlot}
 */
export function inferBodySlotFromGarment(garment) {
  const explicit = normalizeBodySlot(garment?.bodySlot);
  if (explicit) return explicit;

  const category = String(garment?.category || '').toLowerCase();
  if (category === 'pants') return 'legs';
  if (category === 'socks') return 'socks';
  if (category === 'shoes') return 'feet';
  if (category === 'base' || category === 'shirt' || category === 'sweater' || category === 'outerwear' || category === 'dress') return 'torso';

  const marker = `${garment?.subcategory || ''} ${garment?.name || ''} ${garment?.title || ''}`.toLowerCase();
  if (/\b(socks?|ankle socks?|crew socks?)\b/.test(marker)) return 'socks';
  if (/\b(hat|cap|beanie|helmet|headband|headwear|sunglasses|glasses)\b/.test(marker)) return 'head';
  return 'accessory';
}

/**
 * @param {Array<import('./garment.js').Garment>} garments
 * @returns {Partial<Record<BodySlot, import('./garment.js').Garment[]>>}
 */
export function groupGarmentsByZone(garments) {
  /** @type {Partial<Record<BodySlot, import('./garment.js').Garment[]>>} */
  const grouped = {};
  for (const garment of garments || []) {
    const zone = inferBodySlotFromGarment(garment);
    grouped[zone] = [...(grouped[zone] || []), garment];
  }
  return grouped;
}

/**
 * Keeps a single garment in each non-accessory zone, while preserving multiple
 * accessories.
 * @param {Array<import('./garment.js').Garment>} garments
 * @param {string[]} selectedIds
 * @returns {string[]}
 */
export function normalizeGarmentSelection(garments, selectedIds) {
  const itemsById = new Map((garments || []).map(item => [item.id, item]));
  /** @type {Partial<Record<BodySlot, string>>} */
  const zoneSelection = {};
  /** @type {string[]} */
  const accessorySelection = [];

  for (const id of selectedIds || []) {
    const item = itemsById.get(id);
    if (!item) continue;

    const zone = inferBodySlotFromGarment(item);
    if (zone === 'accessory') {
      if (!accessorySelection.includes(id)) accessorySelection.push(id);
      continue;
    }

    if (zone === 'legs') {
      const torsoId = zoneSelection.torso;
      const torsoItem = torsoId ? itemsById.get(torsoId) : null;
      if (torsoItem?.category === 'dress') {
        continue;
      }
    }

    if (zone === 'torso' && item.category === 'dress') {
      zoneSelection.legs = undefined;
    }

    zoneSelection[zone] = id;
  }

  return [
    ...(zoneSelection.head ? [zoneSelection.head] : []),
    ...(zoneSelection.torso ? [zoneSelection.torso] : []),
    ...(zoneSelection.legs ? [zoneSelection.legs] : []),
    ...(zoneSelection.socks ? [zoneSelection.socks] : []),
    ...(zoneSelection.feet ? [zoneSelection.feet] : []),
    ...accessorySelection,
  ];
}

/**
 * @param {Record<string, any>} garment
 * @param {number} [slotIndex]
 * @returns {{ x: number, y: number, width: number, height: number, bodySlot: BodySlot }}
 */
export function resolveBodySlotPlacement(garment, slotIndex = 0) {
  const bodySlot = inferBodySlotFromGarment(garment);
  const category = String(garment?.category || '').toLowerCase();
  const anchor = garment?.position || SLOT_ANCHORS[bodySlot];
  const size = CATEGORY_SIZE[category] || anchor;
  const marker = `${garment?.subcategory || ''} ${garment?.name || ''} ${garment?.title || ''}`.toLowerCase();

  let x = anchor.x;
  let y = anchor.y;
  let width = size.width;
  let height = size.height;

  if (bodySlot === 'head') {
    if (/\b(hat|cap|beanie|beret|bucket hat|trucker cap|visor|headband|headwear)\b/.test(marker)) {
      width = 31;
      height = 10.5;
      x = 34;
      y = 2;
    } else if (/\b(sunglasses|glasses)\b/.test(marker)) {
      width = 30;
      height = 7.8;
      x = 34;
      y = 9.5;
    } else {
      width = 30;
      height = 12;
      x = 35;
      y = 4;
    }
  } else if (bodySlot === 'torso') {
    if (category === 'base') {
      x = 20.5;
      y = 22;
      width = 53;
      height = 26;
    } else if (category === 'shirt') {
      if (/\b(cropped|crop|tank|cami|ruched|fitted)\b/.test(marker)) {
        x = 21.5;
        y = 22;
        width = 51;
        height = 24.5;
      } else if (/\b(oversized|boxy|button|blouse|camp collar)\b/.test(marker)) {
        x = 17.5;
        y = 20;
        width = 58;
        height = 31;
      } else {
        x = 18;
        y = 20;
        width = 56;
        height = 30;
      }
    } else if (category === 'sweater') {
      if (/\b(cropped|crop)\b/.test(marker)) {
        x = 18.5;
        y = 20.5;
        width = 57;
        height = 29;
      } else {
        x = 16;
        y = 19;
        width = 60;
        height = 34;
      }
    } else if (category === 'outerwear') {
      if (/\b(cropped|crop)\b/.test(marker)) {
        x = 16.5;
        y = 19.5;
        width = 60;
        height = 32;
      } else {
        x = 14;
        y = 18;
        width = 64;
        height = 38;
      }
    } else if (category === 'dress' || /\b(dress|gown|slip dress|jumpsuit|romper)\b/.test(marker)) {
      x = 18;
      y = 20;
      width = 56;
      height = 60;
    }
  } else if (bodySlot === 'legs') {
    if (/\b(shorts?)\b/.test(marker)) {
      x = 24.5;
      y = 47;
      width = 42;
      height = 25;
    } else if (/\b(skirt|mini skirt|midi skirt|maxi skirt)\b/.test(marker)) {
      x = 22.5;
      y = 46.5;
      width = 47;
      height = 29;
    } else if (/\b(wide[\s-]?leg|flare|bootcut|trouser|jeans|cargo)\b/.test(marker)) {
      x = 22.5;
      y = 43.5;
      width = 46;
      height = 42;
    } else {
      x = 23;
      y = 44;
      width = 45;
      height = 40;
    }
  } else if (bodySlot === 'socks') {
    x = 32.5;
    y = 73;
    width = 28;
    height = 17;
  } else if (bodySlot === 'feet') {
    if (/\b(boots?)\b/.test(marker)) {
      x = 29;
      y = 76.5;
      width = 38;
      height = 18;
    } else if (/\b(heels?|sandals?|flats?|loafers?)\b/.test(marker)) {
      x = 30;
      y = 80;
      width = 34;
      height = 11.5;
    } else {
      x = 28;
      y = 79;
      width = 36;
      height = 13.5;
    }
  } else if (bodySlot === 'accessory') {
    if (/\b(headphones?|headset|earbuds?|airpods?)\b/.test(marker)) {
      x = 33;
      y = 9.5;
      width = 32;
      height = 18;
    } else if (/\b(earrings?|ear cuff|stud earrings?)\b/.test(marker)) {
      x = slotIndex % 2 === 0 ? 33 : 58.5;
      y = 11.5;
      width = 8.5;
      height = 12.5;
    } else if (/\b(necklace|chain|tie|scarf)\b/.test(marker)) {
      x = 35;
      y = 23;
      width = 28;
      height = 13;
    } else if (/\b(watch|bracelet)\b/.test(marker)) {
      x = slotIndex % 2 === 0 ? 14 : 71;
      y = 38;
      width = 15;
      height = 12;
    } else if (/\b(belt)\b/.test(marker)) {
      x = 34;
      y = 54;
      width = 32;
      height = 8;
    } else if (/\b(bag|handbag|shoulder bag|tote|crossbody|backpack|purse|satchel|mini bag)\b/.test(marker)) {
      x = 60;
      y = 35;
      width = 24;
      height = 20;
    } else {
      const presets = [
        { x: 17, y: 23, width: 14, height: 12 },
        { x: 70, y: 23, width: 14, height: 12 },
        { x: 14, y: 54, width: 16, height: 14 },
        { x: 70, y: 54, width: 16, height: 14 },
      ];
      const pick = presets[Math.abs(slotIndex) % presets.length];
      x = pick.x;
      y = pick.y;
      width = pick.width;
      height = pick.height;
    }
  }

  const offsetX = Number.isFinite(Number(garment?.positionOffsetX)) ? Number(garment?.positionOffsetX) : 0;
  const offsetY = Number.isFinite(Number(garment?.positionOffsetY)) ? Number(garment?.positionOffsetY) : 0;
  x = clampPercent(x + offsetX, 0, 100 - width);
  y = clampPercent(y + offsetY, 0, 100 - height);

  return { x, y, width, height, bodySlot };
}

/**
 * @param {Record<string, any>} garment
 * @returns {string}
 */
export function resolveProcessedImageUrl(garment) {
  const backgroundRemoved = Boolean(garment?.backgroundRemoved || garment?.metadata?.backgroundRemoved);
  const explicit = safeUrl(garment?.processedImageUrl);
  if (explicit) return explicit;

  const metadataProcessed = safeUrl(garment?.metadata?.processedImageUrl);
  if (metadataProcessed) return metadataProcessed;

  if (backgroundRemoved) {
    const cutout = safeUrl(garment?.cutoutUrl) || safeUrl(garment?.metadata?.cutoutUrl);
    if (cutout) return cutout;
  }
  return '';
}

/**
 * @param {Record<string, any>} garment
 * @returns {string}
 */
export function resolveProcessedThumbnailUrl(garment) {
  const explicit = safeUrl(garment?.metadata?.processedThumbnailUrl);
  if (explicit) return explicit;

  if (Boolean(garment?.backgroundRemoved || garment?.metadata?.backgroundRemoved)) {
    const thumb = safeUrl(garment?.thumbnailUrl);
    if (thumb) return thumb;
  }

  return '';
}

/**
 * @param {Record<string, any>} garment
 * @returns {{ url: string, source: 'processed_transparent' | 'cleaned_thumbnail' | 'raw_fallback' | 'none', fallbackUsed: boolean, backgroundRemoved: boolean }}
 */
export function resolvePreferredVisualAsset(garment) {
  const backgroundRemoved = Boolean(garment?.backgroundRemoved || garment?.metadata?.backgroundRemoved);
  const processedTransparent = resolveProcessedImageUrl(garment);
  if (processedTransparent) {
    return {
      url: processedTransparent,
      source: 'processed_transparent',
      fallbackUsed: false,
      backgroundRemoved,
    };
  }

  const cleanedThumb = resolveProcessedThumbnailUrl(garment);
  if (cleanedThumb) {
    return {
      url: cleanedThumb,
      source: 'cleaned_thumbnail',
      fallbackUsed: false,
      backgroundRemoved,
    };
  }

  const rawFallback = resolveRawFallbackUrl(garment);
  if (rawFallback && !backgroundRemoved) {
    return {
      url: rawFallback,
      source: 'raw_fallback',
      fallbackUsed: true,
      backgroundRemoved,
    };
  }

  return {
    url: '',
    source: 'none',
    fallbackUsed: false,
    backgroundRemoved,
  };
}

/**
 * @param {Record<string, any>} garment
 * @returns {string}
 */
export function resolveVisualAssetUrl(garment) {
  return resolvePreferredVisualAsset(garment).url;
}

/**
 * @param {Record<string, any>} garment
 * @returns {boolean}
 */
export function isRawBackgroundFallback(garment) {
  return resolvePreferredVisualAsset(garment).source === 'raw_fallback';
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

/**
 * @param {Record<string, any>} garment
 * @returns {string}
 */
function resolveRawFallbackUrl(garment) {
  const explicitRaw = safeUrl(garment?.metadata?.rawFallbackUrl);
  if (explicitRaw) return explicitRaw;
  return (
    safeUrl(garment?.originalUrl) ||
    safeUrl(garment?.imageUrl) ||
    safeUrl(garment?.thumbnailUrl) ||
    ''
  );
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampPercent(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
