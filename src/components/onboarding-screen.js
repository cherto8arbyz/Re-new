import { createUser, USER_STYLES } from '../models/user.js';
import { prepareUserFaceAssets } from '../services/cv-service.js';
import { setUser, completeOnboarding, setAvatarUrl } from '../state/actions.js';

/**
 * Onboarding Screen вЂ” Registration & Digital Avatar Creation.
 * Flow: user enters name, selects style, uploads/captures photo,
 * AI generates silhouette avatar, then proceeds to main app.
 */
export class OnboardingScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../state/store.js').Store<import('../state/app-state.js').AppState, any>} store
   * @param {() => void} onComplete - Callback when onboarding is finished
   */
  constructor(container, store, onComplete) {
    this.container = container;
    this.store = store;
    this.onComplete = onComplete;
    /** @type {string} */
    this.photoDataUrl = '';
    /** @type {string} */
    this.avatarPreview = '';
    /** @type {import('../models/domain-models.js').FaceAsset | null} */
    this.faceAsset = null;
    /** @type {string} */
    this.lookFaceAssetUrl = '';
    this.facePhotoValid = false;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="onboarding">
        <div class="onboarding__header">
          <div class="onboarding__logo">Re:<span>new</span></div>
          <p class="onboarding__tagline">Your intelligent digital wardrobe</p>
        </div>

        <div class="onboarding__form">
          <div class="onboarding__field">
            <label class="onboarding__label" for="ob-name">Your Name</label>
            <input class="onboarding__input" id="ob-name" type="text" placeholder="Enter your name" autocomplete="off" />
          </div>

          <div class="onboarding__field">
            <label class="onboarding__label">Style Preference</label>
            <div class="onboarding__styles" id="ob-styles">
              ${USER_STYLES.map(s => `
                <button class="onboarding__style-btn" data-style="${s}">
                  ${s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="onboarding__field">
            <label class="onboarding__label">Create Your Avatar</label>
            <p class="onboarding__hint">Upload a clear photo with your face. This photo is required.</p>
            <div class="onboarding__avatar-area" id="ob-avatar-area">
              <div class="onboarding__avatar-preview" id="ob-avatar-preview">
                <svg viewBox="0 0 100 200" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.2">
                  <ellipse cx="50" cy="22" rx="14" ry="16"/>
                  <path d="M36,38 Q28,44 22,56 L18,90 L32,92 L36,68 L36,105 L30,178 L40,180 L50,120 L60,180 L70,178 L64,105 L64,68 L68,92 L82,90 L78,56 Q72,44 64,38 Z"/>
                </svg>
              </div>
              <div class="onboarding__avatar-actions">
                <label class="onboarding__upload-btn" for="ob-photo-input">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Upload Photo
                </label>
                <input type="file" id="ob-photo-input" accept="image/*" capture="user" hidden />
                <button class="onboarding__camera-btn" id="ob-camera-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  Take Photo
                </button>
              </div>
            </div>
          </div>

          <div class="onboarding__status" id="ob-status"></div>

          <button class="onboarding__submit" id="ob-submit" disabled>
            Create My Wardrobe
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const nameInput = /** @type {HTMLInputElement} */ (this.container.querySelector('#ob-name'));
    const styleButtons = this.container.querySelectorAll('.onboarding__style-btn');
    const photoInput = /** @type {HTMLInputElement} */ (this.container.querySelector('#ob-photo-input'));
    const cameraBtn = this.container.querySelector('#ob-camera-btn');
    const submitBtn = /** @type {HTMLButtonElement} */ (this.container.querySelector('#ob-submit'));
    let selectedStyle = '';

    // Style selection
    styleButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        styleButtons.forEach(b => b.classList.remove('onboarding__style-btn--active'));
        btn.classList.add('onboarding__style-btn--active');
        selectedStyle = btn.getAttribute('data-style') || '';
        this.updateSubmitState(nameInput, selectedStyle, submitBtn);
      });
    });

    // Name input
    nameInput?.addEventListener('input', () => {
      this.updateSubmitState(nameInput, selectedStyle, submitBtn);
    });

    // Photo upload
    photoInput?.addEventListener('change', async () => {
      const file = photoInput.files?.[0];
      if (file) {
        await this.handlePhoto(file);
        this.updateSubmitState(nameInput, selectedStyle, submitBtn);
      }
    });

    // Camera button (uses file input with capture on mobile, file dialog on desktop)
    cameraBtn?.addEventListener('click', () => {
      photoInput?.click();
    });

    // Submit
    submitBtn?.addEventListener('click', async () => {
      const name = nameInput?.value?.trim();
      if (!name || !selectedStyle || !this.facePhotoValid) {
        this.showStatus('Please upload a face photo before continuing.', true);
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Setting up...';

      try {
        const user = createUser({
          name,
          style: selectedStyle,
          avatarUrl: this.avatarPreview,
          profileAvatarUrl: this.avatarPreview,
          lookFaceAssetUrl: this.lookFaceAssetUrl || undefined,
          faceReferenceUrl: this.lookFaceAssetUrl || undefined,
          faceAsset: this.faceAsset,
        });
        this.store.dispatch(setUser(user));

        if (this.avatarPreview) {
          this.store.dispatch(setAvatarUrl(this.avatarPreview));
        }

        this.store.dispatch(completeOnboarding());
        this.onComplete();
      } catch (err) {
        this.showStatus(`Error: ${/** @type {Error} */ (err).message}`, true);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create My Wardrobe';
      }
    });
  }

  /**
   * @param {File} file
   */
  async handlePhoto(file) {
    this.showStatus('Analyzing photo...');

    const dataUrl = await this.fileToDataUrl(file);
    const faceValidation = await prepareUserFaceAssets(dataUrl);
    if (!faceValidation.success || !faceValidation.faceAsset) {
      this.photoDataUrl = '';
      this.avatarPreview = '';
      this.faceAsset = null;
      this.lookFaceAssetUrl = '';
      this.facePhotoValid = false;
      this.resetAvatarPreview();
      this.showStatus(faceValidation.error || 'Face not detected clearly. Please upload a better photo.', true);
      return;
    }

    this.photoDataUrl = dataUrl;
    this.facePhotoValid = true;
    this.avatarPreview = faceValidation.profileAvatarUrl || dataUrl;
    this.faceAsset = faceValidation.faceAsset;
    this.lookFaceAssetUrl = faceValidation.lookFaceAssetUrl || '';

    if (this.avatarPreview && this.lookFaceAssetUrl) {
      const preview = this.container.querySelector('#ob-avatar-preview');
      if (preview) {
        preview.innerHTML = `<img src="${this.avatarPreview}" alt="Your avatar" class="onboarding__avatar-img" />`;
      }
      const warnings = Array.isArray(faceValidation.warnings) ? faceValidation.warnings : [];
      if (warnings.includes('image_blurry')) {
        this.showStatus('Face detected, but image looks blurry. You can continue or upload a sharper photo.');
      } else {
        this.showStatus('Face photo accepted.');
      }
    } else {
      this.facePhotoValid = false;
      this.showStatus('Could not prepare face asset. Please try another photo.', true);
    }
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
   * @param {HTMLInputElement} nameInput
   * @param {string} selectedStyle
   * @param {HTMLButtonElement} submitBtn
   */
  updateSubmitState(nameInput, selectedStyle, submitBtn) {
    const valid = nameInput.value.trim().length > 0 && selectedStyle.length > 0 && this.facePhotoValid;
    submitBtn.disabled = !valid;
  }

  /**
   * @param {string} message
   * @param {boolean} [isError]
   */
  showStatus(message, isError = false) {
    const el = this.container.querySelector('#ob-status');
    if (el) {
      el.textContent = message;
      el.className = `onboarding__status${isError ? ' onboarding__status--error' : ''}`;
    }
  }

  resetAvatarPreview() {
    const preview = this.container.querySelector('#ob-avatar-preview');
    if (preview) {
      preview.innerHTML = `
        <svg viewBox="0 0 100 200" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.2">
          <ellipse cx="50" cy="22" rx="14" ry="16"/>
          <path d="M36,38 Q28,44 22,56 L18,90 L32,92 L36,68 L36,105 L30,178 L40,180 L50,120 L60,180 L70,178 L64,105 L64,68 L68,92 L82,90 L78,56 Q72,44 64,38 Z"/>
        </svg>
      `;
    }
  }
}



