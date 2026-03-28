import { prepareUserFaceAssets } from '../services/cv-service.js';
import { setUser } from '../state/actions.js';

export class ProfileScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../state/store.js').Store<import('../state/app-state.js').AppState, any>} store
   */
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.statusMessage = '';
    this.statusIsError = false;
    this.render(store.getState());
    this.unsubscribe = store.subscribe(state => this.render(state));
  }

  /**
   * @param {import('../state/app-state.js').AppState} state
   */
  render(state) {
    const name = state.user?.name || state.authSession?.user?.name || 'User';
    const style = state.user?.style || 'not selected';
    const email = state.authSession?.user?.email || 'no email';
    const profilePhoto = state.user?.profileAvatarUrl || state.user?.avatarUrl || '';
    const lookFace = state.user?.lookFaceAssetUrl || state.user?.faceReferenceUrl || '';

    this.container.innerHTML = `
      <div class="profile-screen">
        <div class="profile-screen__card">
          <div class="profile-screen__photo-wrap">
            ${profilePhoto
              ? `<img class="profile-screen__photo" src="${profilePhoto}" alt="${name}" />`
              : `<div class="profile-screen__photo profile-screen__photo--placeholder">No photo</div>`
            }
          </div>
          <div class="profile-screen__name">${name}</div>
          <div class="profile-screen__meta">${email}</div>
          <div class="profile-screen__meta">Style: ${style}</div>
          <div class="profile-screen__meta profile-screen__meta--small">
            Look face asset: ${lookFace ? 'ready' : 'missing'}
          </div>

          <label class="profile-screen__upload-btn" for="profile-photo-input">Change profile photo</label>
          <input type="file" id="profile-photo-input" accept="image/*" capture="user" hidden />
          <div class="profile-screen__status${this.statusIsError ? ' profile-screen__status--error' : ''}">
            ${this.statusMessage}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const photoInput = /** @type {HTMLInputElement | null} */ (this.container.querySelector('#profile-photo-input'));
    photoInput?.addEventListener('change', async () => {
      const file = photoInput.files?.[0];
      if (!file) return;
      await this.handlePhotoUpdate(file);
      photoInput.value = '';
    });
  }

  /**
   * @param {File} file
   */
  async handlePhotoUpdate(file) {
    this.setStatus('Updating profile photo...');

    let dataUrl = '';
    try {
      dataUrl = await this.fileToDataUrl(file);
    } catch {
      this.setStatus('Failed to read selected file.', true);
      return;
    }

    const processed = await prepareUserFaceAssets(dataUrl);
    if (!processed.success) {
      this.setStatus(processed.error || 'Face not detected clearly. Please upload a better photo.', true);
      return;
    }

    const state = this.store.getState();
    if (!state.user) {
      this.setStatus('User session is missing.', true);
      return;
    }

    this.store.dispatch(setUser({
      ...state.user,
      avatarUrl: processed.profileAvatarUrl || dataUrl,
      profileAvatarUrl: processed.profileAvatarUrl || dataUrl,
      lookFaceAssetUrl: processed.lookFaceAssetUrl || '',
      faceReferenceUrl: processed.lookFaceAssetUrl || '',
      faceAsset: processed.faceAsset,
      onboardingComplete: true,
    }));

    this.setStatus('Profile photo updated. Look face asset regenerated.');
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
   * @param {string} message
   * @param {boolean} [isError]
   */
  setStatus(message, isError = false) {
    this.statusMessage = message;
    this.statusIsError = isError;
    const statusEl = this.container.querySelector('.profile-screen__status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.classList.toggle('profile-screen__status--error', isError);
    }
  }

  destroy() {
    this.unsubscribe?.();
  }
}
