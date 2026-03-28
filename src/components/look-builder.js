import {
  BODY_ZONE_ORDER,
  groupGarmentsByZone,
  inferBodySlotFromGarment,
  normalizeGarmentSelection,
  resolveVisualAssetUrl,
} from '../models/garment-presentation.js';

/**
 * Manual look builder for the main Look tab.
 * Renders separate zone controls for the mannequin instead of a flat item list.
 */
export class LookBuilder {
  /**
   * @param {HTMLElement} container
   * @param {import('../state/store.js').Store<import('../state/app-state.js').AppState, any>} store
   * @param {{ onSelectionChange: (itemIds: string[]) => void }} options
   */
  constructor(container, store, options) {
    this.container = container;
    this.store = store;
    this.onSelectionChange = options.onSelectionChange;
    /** @type {Set<string>} */
    this.selected = new Set();

    this.render(store.getState());
    this.unsubscribe = store.subscribe(state => this.render(state));
  }

  /**
   * @param {import('../state/app-state.js').AppState} state
   */
  render(state) {
    const items = state.wardrobeItems;
    const itemsById = new Map(items.map(item => [item.id, item]));
    this.selected = new Set(normalizeGarmentSelection(items, Array.from(this.selected)));
    const grouped = groupGarmentsByZone(items);
    const selectedByZone = this.groupSelectedByZone(itemsById);

    this.container.innerHTML = `
      <div class="look-builder">
        <div class="look-builder__header">
          <div>
            <div class="look-builder__title">Zone Builder</div>
            <div class="look-builder__subtitle">Choose one primary item per zone and stack accessories independently.</div>
          </div>
          <button class="look-builder__clear" id="look-builder-clear" ${this.selected.size === 0 ? 'disabled' : ''}>Clear</button>
        </div>
        <div class="look-builder__zones">
          ${BODY_ZONE_ORDER.map(zone => this.renderZone(zone, grouped[zone] || [], selectedByZone[zone])).join('')}
        </div>
      </div>
    `;

    this.bindEvents(state);
  }

  /**
   * @param {import('../state/app-state.js').AppState} state
   */
  bindEvents(state) {
    this.container.querySelector('#look-builder-clear')?.addEventListener('click', () => {
      this.selected.clear();
      this.onSelectionChange([]);
      this.render(state);
    });

    this.container.querySelectorAll('[data-zone-clear]').forEach(button => {
      button.addEventListener('click', event => {
        const zone = String(button.getAttribute('data-zone-clear') || '');
        if (!zone) return;
        event.preventDefault();
        this.clearZone(/** @type {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} */ (zone), state);
      });
    });

    this.container.querySelectorAll('[data-zone-item-id]').forEach(button => {
      button.addEventListener('click', () => {
        const itemId = button.getAttribute('data-zone-item-id') || '';
        const zone = button.getAttribute('data-zone-key') || '';
        if (!itemId || !zone) return;
        this.toggleZoneItem(/** @type {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} */ (zone), itemId, state);
      });
    });

    this.container.querySelectorAll('.look-builder__thumb-img').forEach(img => {
      img.addEventListener('error', () => {
        const thumb = img.closest('.look-builder__thumb');
        if (!thumb) return;
        thumb.classList.add('look-builder__thumb--broken');
      });
    });
  }

  /**
   * @param {import('../state/app-state.js').AppState} state
   * @param {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} zone
   * @param {string} itemId
   */
  toggleZoneItem(zone, itemId, state) {
    const item = state.wardrobeItems.find(g => g.id === itemId);
    if (!item) return;

    const next = new Set(this.selected);
    const wasActive = next.has(itemId);
    if (zone === 'accessory') {
      if (wasActive) next.delete(itemId);
      else next.add(itemId);
    } else {
      const zoneIds = state.wardrobeItems.filter(candidate => this.resolveZone(candidate) === zone).map(candidate => candidate.id);
      for (const zoneId of zoneIds) {
        next.delete(zoneId);
      }

      if (zone === 'legs') {
        const torsoItem = state.wardrobeItems.find(candidate => next.has(candidate.id) && this.resolveZone(candidate) === 'torso');
        if (torsoItem?.category === 'dress') {
          next.delete(torsoItem.id);
        }
      }

      if (zone === 'torso' && item.category === 'dress') {
        for (const candidate of state.wardrobeItems) {
          if (this.resolveZone(candidate) === 'legs') {
            next.delete(candidate.id);
          }
        }
      }

      if (!wasActive) next.add(itemId);
    }

    this.selected = new Set(normalizeGarmentSelection(state.wardrobeItems, Array.from(next)));
    this.onSelectionChange(Array.from(this.selected));
    this.render(state);
  }

