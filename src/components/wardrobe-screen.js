import { createGarment, CATEGORY_Z_INDEX } from '../models/garment.js';
import { resolveVisualAssetUrl } from '../models/garment-presentation.js';
import { extractWardrobeFromUpload } from '../services/cv-service.js';
import { addWardrobeItem, removeWardrobeItem } from '../state/actions.js';
import { getGeminiService } from '../services/gemini-provider.js';
import { verifyStripeUpgradePayment } from '../services/upgrade-payment.js';
import {
  EXPANDED_WARDROBE_LIMIT,
  FREE_WARDROBE_LIMIT,
  STRIPE_WARDROBE_UPGRADE_URL,
  WARDROBE_UPGRADE_PRICE_USD,
  UPGRADE_CONTEXT_WARDROBE,
  buildUpgradePendingContextStorageKey,
  buildUpgradePendingPaymentStorageKey,
  buildStripeCheckoutUrl,
  buildWardrobeUpgradeStorageKey,
  createPendingUpgradePaymentRecord,
  createUpgradeCheckoutReferenceId,
  extractUpgradeTargetFromUrl,
  getWardrobeLimit,
  isPendingUpgradePaymentExpired,
  isUpgradeSuccessUrl,
  isWardrobeUpgradeStoredValue,
  parsePendingUpgradePayment,
} from '../shared/wardrobe-upgrade.js';

/** @type {Record<string, string>} */
const CATEGORY_LABELS = {
  base: 'Base Layer',
  shirt: 'Shirts',
  sweater: 'Sweaters',
  outerwear: 'Outerwear',
  pants: 'Pants',
  socks: 'Socks',
  shoes: 'Shoes',
  accessory: 'Accessories',
};

const WARDROBE_CHECKOUT_IS_STRIPE_TEST = /buy\.stripe\.com\/test_/i.test(STRIPE_WARDROBE_UPGRADE_URL);
const STRIPE_TEST_RETURN_UNLOCK_MIN_AGE_MS = 12000;

/**
 * Wardrobe Management Screen вЂ” view, add, remove garments.
 */
