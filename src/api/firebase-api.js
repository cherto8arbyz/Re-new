import { readConfig } from './backend-config.js';

/**
 * Firebase REST adapter placeholder (Firestore-backed contract).
 * For production, replace REST endpoints with official SDK wiring if needed.
 */
export class FirebaseApi {
  constructor() {
    this.projectId = readConfig('FIREBASE_PROJECT_ID');
    this.apiKey = readConfig('FIREBASE_API_KEY');
  }

  /**
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.projectId && this.apiKey);
  }

  /**
   * @param {string} userId
   * @returns {Promise<import('../models/garment.js').Garment[] | null>}
   */
  async getWardrobe(userId) {
    if (!this.isConfigured()) return null;

    const documentPath = `wardrobes/${encodeURIComponent(userId)}`;
    const endpoint = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${documentPath}?key=${this.apiKey}`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;

    const data = await res.json();
    const rawItems = data?.fields?.items?.stringValue;
    if (!rawItems) return [];

    try {
      const parsed = JSON.parse(rawItems);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * @param {string} userId
   * @param {import('../models/garment.js').Garment[]} items
   * @returns {Promise<boolean>}
   */
  async saveWardrobe(userId, items) {
    if (!this.isConfigured()) return false;

    const documentPath = `wardrobes/${encodeURIComponent(userId)}`;
    const endpoint = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${documentPath}?key=${this.apiKey}`;
    const body = {
      fields: {
        items: { stringValue: JSON.stringify(items) },
      },
    };

    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return res.ok;
  }
}

