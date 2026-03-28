import { readConfig } from './backend-config.js';
import { SupabaseApi } from './supabase-api.js';
import { FirebaseApi } from './firebase-api.js';

const LOCAL_PREFIX = 'renew_wardrobe_user_';

/**
 * Backend-agnostic wardrobe API with local fallback.
 * Local storage is a resilience layer, not a mock seed source.
 */
export class WardrobeApi {
  constructor() {
    this.provider = readConfig('BACKEND_PROVIDER', 'supabase').toLowerCase();
    this.supabase = new SupabaseApi();
    this.firebase = new FirebaseApi();
    this.accessToken = '';
  }

  /**
   * @param {string} token
   */
  setAccessToken(token) {
    this.accessToken = token || '';
  }

  /**
   * @param {string} userId
   * @returns {Promise<import('../models/garment.js').Garment[]>}
   */
  async loadWardrobe(userId) {
    const remote = await this._loadRemote(userId);
    if (remote) {
      this._saveLocal(userId, remote);
      return remote;
    }
    return this._loadLocal(userId);
  }

  /**
   * @param {string} userId
   * @param {import('../models/garment.js').Garment[]} items
   * @returns {Promise<void>}
   */
  async saveWardrobe(userId, items) {
    this._saveLocal(userId, items);
    await this._saveRemote(userId, items);
  }

  /**
   * @param {string} userId
   * @returns {Promise<import('../models/garment.js').Garment[] | null>}
   */
  async _loadRemote(userId) {
    try {
      if (this.provider === 'firebase') {
        return await this.firebase.getWardrobe(userId);
      }
      return await this.supabase.getWardrobe(userId, this.accessToken);
    } catch {
      return null;
    }
  }

  /**
   * @param {string} userId
   * @param {import('../models/garment.js').Garment[]} items
   * @returns {Promise<void>}
   */
  async _saveRemote(userId, items) {
    try {
      if (this.provider === 'firebase') {
        await this.firebase.saveWardrobe(userId, items);
      } else {
        await this.supabase.saveWardrobe(userId, items, this.accessToken);
      }
    } catch {
      // keep local cache as fallback
    }
  }

  /**
   * @param {string} userId
   * @returns {import('../models/garment.js').Garment[]}
   */
  _loadLocal(userId) {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(`${LOCAL_PREFIX}${userId}`);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * @param {string} userId
   * @param {import('../models/garment.js').Garment[]} items
   */
  _saveLocal(userId, items) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${LOCAL_PREFIX}${userId}`, JSON.stringify(items));
  }
}
