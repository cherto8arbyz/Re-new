import {
  resolveBodySlotPlacement,
  resolvePreferredVisualAsset,
} from '../models/garment-presentation.js';

/**
 * SVG templates for garment rendering (CSS-drawn, no external images needed).
 * @type {Record<import('../models/garment.js').GarmentCategory, (color: string) => string>}
 */
const GARMENT_SVG = {
  base: (color) => `
    <svg viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg">
      <path d="M25,5 C25,5 35,0 50,0 C65,0 75,5 75,5 L80,15 L70,20 L68,10 C68,10 60,5 50,5 C40,5 32,10 32,10 L30,20 L20,15 Z" fill="${color}" opacity="0.3"/>
      <path d="M30,18 L32,10 C32,10 40,5 50,5 C60,5 68,10 68,10 L70,18 L70,70 C70,74 65,78 50,78 C35,78 30,74 30,70 Z" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="0.5"/>
    </svg>`,

  shirt: (color) => `
    <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M30,5 L20,0 L0,20 L15,30 L25,18 L25,90 C25,94 35,98 60,98 C85,98 95,94 95,90 L95,18 L105,30 L120,20 L100,0 L90,5 C90,5 80,10 60,10 C40,10 30,5 30,5 Z" fill="${color}" stroke="${adjustColor(color, -30)}" stroke-width="1.5"/>
      <!-- Collar -->
      <path d="M30,5 C30,5 40,12 60,12 C80,12 90,5 90,5 L85,2 C85,2 75,8 60,8 C45,8 35,2 35,2 Z" fill="${adjustColor(color, -15)}" stroke="${adjustColor(color, -40)}" stroke-width="0.8"/>
      <!-- Stripes -->
      <line x1="25" y1="28" x2="95" y2="28" stroke="${adjustColor(color, -20)}" stroke-width="2.5" opacity="0.5"/>
      <line x1="25" y1="40" x2="95" y2="40" stroke="${adjustColor(color, -20)}" stroke-width="2.5" opacity="0.5"/>
      <line x1="25" y1="52" x2="95" y2="52" stroke="${adjustColor(color, -20)}" stroke-width="2.5" opacity="0.5"/>
      <line x1="25" y1="64" x2="95" y2="64" stroke="${adjustColor(color, -20)}" stroke-width="2.5" opacity="0.5"/>
      <line x1="25" y1="76" x2="95" y2="76" stroke="${adjustColor(color, -20)}" stroke-width="2.5" opacity="0.5"/>
      <!-- Sleeve lines -->
      <line x1="25" y1="14" x2="25" y2="90" stroke="${adjustColor(color, -25)}" stroke-width="0.5" opacity="0.3"/>
      <line x1="95" y1="14" x2="95" y2="90" stroke="${adjustColor(color, -25)}" stroke-width="0.5" opacity="0.3"/>
    </svg>`,

  sweater: (color) => `
    <svg viewBox="0 0 130 110" xmlns="http://www.w3.org/2000/svg">
      <path d="M28,8 L15,0 L-5,25 L15,38 L25,22 L25,100 C25,104 40,108 65,108 C90,108 105,104 105,100 L105,22 L115,38 L135,25 L115,0 L102,8 C102,8 85,14 65,14 C45,14 28,8 28,8 Z" fill="${color}" stroke="${adjustColor(color, -25)}" stroke-width="1.5"/>
      <!-- Ribbing at bottom -->
      <path d="M25,90 L105,90 L105,100 C105,104 90,108 65,108 C40,108 25,104 25,100 Z" fill="${adjustColor(color, -10)}" stroke="${adjustColor(color, -25)}" stroke-width="0.5"/>
      <!-- Collar ribbing -->
      <ellipse cx="65" cy="10" rx="22" ry="6" fill="${adjustColor(color, -10)}" stroke="${adjustColor(color, -30)}" stroke-width="1"/>
    </svg>`,

  outerwear: (color) => `
    <svg viewBox="0 0 150 140" xmlns="http://www.w3.org/2000/svg">
      <path d="M35,10 L15,0 L-10,35 L18,50 L28,28 L25,125 C25,130 45,135 75,135 C105,135 125,130 125,125 L122,28 L132,50 L160,35 L135,0 L115,10 C115,10 98,16 75,16 C52,16 35,10 35,10 Z" fill="${color}" stroke="${adjustColor(color, -30)}" stroke-width="2"/>
      <!-- Lapels -->
      <path d="M55,10 L45,50 L75,30 Z" fill="${adjustColor(color, 15)}" stroke="${adjustColor(color, -20)}" stroke-width="1"/>
      <path d="M95,10 L105,50 L75,30 Z" fill="${adjustColor(color, 15)}" stroke="${adjustColor(color, -20)}" stroke-width="1"/>
      <!-- Center line -->
      <line x1="75" y1="30" x2="75" y2="135" stroke="${adjustColor(color, -20)}" stroke-width="1.5"/>
      <!-- Buttons -->
      <circle cx="75" cy="55" r="3" fill="${adjustColor(color, -40)}"/>
      <circle cx="75" cy="75" r="3" fill="${adjustColor(color, -40)}"/>
      <circle cx="75" cy="95" r="3" fill="${adjustColor(color, -40)}"/>
    </svg>`,

  dress: (color) => `
    <svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
      <path d="M42,10 C42,10 48,2 60,2 C72,2 78,10 78,10 L90,34 L82,46 L95,138 C95,144 81,148 60,148 C39,148 25,144 25,138 L38,46 L30,34 Z" fill="${color}" stroke="${adjustColor(color, -28)}" stroke-width="1.5"/>
      <path d="M48,20 C48,20 52,28 60,28 C68,28 72,20 72,20" fill="none" stroke="${adjustColor(color, -18)}" stroke-width="1.2"/>
      <path d="M38,46 L82,46" stroke="${adjustColor(color, -14)}" stroke-width="1" opacity="0.45"/>
      <path d="M45,70 L75,70" stroke="${adjustColor(color, -14)}" stroke-width="1" opacity="0.35"/>
      <path d="M40,98 L80,98" stroke="${adjustColor(color, -14)}" stroke-width="1" opacity="0.25"/>
    </svg>`,

  pants: (color) => `
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
      <!-- Waistband -->
      <rect x="10" y="0" width="80" height="8" rx="2" fill="${adjustColor(color, -15)}" stroke="${adjustColor(color, -30)}" stroke-width="1"/>
      <!-- Left leg -->
      <path d="M10,8 L15,115 C15,118 22,120 30,120 C38,120 42,118 42,115 L50,8 Z" fill="${color}" stroke="${adjustColor(color, -25)}" stroke-width="1.2"/>
      <!-- Right leg -->
      <path d="M50,8 L58,115 C58,118 62,120 70,120 C78,120 85,118 85,115 L90,8 Z" fill="${color}" stroke="${adjustColor(color, -25)}" stroke-width="1.2"/>
      <!-- Center seam -->
      <path d="M50,8 L50,45" stroke="${adjustColor(color, -15)}" stroke-width="0.8" opacity="0.5"/>
      <!-- Crease lines -->
      <line x1="30" y1="20" x2="28" y2="110" stroke="${adjustColor(color, -10)}" stroke-width="0.5" opacity="0.3"/>
      <line x1="70" y1="20" x2="72" y2="110" stroke="${adjustColor(color, -10)}" stroke-width="0.5" opacity="0.3"/>
    </svg>`,

  socks: (color) => `
    <svg viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg">
      <path d="M24,6 L44,6 L44,34 C44,46 38,54 28,60 L18,66 C12,70 10,74 10,78 L34,78 C34,70 38,64 46,60 L54,56 C62,52 68,44 68,32 L68,6 L88,6 L88,34 C88,46 82,54 72,60 L62,66 C56,70 54,74 54,78 L78,78 C78,70 82,64 90,60 L94,58 L94,48 L88,50 C88,44 92,36 92,28 L92,6 L24,6 Z" fill="${color}" stroke="${adjustColor(color, -30)}" stroke-width="1.2"/>
      <path d="M24,14 L44,14" stroke="${adjustColor(color, -14)}" stroke-width="2" opacity="0.5"/>
      <path d="M68,14 L88,14" stroke="${adjustColor(color, -14)}" stroke-width="2" opacity="0.5"/>
      <path d="M16,74 L34,74" stroke="${adjustColor(color, -18)}" stroke-width="1.5" opacity="0.45"/>
      <path d="M60,74 L78,74" stroke="${adjustColor(color, -18)}" stroke-width="1.5" opacity="0.45"/>
    </svg>`,

  shoes: (color) => `
    <svg viewBox="0 0 120 45" xmlns="http://www.w3.org/2000/svg">
      <!-- Left shoe -->
      <path d="M5,20 C5,12 12,5 22,5 L30,5 L30,15 L28,30 C28,35 20,40 10,38 C3,36 2,28 5,20 Z" fill="${color}" stroke="${adjustColor(color, -35)}" stroke-width="1.5"/>
      <path d="M10,30 L30,28 L30,32 L10,34 Z" fill="${adjustColor(color, -20)}" stroke="${adjustColor(color, -35)}" stroke-width="0.5"/>
      <!-- Right shoe -->
      <path d="M55,20 C55,12 62,5 72,5 L80,5 L80,15 L78,30 C78,35 70,40 60,38 C53,36 52,28 55,20 Z" fill="${color}" stroke="${adjustColor(color, -35)}" stroke-width="1.5"/>
      <path d="M60,30 L80,28 L80,32 L60,34 Z" fill="${adjustColor(color, -20)}" stroke="${adjustColor(color, -35)}" stroke-width="0.5"/>
    </svg>`,

  accessory: (color) => `
    <svg viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="4" fill="${color}" stroke="${adjustColor(color, -30)}" stroke-width="1"/>
      <circle cx="22" cy="10" r="4" fill="${color}" stroke="${adjustColor(color, -30)}" stroke-width="1"/>
      <circle cx="34" cy="10" r="4" fill="${color}" stroke="${adjustColor(color, -30)}" stroke-width="1"/>
      <circle cx="46" cy="10" r="4" fill="${color}" stroke="${adjustColor(color, -30)}" stroke-width="1"/>
      <line x1="14" y1="10" x2="18" y2="10" stroke="${adjustColor(color, -20)}" stroke-width="1"/>
      <line x1="26" y1="10" x2="30" y2="10" stroke="${adjustColor(color, -20)}" stroke-width="1"/>
      <line x1="38" y1="10" x2="42" y2="10" stroke="${adjustColor(color, -20)}" stroke-width="1"/>
    </svg>`,
};

