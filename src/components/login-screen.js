/**
 * Login / Splash screen.
 * Entry action: local app sign-in (routes to in-app onboarding).
 */
export class LoginScreen {
  /**
   * @param {HTMLElement} container
   * @param {{ onLogin: () => Promise<void>, loading?: boolean, error?: string | null }} options
   */
  constructor(container, options) {
    this.container = container;
    this.onLogin = options.onLogin;
    this.loading = Boolean(options.loading);
    this.error = options.error || null;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="login-screen">
        <div class="login-screen__brand">
          <div class="login-screen__logo">Re:<span>new</span></div>
          <p class="login-screen__subtitle">Production MVP</p>
        </div>

        <div class="login-screen__body">
          <h1 class="login-screen__title">Smart wardrobe, real context</h1>
          <p class="login-screen__text">
            Connect your account to sync wardrobe and activate AI Agent styling with weather and calendar context.
          </p>

          <button class="login-screen__google-btn" id="login-google-btn" ${this.loading ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.8-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.6C16.8 3 14.6 2 12 2 6.9 2 2.8 6.4 2.8 12s4.1 10 9.2 10c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1.1-.2-1.6H12z"/>
            </svg>
            Sign In
          </button>

          ${this.error ? `<div class="login-screen__error">${this.error}</div>` : ''}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const btn = this.container.querySelector('#login-google-btn');
    btn?.addEventListener('click', async () => {
      if (this.loading) return;
      this.loading = true;
      this.render();
      try {
        await this.onLogin();
      } catch (err) {
        this.loading = false;
        this.error = /** @type {Error} */ (err).message || 'Sign-in failed';
        this.render();
      }
    });
  }
}
