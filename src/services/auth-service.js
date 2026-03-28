import { readConfig } from '../api/backend-config.js';

const SESSION_KEY = 'renew_auth_session';

/**
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} email
 * @property {string} name
 * @property {string} provider
 */

/**
 * @typedef {Object} AuthSession
 * @property {AuthUser} user
 * @property {string} [accessToken]
 * @property {string} [refreshToken]
 * @property {boolean} [isDevelopmentFallback]
 */

/**
 * Authentication service with provider-ready structure.
 * Google OAuth credentials are read from runtime config:
 * - GOOGLE_WEB_CLIENT_ID
 * - SUPABASE_URL / SUPABASE_ANON_KEY (when BACKEND_PROVIDER=supabase)
 * - FIREBASE_* keys (when BACKEND_PROVIDER=firebase)
 */
export class AuthService {
  constructor() {
    this.provider = readConfig('BACKEND_PROVIDER', 'supabase').toLowerCase();
    this.googleClientId = readConfig('GOOGLE_WEB_CLIENT_ID');
    this.supabaseUrl = readConfig('SUPABASE_URL').replace(/\/+$/, '');
    this.supabaseAnonKey = readConfig('SUPABASE_ANON_KEY');
  }

  /**
   * @returns {AuthSession | null}
   */
  getCurrentSession() {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * @returns {boolean}
   */
  hasSession() {
    return Boolean(this.getCurrentSession());
  }

  /**
   * Google Sign-In entrypoint.
   * Current implementation keeps a production-ready contract and uses
   * a local dev fallback when OAuth runtime is not configured yet.
   *
   * @returns {Promise<AuthSession>}
   */
  async signInWithGoogle() {
    if (this.provider === 'supabase' && this.supabaseUrl) {
      this._startSupabaseGoogleRedirect();
      // Redirect flow hands control to browser navigation.
      return new Promise(() => {});
    }

    const session = await this._attemptGoogleOAuth();
    this._persistSession(session);
    return session;
  }

  /**
   * Simple local sign-in for development flow.
   * Creates a local session and routes user to onboarding.
   *
   * @returns {Promise<AuthSession>}
   */
  async signInLocal() {
    const session = this._buildDevFallbackSession();
    this._persistSession(session);
    return session;
  }

  /**
   * @returns {Promise<void>}
   */
  async signOut() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  /**
   * Consumes Supabase OAuth redirect hash and persists session.
   * Returns null when no redirect payload is present.
   *
   * @returns {Promise<AuthSession | null>}
   */
  async consumeOAuthRedirectSession() {
    if (typeof window === 'undefined') return null;
    if (this.provider !== 'supabase' || !this.supabaseUrl) return null;

    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash || !hash.includes('access_token=')) return null;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const error = params.get('error_description') || params.get('error');

    if (error) {
      this._clearOAuthHash();
      throw new Error(`Google sign-in failed: ${error}`);
    }

    if (!accessToken) {
      this._clearOAuthHash();
      return null;
    }

    const user = await this._fetchSupabaseUser(accessToken);
    const session = {
      user,
      accessToken,
      refreshToken: refreshToken || undefined,
    };

    this._persistSession(session);
    this._clearOAuthHash();
    return session;
  }

  /**
   * @returns {Promise<AuthSession>}
   */
  async _attemptGoogleOAuth() {
    if (!this.googleClientId) {
      return this._buildDevFallbackSession();
    }

    // TODO: Wire official Google Identity Services popup / redirect flow.
    // This fallback keeps the app runnable until real OAuth is provisioned.
    return this._buildDevFallbackSession();
  }

  /**
   * @returns {AuthSession}
   */
  _buildDevFallbackSession() {
    const randomId = Math.random().toString(36).slice(2, 10);
    return {
      user: {
        id: `google-dev-${randomId}`,
        email: 'dev.user@renew.app',
        name: 'Re:new User',
        provider: `google:${this.provider}`,
      },
      isDevelopmentFallback: true,
    };
  }

  _startSupabaseGoogleRedirect() {
    if (typeof window === 'undefined') return;

    const redirectTarget = new URL(window.location.href);
    redirectTarget.hash = '';

    const params = new URLSearchParams({
      provider: 'google',
      redirect_to: redirectTarget.toString(),
    });
    const authorizeUrl = `${this.supabaseUrl}/auth/v1/authorize?${params.toString()}`;
    window.location.assign(authorizeUrl);
  }

  /**
   * @param {string} accessToken
   * @returns {Promise<AuthUser>}
   */
  async _fetchSupabaseUser(accessToken) {
    if (!this.supabaseUrl) {
      throw new Error('SUPABASE_URL is required for OAuth user hydration.');
    }

    const res = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: this.supabaseAnonKey || '',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to load Supabase user (${res.status}): ${text}`);
    }

    const data = await res.json();
    const metadata = typeof data?.user_metadata === 'object' && data.user_metadata
      ? data.user_metadata
      : {};

    return {
      id: String(data?.id || ''),
      email: String(data?.email || ''),
      name: String(
        metadata.full_name ||
        metadata.name ||
        data?.email?.split?.('@')?.[0] ||
        'Re:new User'
      ),
      provider: String(data?.app_metadata?.provider || `google:${this.provider}`),
    };
  }

  _clearOAuthHash() {
    if (typeof window === 'undefined') return;
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  /**
   * @param {AuthSession} session
   */
  _persistSession(session) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}