/**
 * Specific SVG templates for named accessories.
 */
const ACCESSORY_SVGS = {
  belt: (/** @type {string} */ color) => `
    <svg viewBox="0 0 200 16" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="3" width="200" height="10" rx="2" fill="${color}" stroke="${adjustColor(color, -30)}" stroke-width="1"/>
      <rect x="88" y="0" width="24" height="16" rx="2" fill="${adjustColor(color, 20)}" stroke="${adjustColor(color, -20)}" stroke-width="1.5"/>
      <circle cx="100" cy="8" r="2" fill="${adjustColor(color, -40)}"/>
    </svg>`,

  necklace: (/** @type {string} */ color) => `
    <svg viewBox="0 0 80 50" xmlns="http://www.w3.org/2000/svg">
      <path d="M10,0 Q10,40 40,45 Q70,40 70,0" fill="none" stroke="${color}" stroke-width="2"/>
      <circle cx="15" cy="12" r="3" fill="${color}" opacity="0.8"/>
      <circle cx="22" cy="22" r="3" fill="${color}" opacity="0.8"/>
      <circle cx="31" cy="30" r="3.5" fill="${color}" opacity="0.8"/>
      <circle cx="40" cy="34" r="4" fill="${color}"/>
      <circle cx="49" cy="30" r="3.5" fill="${color}" opacity="0.8"/>
      <circle cx="58" cy="22" r="3" fill="${color}" opacity="0.8"/>
      <circle cx="65" cy="12" r="3" fill="${color}" opacity="0.8"/>
    </svg>`,

  watch: (/** @type {string} */ color) => `
    <svg viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="0" width="20" height="8" rx="3" fill="${adjustColor(color, -20)}"/>
      <rect x="5" y="32" width="20" height="8" rx="3" fill="${adjustColor(color, -20)}"/>
      <circle cx="15" cy="20" r="12" fill="${adjustColor(color, 10)}" stroke="${color}" stroke-width="2"/>
      <circle cx="15" cy="20" r="9" fill="#1a1a2e"/>
      <line x1="15" y1="20" x2="15" y2="13" stroke="#fff" stroke-width="1.5"/>
      <line x1="15" y1="20" x2="20" y2="20" stroke="#fff" stroke-width="1"/>
    </svg>`,
};