  /**
   * @param {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} zone
   * @param {import('../models/garment.js').Garment[]} zoneItems
   * @param {import('../models/garment.js').Garment[] | undefined} selectedItems
   * @returns {string}
   */
  renderZone(zone, zoneItems, selectedItems) {
    const zoneLabel = this.zoneLabel(zone);
    const emptyLabel = this.zoneEmptyLabel(zone);
    const selectedSummary = zone === 'accessory'
      ? selectedItems && selectedItems.length > 0
        ? `${selectedItems.length} selected`
        : emptyLabel
      : (selectedItems && selectedItems[0]) ? selectedItems[0].title || selectedItems[0].name : emptyLabel;

    return `
      <section class="look-builder__zone" data-zone-key="${zone}">
        <div class="look-builder__zone-header">
          <div>
            <div class="look-builder__zone-title">${zoneLabel}</div>
            <div class="look-builder__zone-meta">${selectedSummary}</div>
          </div>
          <button class="look-builder__zone-clear" data-zone-clear="${zone}">None</button>
        </div>
        ${
          zoneItems.length
            ? `<div class="look-builder__zone-items">
                ${zoneItems.map(item => this.renderZoneItem(zone, item, selectedItems || [])).join('')}
              </div>`
            : `<div class="look-builder__empty">${emptyLabel}</div>`
        }
      </section>
    `;
  }

  /**
   * @param {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} zone
   * @param {import('../models/garment.js').Garment} item
   * @param {import('../models/garment.js').Garment[]} selectedItems
   * @returns {string}
   */
  renderZoneItem(zone, item, selectedItems) {
    const active = selectedItems.some(selected => selected.id === item.id);
    const thumb = resolveVisualAssetUrl(item);
    const icon = this.iconGlyph(item.iconName || '', item.category);

    return `
      <button class="look-builder__item${active ? ' look-builder__item--selected' : ''}" data-zone-key="${zone}" data-zone-item-id="${item.id}" title="${item.name}">
        <span class="look-builder__thumb">
          ${thumb ? `<img class="look-builder__thumb-img" src="${thumb}" alt="${item.name}" loading="lazy" />` : ''}
          <span class="look-builder__swatch${thumb ? ' look-builder__swatch--fallback' : ''}">${icon}</span>
        </span>
        <span class="look-builder__meta">
          <span class="look-builder__name">${item.title || item.name}</span>
          <span class="look-builder__cat">${this.zoneLabel(zone)}${item.requiresReview ? ' · review' : ''}</span>
        </span>
      </button>
    `;
  }

  /**
   * @param {import('../models/garment.js').Garment} item
   * @returns {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'}
   */
  resolveZone(item) {
    return inferBodySlotFromGarment(item);
  }

  /**
   * @param {Map<string, import('../models/garment.js').Garment>} itemsById
   * @returns {Partial<Record<'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory', import('../models/garment.js').Garment[]>>}
  */
  groupSelectedByZone(itemsById) {
    /** @type {Partial<Record<'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory', import('../models/garment.js').Garment[]>>} */
    const grouped = {};
    for (const id of this.selected) {
      const item = itemsById.get(id);
      if (!item) continue;
      const zone = this.resolveZone(item);
      grouped[zone] = [...(grouped[zone] || []), item];
    }
    return grouped;
  }

  /**
   * @param {string} zone
   * @param {import('../state/app-state.js').AppState} state
   */
  clearZone(zone, state) {
    const next = Array.from(this.selected).filter(id => {
      const item = state.wardrobeItems.find(candidate => candidate.id === id);
      if (!item) return false;
      return this.resolveZone(item) !== zone;
    });
    this.selected = new Set(normalizeGarmentSelection(state.wardrobeItems, next));
    this.onSelectionChange(Array.from(this.selected));
    this.render(state);
  }

  /**
   * @param {string} zone
   * @returns {string}
   */
  zoneLabel(zone) {
    /** @type {Record<string, string>} */
    const labels = {
      head: 'Head',
      torso: 'Torso',
      legs: 'Legs',
      socks: 'Socks',
      feet: 'Feet',
      accessory: 'Accessories',
    };
    return labels[zone];
  }

  /**
   * @param {string} zone
   * @returns {string}
   */
  zoneEmptyLabel(zone) {
    /** @type {Record<string, string>} */
    const labels = {
      head: 'No headwear yet',
      torso: 'No torso items yet',
      legs: 'No bottoms yet',
      socks: 'No socks yet',
      feet: 'No shoes yet',
      accessory: 'No accessories yet',
    };
    return labels[zone];
  }

  /**
   * @param {string} iconName
   * @param {string} category
   * @returns {string}
   */
  iconGlyph(iconName, category) {
    /** @type {Record<string, string>} */
    const byName = {
      'icon-shirt': 'SH',
      'icon-pants': 'PT',
      'icon-jacket': 'JK',
      'icon-sweater': 'SW',
      'icon-shoes': 'SO',
      'icon-socks': 'SK',
      'icon-accessory': 'AC',
      'icon-base-layer': 'BS',
    };
    if (byName[iconName]) return byName[iconName];

    /** @type {Record<string, string>} */
    const byCategory = {
      shirt: 'SH',
      pants: 'PT',
      outerwear: 'JK',
      sweater: 'SW',
      socks: 'SK',
      shoes: 'SO',
      accessory: 'AC',
      base: 'BS',
      dress: 'DR',
    };
    return byCategory[category] || 'IT';
  }

  /**
   * @param {string[]} itemIds
   */
  setSelection(itemIds) {
    this.selected = new Set(normalizeGarmentSelection(this.store.getState().wardrobeItems, (itemIds || []).filter(Boolean)));
    this.render(this.store.getState());
  }

  destroy() {
    this.unsubscribe?.();
  }
}
