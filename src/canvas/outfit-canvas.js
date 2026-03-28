import { getEffectiveZIndex } from './z-index-manager.js';
import { getLayeredGarments } from '../models/outfit.js';
import { createGarmentLayer } from '../components/garment-layer.js';
import { inferBodySlotFromGarment } from '../models/garment-presentation.js';

/**
 * Outfit Canvas — renders garment layers with correct z-indexing.
 */
export class OutfitCanvas {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this.container.classList.add('outfit-canvas');
  }

  /**
   * Renders an outfit on the canvas.
   * @param {import('../models/outfit.js').Outfit | null} outfit
   * @param {number} [outfitIndex]
   * @param {number} [totalOutfits]
   * @param {string} [userPhotoUrl]
   * @param {{
   *  forceLayered?: boolean,
   *  emptyMessage?: string,
   *  draggable?: boolean,
   *  onGarmentMove?: (garmentId: string, patch: { positionOffsetX: number, positionOffsetY: number }) => void
   * }} [options]
   */
  render(outfit, outfitIndex = 0, totalOutfits = 1, userPhotoUrl = '', options = {}) {
    this.container.innerHTML = '';
    const hasPersonBase = Boolean(userPhotoUrl && userPhotoUrl.trim().length > 0);
    const forceLayered = options.forceLayered !== false;

    if (!outfit || outfit.garments.length === 0) {
      if (hasPersonBase) {
        this._appendPersonBase(userPhotoUrl);
      }
      if (!hasPersonBase) {
        const silhouette = document.createElement('div');
        silhouette.className = 'mannequin-silhouette';
        this.container.appendChild(silhouette);
      }

      const empty = document.createElement('div');
      empty.className = 'canvas-empty';
      empty.textContent = options.emptyMessage || 'Swipe to browse looks';
      this.container.appendChild(empty);
      return;
    }

    if (outfit.photoUrl && !forceLayered) {
      const photoWrap = document.createElement('div');
      photoWrap.className = 'canvas-look-photo';

      const img = document.createElement('img');
      img.className = 'canvas-look-photo__img';
      img.src = outfit.photoUrl;
      img.alt = `${outfit.styleName || 'Daily look'} photo`;
      img.loading = 'eager';
      photoWrap.appendChild(img);

      this.container.appendChild(photoWrap);
    } else {
      if (hasPersonBase) {
        this._appendPersonBase(userPhotoUrl);
      }
      if (!hasPersonBase) {
        const silhouette = document.createElement('div');
        silhouette.className = 'mannequin-silhouette';
        this.container.appendChild(silhouette);
      }

      const layered = getLayeredGarments(outfit);
      /** @type {Map<string, number>} */
      const slotCounters = new Map();
      for (const garment of layered) {
        const effectiveZ = getEffectiveZIndex(garment, layered);
        const slot = inferBodySlotFromGarment(garment);
        const slotIndex = slotCounters.get(slot) || 0;
        slotCounters.set(slot, slotIndex + 1);
        const layerEl = createGarmentLayer(garment, effectiveZ, {
          slotIndex,
          draggable: Boolean(options.draggable),
        });
        if (options.draggable) {
          this._attachDrag(layerEl, garment, options.onGarmentMove);
        }
        this.container.appendChild(layerEl);
      }
    }

    // Style label
    if (outfit.styleName) {
      const label = document.createElement('div');
      label.className = 'canvas-style-label';
      label.innerHTML = `
        <span class="canvas-style-label__name">${outfit.styleName}</span>
        ${outfit.confidenceScore ? `<span class="canvas-style-label__score">${Math.round(outfit.confidenceScore * 100)}%</span>` : ''}
      `;
      this.container.appendChild(label);
    }

    // Outfit indicator dots
    if (totalOutfits > 1) {
      const dots = document.createElement('div');
      dots.className = 'canvas-dots';
      for (let i = 0; i < totalOutfits; i++) {
        const dot = document.createElement('span');
        dot.className = `canvas-dot${i === outfitIndex ? ' canvas-dot--active' : ''}`;
        dots.appendChild(dot);
      }
      this.container.appendChild(dots);
    }
  }

  /**
   * @param {string} photoUrl
   */
  _appendPersonBase(photoUrl) {
    const base = document.createElement('div');
    base.className = 'canvas-person-base';

    const body = document.createElement('div');
    body.className = 'canvas-person-base__body';

    const faceWrap = document.createElement('div');
    faceWrap.className = 'canvas-person-base__face';

    const img = document.createElement('img');
    img.className = 'canvas-person-base__face-img';
    img.src = photoUrl;
    img.alt = 'User reference';
    img.loading = 'lazy';

    faceWrap.appendChild(img);
    base.appendChild(body);
    base.appendChild(faceWrap);
    this.container.appendChild(base);
  }

  /**
   * @param {HTMLElement} layerEl
   * @param {import('../models/garment.js').Garment} garment
   * @param {((garmentId: string, patch: { positionOffsetX: number, positionOffsetY: number }) => void) | undefined} onMove
   */
  _attachDrag(layerEl, garment, onMove) {
    if (typeof onMove !== 'function') return;

    layerEl.style.touchAction = 'none';
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let dxPct = 0;
    let dyPct = 0;
    const startOffsetX = Number.isFinite(Number(garment.positionOffsetX)) ? Number(garment.positionOffsetX) : 0;
    const startOffsetY = Number.isFinite(Number(garment.positionOffsetY)) ? Number(garment.positionOffsetY) : 0;

    /** @param {PointerEvent} event */
    const onPointerDown = (event) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      dxPct = 0;
      dyPct = 0;
      layerEl.classList.add('garment-layer--dragging');
      layerEl.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };

    /** @param {PointerEvent} event */
    const onPointerMove = (event) => {
      if (!dragging) return;
      const rect = this.container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      dxPct = (deltaX / rect.width) * 100;
      dyPct = (deltaY / rect.height) * 100;
      layerEl.style.transform = `translate(${dxPct.toFixed(2)}%, ${dyPct.toFixed(2)}%)`;
      event.preventDefault();
      event.stopPropagation();
    };

    /** @param {PointerEvent} event */
    const onPointerUp = (event) => {
      if (!dragging) return;
      dragging = false;
      layerEl.classList.remove('garment-layer--dragging');
      layerEl.style.transform = '';
      layerEl.releasePointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();

      const nextOffsetX = clampOffset(startOffsetX + dxPct);
      const nextOffsetY = clampOffset(startOffsetY + dyPct);
      const changed = Math.abs(nextOffsetX - startOffsetX) >= 0.1 || Math.abs(nextOffsetY - startOffsetY) >= 0.1;
      if (changed) {
        onMove(garment.id, {
          positionOffsetX: Number(nextOffsetX.toFixed(2)),
          positionOffsetY: Number(nextOffsetY.toFixed(2)),
        });
      }
    };

    layerEl.addEventListener('pointerdown', onPointerDown);
    layerEl.addEventListener('pointermove', onPointerMove);
    layerEl.addEventListener('pointerup', onPointerUp);
    layerEl.addEventListener('pointercancel', onPointerUp);
  }
}

/**
 * @param {number} value
 * @returns {number}
 */
function clampOffset(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-30, Math.min(30, value));
}