/**
 * Adjusts a hex color by a given amount.
 * @param {string} hex
 * @param {number} amount
 * @returns {string}
 */
function adjustColor(hex, amount) {
  if (!hex || hex === 'none') return '#888888';
  const clamp = (/** @type {number} */ n) => Math.max(0, Math.min(255, n));
  let color = hex.replace('#', '');
  if (color.length === 3) color = color.split('').map(c => c + c).join('');
  const r = clamp(parseInt(color.slice(0, 2), 16) + amount);
  const g = clamp(parseInt(color.slice(2, 4), 16) + amount);
  const b = clamp(parseInt(color.slice(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Creates a garment layer DOM element for the canvas.
 * @param {import('../models/garment.js').Garment} garment
 * @param {number} effectiveZIndex
 * @param {{ slotIndex?: number, draggable?: boolean }} [options]
 * @returns {HTMLElement}
 */
export function createGarmentLayer(garment, effectiveZIndex, options = {}) {
  const div = document.createElement('div');
  div.className = `garment-layer garment-layer--${garment.category}`;
  if (options.draggable) div.classList.add('garment-layer--draggable');
  div.style.position = 'absolute';
  const placement = resolveBodySlotPlacement(garment, options.slotIndex || 0);
  div.style.left = `${placement.x}%`;
  div.style.top = `${placement.y}%`;
  div.style.width = `${placement.width}%`;
  div.style.height = `${placement.height}%`;
  div.style.zIndex = String(Math.round(effectiveZIndex * 10));
  div.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  div.dataset.garmentId = garment.id;
  div.dataset.category = garment.category;
  div.dataset.bodySlot = placement.bodySlot;

  const color = garment.color || '#888888';
  const visualAsset = resolvePreferredVisualAsset(garment);
  const imageUrl = visualAsset.url;
  if (imageUrl && imageUrl.trim().length > 0) {
    const img = document.createElement('img');
    img.className = 'garment-layer__img';
    img.src = imageUrl;
    img.alt = garment.name;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      div.innerHTML = renderGarmentSvg(garment, color);
    });
    div.appendChild(img);
    const fallbackUsed = visualAsset.fallbackUsed || Boolean(garment.rawImageFallback);
    div.dataset.assetSource = visualAsset.source;
    div.dataset.backgroundRemoved = String(visualAsset.backgroundRemoved);
    div.dataset.rawFallback = String(fallbackUsed);

    logLookAssetSelection(garment, visualAsset.source, visualAsset.backgroundRemoved, fallbackUsed, imageUrl);

    const debugBadgeLabel = mapAssetSourceLabel(visualAsset.source);
    if (debugBadgeLabel) {
      const badge = document.createElement('span');
      badge.className = `garment-layer__fallback-badge garment-layer__fallback-badge--${visualAsset.source}`;
      badge.textContent = debugBadgeLabel;
      div.appendChild(badge);
    }
    if (fallbackUsed) {
      div.classList.add('garment-layer--raw-fallback');
    }
    div.title = garment.name;
    return div;
  }

  div.innerHTML = renderGarmentSvg(garment, color);
  div.title = garment.name;

  return div;
}

/**
 * @param {import('../models/garment.js').Garment} garment
 * @param {'processed_transparent' | 'cleaned_thumbnail' | 'raw_fallback' | 'none'} source
 * @param {boolean} backgroundRemoved
 * @param {boolean} fallbackUsed
 * @param {string} url
 */
function logLookAssetSelection(garment, source, backgroundRemoved, fallbackUsed, url) {
  const logPayload = {
    garmentId: garment.id,
    name: garment.name,
    category: garment.category,
    assetSource: source,
    backgroundRemoved,
    fallbackUsed,
    assetUrlPreview: trimUrlForLog(url),
  };
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[look-screen] garment_asset_render', logPayload);
  }
}

/**
 * @param {'processed_transparent' | 'cleaned_thumbnail' | 'raw_fallback' | 'none'} source
 * @returns {string}
 */
function mapAssetSourceLabel(source) {
  if (source === 'processed_transparent') return 'PROC';
  if (source === 'cleaned_thumbnail') return 'THUMB';
  if (source === 'raw_fallback') return 'RAW';
  return '';
}

/**
 * @param {string} url
 * @returns {string}
 */
function trimUrlForLog(url) {
  const value = String(url || '');
  if (!value) return '';
  if (value.startsWith('data:image/')) {
    return `${value.slice(0, 24)}...(${value.length} chars)`;
  }
  return value.length > 180 ? `${value.slice(0, 180)}...` : value;
}

/**
 * @param {import('../models/garment.js').Garment} garment
 * @param {string} color
 * @returns {string}
 */
function renderGarmentSvg(garment, color) {
  // Select specific SVG for named accessories
  let svgHTML;
  if (garment.category === 'accessory') {
    const nameLower = garment.name.toLowerCase();
    if (nameLower.includes('belt')) {
      svgHTML = ACCESSORY_SVGS.belt(color);
    } else if (nameLower.includes('necklace') || nameLower.includes('chain')) {
      svgHTML = ACCESSORY_SVGS.necklace(color);
    } else if (nameLower.includes('watch')) {
      svgHTML = ACCESSORY_SVGS.watch(color);
    } else {
      svgHTML = GARMENT_SVG.accessory(color);
    }
  } else {
    svgHTML = GARMENT_SVG[garment.category]?.(color) || GARMENT_SVG.shirt(color);
  }
  return svgHTML;
}