export class WardrobeScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../state/store.js').Store<import('../state/app-state.js').AppState, any>} store
   */
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.showAddForm = false;
    this.pendingAddMode = '';
    this.showUpgradeModal = false;
    this.upgradeNotice = '';
    this.wardrobeUpgradeUnlocked = false;
    this.upgradeVerificationInFlight = false;
    this.consumeUpgradeSuccessFromUrl();
    this.loadWardrobeUpgradeState();
    this.markPendingUpgradeAsReturnedToApp();
    void this.verifyPendingUpgradePayment('initial');
    this.attachUpgradeVerificationListeners();
    this.consumePendingAddMode();
    this.render(store.getState());
    this.unsubscribe = this.store.subscribe(state => this.render(state));
  }

  /** @param {import('../state/app-state.js').AppState} state */
  render(state) {
    const items = state.wardrobeItems;
    const wardrobeLimit = this.getWardrobeLimit();
    const remainingSlots = Math.max(0, wardrobeLimit - items.length);
    const limitReached = remainingSlots <= 0;

    // Group by category
    /** @type {Record<string, import('../models/garment.js').Garment[]>} */
    const grouped = {};
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }

    const categoryOrder = ['outerwear', 'sweater', 'shirt', 'base', 'pants', 'socks', 'shoes', 'accessory'];

    this.container.innerHTML = `
      <div class="wardrobe">
        <div class="wardrobe__header">
          <h2 class="wardrobe__title">My Wardrobe</h2>
          <span class="wardrobe__count">${items.length}/${wardrobeLimit} items</span>
        </div>

        <button class="wardrobe__add-btn ${limitReached ? 'wardrobe__add-btn--limit' : ''}" id="wr-add-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          ${limitReached ? 'Upgrade to Add' : 'Add Item'}
        </button>

        ${this.showAddForm ? this.renderAddForm() : ''}

        <div class="wardrobe__list">
          ${items.length === 0 ? `
            <div class="wardrobe__empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
                <path d="M12 2L9 7h6L12 2z"/><path d="M9 7c-3 0-6 1-6 3v10c0 1 1 2 2 2h14c1 0 2-1 2-2V10c0-2-3-3-6-3"/>
                <line x1="12" y1="7" x2="12" y2="14"/>
              </svg>
              <p>Your wardrobe is empty.</p>
              <p class="wardrobe__empty-hint">Tap "Add Item" to start building your collection.</p>
            </div>
          ` : categoryOrder.filter(c => grouped[c]?.length > 0).map(cat => `
            <div class="wardrobe__category">
              <h3 class="wardrobe__category-title">${CATEGORY_LABELS[cat] || cat}</h3>
              <div class="wardrobe__items">
                ${grouped[cat].map(g => `
                  <div class="wardrobe__item" data-id="${g.id}">
                    <div class="wardrobe__item-thumb">
                      ${resolveVisualAssetUrl(g)
                        ? `<img class="wardrobe__item-thumb-img" src="${resolveVisualAssetUrl(g)}" alt="${g.name}" loading="lazy" />`
                        : ''
                      }
                      <div class="wardrobe__item-icon${resolveVisualAssetUrl(g) ? ' wardrobe__item-icon--fallback' : ''}">${this.iconGlyph(g.iconName || '', g.category)}</div>
                    </div>
                    <div class="wardrobe__item-info">
                      <span class="wardrobe__item-name">${g.title || g.name}</span>
                      <span class="wardrobe__item-brand">
                        ${(g.subcategory || g.category || '').toUpperCase()}
                        ${g.colors?.[0] || g.color ? ` · ${this.colorLabel(g.colors?.[0] || g.color || '')}` : ''}
                        ${typeof g.confidence === 'number' ? ` · ${(g.confidence * 100).toFixed(0)}%` : ''}
                      </span>
                      ${g.requiresReview ? `<span class="wardrobe__item-review">Needs review</span>` : ''}
                    </div>
                    <button class="wardrobe__item-remove" data-remove-id="${g.id}" aria-label="Remove ${g.name}">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        ${this.renderUpgradeModal(items.length, wardrobeLimit)}
      </div>
    `;

    this.bindEvents();
  }

  renderAddForm() {
    if (this.isWardrobeLimitReached()) {
      return `
      <div class="wardrobe__add-form wardrobe__add-form--locked">
        <h3 class="wardrobe__form-title">Free limit reached</h3>
        <p class="wardrobe__upgrade-inline-copy">
          You already saved ${FREE_WARDROBE_LIMIT} items. Upgrade for $${WARDROBE_UPGRADE_PRICE_USD} and unlock ${EXPANDED_WARDROBE_LIMIT} slots.
        </p>
        <button class="wardrobe__form-submit" id="wr-open-upgrade">Open upgrade</button>
        <button class="wardrobe__form-cancel" id="wr-cancel">Cancel</button>
      </div>
      `;
    }

    const categories = Object.keys(CATEGORY_Z_INDEX);
    const hasAI = !!getGeminiService();
    const forcePhoto = this.pendingAddMode === 'single_item' || this.pendingAddMode === 'person_outfit';
    const smartActive = hasAI && !forcePhoto;
    const textActive = !hasAI && !forcePhoto;
    const photoActive = forcePhoto;
    return `
      <div class="wardrobe__add-form" id="wr-add-form">
        <h3 class="wardrobe__form-title">Add New Item</h3>

        <div class="wardrobe__form-tabs">
          ${hasAI ? `
          <button class="wardrobe__form-tab ${smartActive ? 'wardrobe__form-tab--active' : ''}" data-tab="smart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L9 7h6L12 2z"/><circle cx="12" cy="14" r="6"/><path d="M12 10v4l2 2"/></svg>
            AI Smart
          </button>
          ` : ''}
          <button class="wardrobe__form-tab ${textActive ? 'wardrobe__form-tab--active' : ''}" data-tab="text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Manual
          </button>
          <button class="wardrobe__form-tab ${photoActive ? 'wardrobe__form-tab--active' : ''}" data-tab="photo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Photo
          </button>
        </div>

        ${hasAI ? `
        <div class="wardrobe__form-panel ${smartActive ? '' : 'wardrobe__form-panel--hidden'}" id="wr-panel-smart">
          <input class="wardrobe__form-input" id="wr-smart-input" type="text" placeholder="Describe item (e.g. Beige wide pants)" />
          <p class="wardrobe__form-hint">AI will auto-detect category, color, and style tags</p>
          <button class="wardrobe__form-submit wardrobe__form-submit--ai" id="wr-submit-smart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L9 7h6L12 2z"/><circle cx="12" cy="14" r="6"/></svg>
            Analyze & Add
          </button>
          <div class="wardrobe__form-status" id="wr-smart-status"></div>
        </div>
        ` : ''}

        <div class="wardrobe__form-panel ${textActive ? '' : 'wardrobe__form-panel--hidden'}" id="wr-panel-text">
          <input class="wardrobe__form-input" id="wr-name" type="text" placeholder="Item name (e.g. Blue Jacket)" />
          <select class="wardrobe__form-select" id="wr-category">
            <option value="">Select category</option>
            ${categories.map(c => `<option value="${c}">${CATEGORY_LABELS[c] || c}</option>`).join('')}
          </select>
          <div class="wardrobe__form-color-row">
            <label class="wardrobe__form-color-label" for="wr-color">Color</label>
            <input class="wardrobe__form-color" id="wr-color" type="color" value="#4A90D9" />
          </div>
          <button class="wardrobe__form-submit" id="wr-submit-text">Add to Wardrobe</button>
        </div>

        <div class="wardrobe__form-panel ${photoActive ? '' : 'wardrobe__form-panel--hidden'}" id="wr-panel-photo">
          <div class="wardrobe__form-photo-area" id="wr-photo-area">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <p>Upload single item photo OR full outfit photo on person</p>
            ${this.pendingAddMode === 'person_outfit' ? '<p class="wardrobe__form-photo-hint">Mode: Outfit photo on person</p>' : ''}
            ${this.pendingAddMode === 'single_item' ? '<p class="wardrobe__form-photo-hint">Mode: Single item photo</p>' : ''}
          </div>
          <label class="wardrobe__form-upload-btn" for="wr-photo-input">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Choose Photo
          </label>
          <input type="file" id="wr-photo-input" accept="image/*" capture="environment" hidden />
          <div class="wardrobe__form-status" id="wr-photo-status"></div>
        </div>

        <button class="wardrobe__form-cancel" id="wr-cancel">Cancel</button>
      </div>
    `;
  }

  /**
   * @param {number} usedSlots
   * @param {number} limit
   * @returns {string}
   */
  renderUpgradeModal(usedSlots, limit) {
    if (!this.showUpgradeModal) return '';

    return `
      <div class="wardrobe__upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="wr-upgrade-title">
        <div class="wardrobe__upgrade-card">
          <button class="wardrobe__upgrade-close" id="wr-upgrade-close" aria-label="Close upgrade window">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div class="wardrobe__upgrade-eyebrow">Wardrobe Plus</div>
          <h3 class="wardrobe__upgrade-title" id="wr-upgrade-title">Unlock 50 wardrobe slots</h3>
          <p class="wardrobe__upgrade-copy">
            You already used ${usedSlots}/${limit} slots. Upgrade for $${WARDROBE_UPGRADE_PRICE_USD} and expand your wardrobe to ${EXPANDED_WARDROBE_LIMIT} items.
          </p>
          ${this.upgradeNotice ? `<p class="wardrobe__upgrade-note">${this.upgradeNotice}</p>` : ''}
          <ul class="wardrobe__upgrade-list">
            <li>One-time upgrade for this account.</li>
            <li>Save up to ${EXPANDED_WARDROBE_LIMIT} clothing items.</li>
          </ul>
          <button class="wardrobe__upgrade-pay" id="wr-upgrade-pay">Pay $${WARDROBE_UPGRADE_PRICE_USD}</button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Toggle add form
    const addBtn = this.container.querySelector('#wr-add-btn');
    addBtn?.addEventListener('click', () => {
      if (this.isWardrobeLimitReached()) {
        this.openUpgradeModal(`Free limit is ${FREE_WARDROBE_LIMIT}. Upgrade to unlock ${EXPANDED_WARDROBE_LIMIT}.`);
        return;
      }
      this.showAddForm = !this.showAddForm;
      this.render(this.store.getState());
    });

    // Cancel
    const cancelBtn = this.container.querySelector('#wr-cancel');
    cancelBtn?.addEventListener('click', () => {
      this.showAddForm = false;
      this.render(this.store.getState());
    });

    const openUpgradeBtn = this.container.querySelector('#wr-open-upgrade');
    openUpgradeBtn?.addEventListener('click', () => {
      this.openUpgradeModal(`Free limit is ${FREE_WARDROBE_LIMIT}. Upgrade to unlock ${EXPANDED_WARDROBE_LIMIT}.`);
    });

    const closeUpgradeBtn = this.container.querySelector('#wr-upgrade-close');
    closeUpgradeBtn?.addEventListener('click', () => {
      this.showUpgradeModal = false;
      this.render(this.store.getState());
    });

    const payUpgradeBtn = this.container.querySelector('#wr-upgrade-pay');
    payUpgradeBtn?.addEventListener('click', () => {
      void (async () => {
        const existingPending = parsePendingUpgradePayment(localStorage.getItem(this.getPendingUpgradePaymentStorageKey()));
        if (
          existingPending
          && existingPending.context === UPGRADE_CONTEXT_WARDROBE
          && !isPendingUpgradePaymentExpired(existingPending)
          && Date.now() - existingPending.createdAt >= 12000
        ) {
          const resolved = await this.verifyPendingUpgradePayment('return');
          if (resolved) return;
        }

        const state = this.store.getState();
        const userId = state.authSession?.user?.id || state.user?.id || 'anonymous';
        const userEmail = state.authSession?.user?.email || '';
        const referenceId = createUpgradeCheckoutReferenceId(userId, UPGRADE_CONTEXT_WARDROBE);
        const pendingPayment = createPendingUpgradePaymentRecord({
          context: UPGRADE_CONTEXT_WARDROBE,
          referenceId,
          createdAt: Date.now(),
          customerEmail: userEmail,
        });
        if (!pendingPayment) {
          this.openUpgradeModal('Could not prepare checkout session.');
          return;
        }

        const checkoutUrl = buildStripeCheckoutUrl(STRIPE_WARDROBE_UPGRADE_URL, {
          referenceId: pendingPayment.referenceId,
          customerEmail: pendingPayment.customerEmail || userEmail,
        });

        this.upgradeNotice = 'Complete Stripe checkout and return to the app.';
        localStorage.setItem(this.getPendingUpgradeContextStorageKey(), UPGRADE_CONTEXT_WARDROBE);
        localStorage.setItem(this.getPendingUpgradePaymentStorageKey(), JSON.stringify(pendingPayment));
        this.render(this.store.getState());

        if (typeof window !== 'undefined') {
          window.open(checkoutUrl || STRIPE_WARDROBE_UPGRADE_URL, '_blank', 'noopener,noreferrer');
        }
      })();
    });

    // Tab switching (Smart / Text / Photo)
    const tabs = this.container.querySelectorAll('.wardrobe__form-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.pendingAddMode = '';
        const tabId = tab.getAttribute('data-tab');
        tabs.forEach(t => t.classList.remove('wardrobe__form-tab--active'));
        tab.classList.add('wardrobe__form-tab--active');

        const smartPanel = this.container.querySelector('#wr-panel-smart');
        const textPanel = this.container.querySelector('#wr-panel-text');
        const photoPanel = this.container.querySelector('#wr-panel-photo');
        smartPanel?.classList.toggle('wardrobe__form-panel--hidden', tabId !== 'smart');
        textPanel?.classList.toggle('wardrobe__form-panel--hidden', tabId !== 'text');
        photoPanel?.classList.toggle('wardrobe__form-panel--hidden', tabId !== 'photo');
      });
    });

    // AI Smart Add
    const submitSmartBtn = this.container.querySelector('#wr-submit-smart');
    submitSmartBtn?.addEventListener('click', async () => {
      const input = /** @type {HTMLInputElement} */ (this.container.querySelector('#wr-smart-input'));
      const statusEl = this.container.querySelector('#wr-smart-status');
      const description = input?.value?.trim();

      if (!description) return;
      if (this.isWardrobeLimitReached()) {
        this.openUpgradeModal(`Free limit is ${FREE_WARDROBE_LIMIT}. Upgrade to unlock ${EXPANDED_WARDROBE_LIMIT}.`);
        return;
      }

      const gemini = getGeminiService();
      if (!gemini) {
        if (statusEl) statusEl.textContent = 'AI not configured. Set API key in settings.';
        return;
      }

      if (statusEl) {
        statusEl.textContent = 'Analyzing with AI...';
        statusEl.className = 'wardrobe__form-status wardrobe__form-status--loading';
      }
      submitSmartBtn.setAttribute('disabled', 'true');

      const result = await gemini.analyzeGarmentText(description);

      if (result.success) {
        /** @type {Record<string, import('../models/garment.js').GarmentPosition>} */
        const defaultPositions = {
          base: { x: 17, y: 9, width: 42, height: 25 },
          shirt: { x: 15, y: 8, width: 45, height: 28 },
          sweater: { x: 13, y: 6, width: 50, height: 30 },
          outerwear: { x: 10, y: 4, width: 56, height: 50 },
          pants: { x: 18, y: 38, width: 38, height: 38 },
          shoes: { x: 20, y: 78, width: 35, height: 14 },
          socks: { x: 24, y: 74, width: 28, height: 12 },
          accessory: { x: 30, y: 5, width: 16, height: 10 },
        };

        const garment = createGarment({
          name: result.data.name,
          title: result.data.name,
          category: result.data.category,
          imageUrl: '',
          thumbnailUrl: '',
          iconName: `icon-${result.data.category}`,
          sourceType: 'manual',
          confidence: 0.9,
          extractionConfidence: 0.9,
          backgroundRemoved: false,
          requiresReview: false,
          reviewState: 'approved',
          colors: [result.data.color],
          styleTags: Array.isArray(result.data.styleTags) ? result.data.styleTags : [],
          position: defaultPositions[result.data.category] || { x: 15, y: 8, width: 45, height: 28 },
          color: result.data.color,
          metadata: {
            source: 'smart-text',
          },
        });

        if (this.isWardrobeLimitReached()) {
          submitSmartBtn.removeAttribute('disabled');
          this.openUpgradeModal(`Free limit is ${FREE_WARDROBE_LIMIT}. Upgrade to unlock ${EXPANDED_WARDROBE_LIMIT}.`);
          return;
        }

        this.store.dispatch(addWardrobeItem(garment));
        this.showAddForm = false;
        this.pendingAddMode = '';
        this.render(this.store.getState());
      } else {
        submitSmartBtn.removeAttribute('disabled');
        if (statusEl) {
          statusEl.textContent = result.error;
          statusEl.className = 'wardrobe__form-status wardrobe__form-status--error';
        }
      }
    });

    // Submit text-based garment
    const submitTextBtn = this.container.querySelector('#wr-submit-text');
    submitTextBtn?.addEventListener('click', () => {
      const nameInput = /** @type {HTMLInputElement} */ (this.container.querySelector('#wr-name'));
      const catSelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#wr-category'));
      const colorInput = /** @type {HTMLInputElement} */ (this.container.querySelector('#wr-color'));

      const name = nameInput?.value?.trim();
      const category = catSelect?.value;
      const color = colorInput?.value || '#888888';

      if (!name || !category) return;
      if (this.isWardrobeLimitReached()) {
        this.openUpgradeModal(`Free limit is ${FREE_WARDROBE_LIMIT}. Upgrade to unlock ${EXPANDED_WARDROBE_LIMIT}.`);
        return;
      }

      /** @type {Record<string, import('../models/garment.js').GarmentPosition>} */
      const defaultPositions = {
        base: { x: 17, y: 9, width: 42, height: 25 },
        shirt: { x: 15, y: 8, width: 45, height: 28 },
        sweater: { x: 13, y: 6, width: 50, height: 30 },
        outerwear: { x: 10, y: 4, width: 56, height: 50 },
        pants: { x: 18, y: 38, width: 38, height: 38 },
        shoes: { x: 20, y: 78, width: 35, height: 14 },
        socks: { x: 24, y: 74, width: 28, height: 12 },
        accessory: { x: 30, y: 5, width: 16, height: 10 },
      };

      const garment = createGarment({
        name,
        title: name,
        category: /** @type {import('../models/garment.js').GarmentCategory} */ (category),
        imageUrl: '',
        thumbnailUrl: '',
        iconName: `icon-${category}`,
        sourceType: 'manual',
        confidence: 1,
        extractionConfidence: 1,
        backgroundRemoved: false,
        requiresReview: false,
        reviewState: 'approved',
        colors: [color],
        position: defaultPositions[category] || { x: 15, y: 8, width: 45, height: 28 },
        color,
        metadata: {
          source: 'manual-form',
        },
      });

      this.store.dispatch(addWardrobeItem(garment));
      this.showAddForm = false;
      this.render(this.store.getState());
    });

    // Photo upload for garment analysis
    const photoInput = /** @type {HTMLInputElement} */ (this.container.querySelector('#wr-photo-input'));
    photoInput?.addEventListener('change', async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      if (this.isWardrobeLimitReached()) {
        this.openUpgradeModal(`Free limit is ${FREE_WARDROBE_LIMIT}. Upgrade to unlock ${EXPANDED_WARDROBE_LIMIT}.`);
        return;
      }

      const statusEl = this.container.querySelector('#wr-photo-status');
      if (statusEl) {
        statusEl.textContent = 'Extraction in progress...';
        statusEl.className = 'wardrobe__form-status wardrobe__form-status--loading';
      }

      const dataUrl = await this.fileToDataUrl(file);
      const state = this.store.getState();
      const result = await extractWardrobeFromUpload(dataUrl, {
        userId: state.authSession?.user?.id,
        accessToken: state.authSession?.accessToken,
        sourceFileName: file.name,
        persist: true,
        inputTypeHint: this.pendingAddMode === 'single_item' || this.pendingAddMode === 'person_outfit'
          ? this.pendingAddMode
          : undefined,
      });

      if (result.success) {
        const approved = result.autoApproved || [];
        const review = result.requiresReview || [];
        const extractedCandidates = [...approved, ...review];
        const availableSlots = this.getRemainingSlots(this.store.getState());
        let savedCount = 0;
        for (const extracted of extractedCandidates) {
          if (savedCount >= availableSlots) break;
          const garment = createGarment({
            name: extracted.title,
            title: extracted.title,
            category: extracted.category,
            subcategory: extracted.subcategory,
            colors: extracted.colors,
            color: extracted.colors?.[0] || '#808080',
            styleTags: extracted.styleTags,
            seasonTags: extracted.seasonTags,
            occasionTags: extracted.occasionTags,
            imageUrl: extracted.processedImageUrl || extracted.thumbnailUrl || '',
            thumbnailUrl: extracted.processedImageUrl || extracted.thumbnailUrl || '',
            iconName: extracted.iconName,
            sourceType: extracted.sourceType,
            backgroundRemoved: Boolean(extracted.backgroundRemoved),
            extractionConfidence: typeof extracted.extractionConfidence === 'number'
              ? extracted.extractionConfidence
              : extracted.confidence,
            confidence: extracted.confidence,
            requiresReview: extracted.requiresReview,
            reviewState: extracted.requiresReview ? 'requires_review' : 'approved',
            bodySlot: extracted.bodySlot,
            positionOffsetX: Number(extracted.positionOffsetX || 0),
            positionOffsetY: Number(extracted.positionOffsetY || 0),
            processedImageUrl: extracted.processedImageUrl || String(extracted.metadata?.cutoutUrl || ''),
            rawImageFallback: Boolean(extracted.metadata?.rawImageFallback),
            createdAt: new Date().toISOString(),
            position: this.defaultPositionForCategory(extracted.category),
            originalUrl: String(extracted.metadata?.originalUrl || ''),
            cutoutUrl: String(extracted.metadata?.cutoutUrl || ''),
            maskUrl: String(extracted.metadata?.maskUrl || ''),
            metadata: {
              ...(extracted.metadata || {}),
              rawImageFallback: Boolean(extracted.metadata?.rawImageFallback),
              processedThumbnailUrl: String(extracted.metadata?.processedThumbnailUrl || ''),
              rawFallbackUrl: String(extracted.metadata?.rawFallbackUrl || extracted.metadata?.originalUrl || ''),
            },
          });
          this.store.dispatch(addWardrobeItem(garment));
          savedCount += 1;
        }

        const skippedCount = Math.max(0, extractedCandidates.length - savedCount);
        if (skippedCount > 0) {
          this.showUpgradeModal = true;
          this.showAddForm = false;
          this.upgradeNotice = `Saved ${savedCount} item(s). ${skippedCount} item(s) need Wardrobe Plus (${EXPANDED_WARDROBE_LIMIT} slots).`;
        }

        if (statusEl) {
          statusEl.textContent = skippedCount > 0
            ? `Saved ${savedCount} item(s). Upgrade to save ${skippedCount} more item(s).`
            : approved.length > 0 && review.length > 0
            ? `Saved ${approved.length} items. ${review.length} items require review.`
            : approved.length > 0
            ? `Saved ${approved.length} wardrobe item(s).`
            : `Saved ${review.length} low-confidence item(s) for review.`;
          statusEl.className = 'wardrobe__form-status';
        }

        this.showAddForm = false;
        this.pendingAddMode = '';
        this.render(this.store.getState());
      } else {
        if (statusEl) {
          statusEl.textContent = result.error || 'Extraction failed';
          statusEl.className = 'wardrobe__form-status wardrobe__form-status--error';
        }
      }
    });

    // Remove buttons
    const removeBtns = this.container.querySelectorAll('[data-remove-id]');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-remove-id');
        if (id) {
          this.store.dispatch(removeWardrobeItem(id));
        }
      });
    });

    this.container.querySelectorAll('.wardrobe__item-thumb-img').forEach(img => {
      img.addEventListener('error', () => {
        const thumb = img.closest('.wardrobe__item-thumb');
        if (!thumb) return;
        thumb.classList.add('wardrobe__item-thumb--broken');
      });
    });
  }

  /**
   * @param {File} file
   * @returns {Promise<string>}
   */
  fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(/** @type {string} */ (reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * @returns {string}
   */
  getUpgradeStorageKey() {
    const state = this.store.getState();
    const userId = state.authSession?.user?.id || state.user?.id || 'anonymous';
    return buildWardrobeUpgradeStorageKey(userId);
  }

  /**
   * @returns {string}
   */
  getPendingUpgradeContextStorageKey() {
    const state = this.store.getState();
    const userId = state.authSession?.user?.id || state.user?.id || 'anonymous';
    return buildUpgradePendingContextStorageKey(userId);
  }

  /**
   * @returns {string}
   */
  getPendingUpgradePaymentStorageKey() {
    const state = this.store.getState();
    const userId = state.authSession?.user?.id || state.user?.id || 'anonymous';
    return buildUpgradePendingPaymentStorageKey(userId);
  }

  loadWardrobeUpgradeState() {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(this.getUpgradeStorageKey());
    this.wardrobeUpgradeUnlocked = isWardrobeUpgradeStoredValue(raw);
  }

  saveWardrobeUpgradeState() {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.getUpgradeStorageKey(), this.wardrobeUpgradeUnlocked ? 'expanded' : 'free');
  }

  /**
   * @returns {number}
   */
  getWardrobeLimit() {
    return getWardrobeLimit(this.wardrobeUpgradeUnlocked);
  }

  /**
   * @param {import('../state/app-state.js').AppState} [state]
   * @returns {number}
   */
  getRemainingSlots(state = this.store.getState()) {
    return Math.max(0, this.getWardrobeLimit() - state.wardrobeItems.length);
  }

  /**
   * @param {import('../state/app-state.js').AppState} [state]
   * @returns {boolean}
   */
  isWardrobeLimitReached(state = this.store.getState()) {
    return this.getRemainingSlots(state) <= 0;
  }

  /**
   * @param {string} [notice]
   */
  openUpgradeModal(notice = '') {
    this.showUpgradeModal = true;
    this.showAddForm = false;
    if (notice) this.upgradeNotice = notice;
    this.render(this.store.getState());
  }

  unlockWardrobeUpgrade() {
    this.wardrobeUpgradeUnlocked = true;
    this.saveWardrobeUpgradeState();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.getPendingUpgradeContextStorageKey());
      localStorage.removeItem(this.getPendingUpgradePaymentStorageKey());
    }
    this.showUpgradeModal = false;
    this.upgradeNotice = `Upgrade activated. Wardrobe limit is now ${EXPANDED_WARDROBE_LIMIT}.`;
    this.render(this.store.getState());
  }

  consumeUpgradeSuccessFromUrl() {
    if (typeof window === 'undefined' || !window.location) return;
    const currentUrl = window.location.href;
    if (!isUpgradeSuccessUrl(currentUrl)) return;

    const target = extractUpgradeTargetFromUrl(currentUrl);
    const pendingContext = typeof localStorage !== 'undefined'
      ? String(localStorage.getItem(this.getPendingUpgradeContextStorageKey()) || '').trim().toLowerCase()
      : '';
    const shouldUnlock = target
      ? target === UPGRADE_CONTEXT_WARDROBE
      : pendingContext === UPGRADE_CONTEXT_WARDROBE;
    if (!shouldUnlock) return;

    this.unlockWardrobeUpgrade();
    this.upgradeNotice = `Payment confirmed. Wardrobe expanded to ${EXPANDED_WARDROBE_LIMIT} items.`;

    try {
      const parsed = new URL(currentUrl);
      parsed.searchParams.delete('wardrobeUpgrade');
      parsed.searchParams.delete('upgrade');
      parsed.searchParams.delete('payment');
      parsed.searchParams.delete('status');
      if (window.history?.replaceState) {
        window.history.replaceState({}, '', parsed.toString());
      }
    } catch {
      // ignore malformed URL cleanup
    }
  }

  markPendingUpgradeAsReturnedToApp() {
    if (typeof localStorage === 'undefined') return;

    const pendingContext = String(localStorage.getItem(this.getPendingUpgradeContextStorageKey()) || '').trim().toLowerCase();
    if (pendingContext !== UPGRADE_CONTEXT_WARDROBE) return;

    const pendingPayment = parsePendingUpgradePayment(localStorage.getItem(this.getPendingUpgradePaymentStorageKey()));
    if (!pendingPayment || pendingPayment.context !== UPGRADE_CONTEXT_WARDROBE || pendingPayment.returnedToApp) return;

    const nextPending = createPendingUpgradePaymentRecord({
      context: pendingPayment.context,
      referenceId: pendingPayment.referenceId,
      createdAt: pendingPayment.createdAt,
      customerEmail: pendingPayment.customerEmail || '',
      returnedToApp: true,
    });
    if (!nextPending) return;

    localStorage.setItem(this.getPendingUpgradePaymentStorageKey(), JSON.stringify(nextPending));
  }

  /**
   * @param {'initial' | 'return' | 'deeplink'} [source]
   * @returns {Promise<boolean>}
   */
  async verifyPendingUpgradePayment(source = 'initial') {
    if (typeof localStorage === 'undefined') return false;
    if (this.upgradeVerificationInFlight) return false;
    this.upgradeVerificationInFlight = true;

    try {
      const pendingContext = String(localStorage.getItem(this.getPendingUpgradeContextStorageKey()) || '').trim().toLowerCase();
      if (pendingContext !== UPGRADE_CONTEXT_WARDROBE) return false;

      const pendingPayment = parsePendingUpgradePayment(localStorage.getItem(this.getPendingUpgradePaymentStorageKey()));
      if (!pendingPayment || pendingPayment.context !== UPGRADE_CONTEXT_WARDROBE) {
        localStorage.removeItem(this.getPendingUpgradeContextStorageKey());
        localStorage.removeItem(this.getPendingUpgradePaymentStorageKey());
        return false;
      }

      if (isPendingUpgradePaymentExpired(pendingPayment)) {
        localStorage.removeItem(this.getPendingUpgradeContextStorageKey());
        localStorage.removeItem(this.getPendingUpgradePaymentStorageKey());
        return false;
      }

      const state = this.store.getState();
      const userEmail = state.authSession?.user?.email || '';
      const verification = await verifyStripeUpgradePayment({
        context: UPGRADE_CONTEXT_WARDROBE,
        referenceId: pendingPayment.referenceId,
        customerEmail: pendingPayment.customerEmail || userEmail,
        createdAfter: Math.max(0, Math.floor((pendingPayment.createdAt - (10 * 60 * 1000)) / 1000)),
      });

      if (verification.paid) {
        this.unlockWardrobeUpgrade();
        return true;
      }

      const allowTestFallbackUnlock = WARDROBE_CHECKOUT_IS_STRIPE_TEST
        && !verification.configured
        && pendingPayment.returnedToApp
        && (Date.now() - pendingPayment.createdAt) >= STRIPE_TEST_RETURN_UNLOCK_MIN_AGE_MS;
      if (allowTestFallbackUnlock) {
        this.unlockWardrobeUpgrade();
        return true;
      }

      if (source !== 'initial') {
        if (!verification.configured) {
          this.openUpgradeModal('Payment verification is unavailable right now.');
        } else {
          this.openUpgradeModal('Payment is not confirmed yet. Complete checkout and return to the app.');
        }
      }

      return false;
    } finally {
      this.upgradeVerificationInFlight = false;
    }
  }

  attachUpgradeVerificationListeners() {
    if (typeof window !== 'undefined') {
      this.onWindowFocus = () => {
        this.markPendingUpgradeAsReturnedToApp();
        void this.verifyPendingUpgradePayment('return');
      };
      window.addEventListener('focus', this.onWindowFocus);
    }

    if (typeof document !== 'undefined') {
      this.onVisibilityChange = () => {
        if (document.visibilityState !== 'visible') return;
        this.markPendingUpgradeAsReturnedToApp();
        void this.verifyPendingUpgradePayment('return');
      };
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  destroy() {
    if (typeof window !== 'undefined' && this.onWindowFocus) {
      window.removeEventListener('focus', this.onWindowFocus);
    }
    if (typeof document !== 'undefined' && this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.unsubscribe?.();
  }

  consumePendingAddMode() {
    const mode = localStorage.getItem('renew_wardrobe_add_mode') || '';
    if (mode === 'single_item' || mode === 'person_outfit') {
      this.pendingAddMode = mode;
      if (this.isWardrobeLimitReached()) {
        this.showAddForm = false;
        this.showUpgradeModal = true;
        this.upgradeNotice = `Free limit is ${FREE_WARDROBE_LIMIT}. Upgrade to unlock ${EXPANDED_WARDROBE_LIMIT}.`;
      } else {
        this.showAddForm = true;
      }
    }
    localStorage.removeItem('renew_wardrobe_add_mode');
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
   * @param {string} color
   * @returns {string}
   */
  colorLabel(color) {
    const value = String(color || '').trim();
    if (!value) return 'Unknown';
    return value.startsWith('#') ? value.toUpperCase() : value;
  }

  /**
   * @param {import('../models/garment.js').GarmentCategory} category
   * @returns {import('../models/garment.js').GarmentPosition}
   */
  defaultPositionForCategory(category) {
    const defaultPositions = {
      base: { x: 17, y: 9, width: 42, height: 25 },
      shirt: { x: 15, y: 8, width: 45, height: 28 },
      sweater: { x: 13, y: 6, width: 50, height: 30 },
      outerwear: { x: 10, y: 4, width: 56, height: 50 },
      dress: { x: 14, y: 10, width: 50, height: 56 },
      pants: { x: 18, y: 38, width: 38, height: 38 },
      socks: { x: 24, y: 74, width: 28, height: 12 },
      shoes: { x: 20, y: 78, width: 35, height: 14 },
      accessory: { x: 30, y: 5, width: 16, height: 10 },
    };
    return defaultPositions[category] || { x: 15, y: 8, width: 45, height: 28 };
  }
}





