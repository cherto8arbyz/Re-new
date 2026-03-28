import { readConfig } from './backend-config.js';

/**
 * Supabase adapter for auth-scoped wardrobe, trends and storage operations.
 * Supports normalized schema and a legacy wardrobe fallback.
 */
export class SupabaseApi {
  constructor() {
    this.url = readConfig('SUPABASE_URL').replace(/\/+$/, '');
    this.anonKey = readConfig('SUPABASE_ANON_KEY');
  }

  /**
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.url && this.anonKey);
  }

  /**
   * @param {string} userId
   * @param {string} [accessToken]
   * @returns {Promise<import('../models/garment.js').Garment[] | null>}
   */
  async getWardrobe(userId, accessToken) {
    if (!this.isConfigured()) return null;

    try {
      const normalized = await this._getWardrobeNormalized(userId, accessToken);
      if (normalized) return normalized;
    } catch {
      // fall through to legacy table
    }

    return this._getWardrobeLegacy(userId, accessToken);
  }

  /**
   * @param {string} userId
   * @param {import('../models/garment.js').Garment[]} items
   * @param {string} [accessToken]
   * @returns {Promise<boolean>}
   */
  async saveWardrobe(userId, items, accessToken) {
    if (!this.isConfigured()) return false;

    try {
      const ok = await this._saveWardrobeNormalized(userId, items, accessToken);
      if (ok) return true;
    } catch {
      // fall through to legacy table
    }

    return this._saveWardrobeLegacy(userId, items, accessToken);
  }

  /**
   * @param {string} date
   * @param {string} region
   * @param {string} [accessToken]
   * @returns {Promise<Array<{ snapshot_date: string, region: string, signals: any, source?: string }> | null>}
   */
  async getTrendSnapshots(date, region, accessToken) {
    if (!this.isConfigured()) return null;

    const endpoint =
      `${this.url}/rest/v1/trend_snapshots` +
      `?snapshot_date=eq.${encodeURIComponent(date)}` +
      `&region=eq.${encodeURIComponent(region)}` +
      '&select=snapshot_date,region,signals,source';

    const res = await fetch(endpoint, {
      headers: this._headers(accessToken),
    });
    if (!res.ok) return null;

    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  /**
   * @param {string} bucket
   * @param {string} objectPath
   * @param {Blob} blob
   * @param {{ accessToken?: string, contentType?: string }} [options]
   * @returns {Promise<{ path: string, url: string } | null>}
   */
  async uploadStorageObject(bucket, objectPath, blob, options = {}) {
    if (!this.isConfigured()) return null;

    const safePath = objectPath
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');

    const endpoint = `${this.url}/storage/v1/object/${encodeURIComponent(bucket)}/${safePath}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...this._headers(options.accessToken),
        'x-upsert': 'true',
        'Content-Type': options.contentType || blob.type || 'application/octet-stream',
      },
      body: blob,
    });

    if (!res.ok) return null;

    const publicUrl = `${this.url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${safePath}`;
    return {
      path: objectPath,
      url: publicUrl,
    };
  }

  /**
   * @param {string} userId
   * @param {string} [accessToken]
   * @returns {Promise<import('../models/garment.js').Garment[] | null>}
   */
  async _getWardrobeNormalized(userId, accessToken) {
    const endpoint =
      `${this.url}/rest/v1/wardrobe_items` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      '&select=id,name,category,color,brand,wear_count,cost_per_wear,position,metadata,wardrobe_images(original_url,cutout_url,mask_url)' +
      '&order=created_at.asc';

    const res = await fetch(endpoint, {
      headers: this._headers(accessToken),
    });
    if (!res.ok) return null;

    /** @type {any[]} */
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];

    return rows.map(row => {
      const imageRow = Array.isArray(row.wardrobe_images)
        ? row.wardrobe_images[0]
        : row.wardrobe_images;
      const position = this._normalizePosition(row.position);
      const metadata = this._normalizeObject(row.metadata);
      const previewDataUrl = this._optionalString(metadata.previewDataUrl);
      const originalUrl = this._optionalString(imageRow?.original_url);
      const cutoutUrl = this._optionalString(imageRow?.cutout_url);
      const maskUrl = this._optionalString(imageRow?.mask_url);
      const processedImageUrl = this._optionalString(metadata.processedImageUrl) || cutoutUrl || '';
      const processedThumbnailUrl = this._optionalString(metadata.processedThumbnailUrl);
      const rawFallbackUrl = this._optionalString(metadata.rawFallbackUrl) || originalUrl;
      const backgroundRemoved = Boolean(metadata.backgroundRemoved) && Boolean(processedImageUrl);
      const rawImageFallback = Boolean(metadata.rawImageFallback) || !backgroundRemoved;
      const colors = Array.isArray(metadata.colors) ? metadata.colors.map(String).filter(Boolean) : [];
      const styleTags = Array.isArray(metadata.styleTags) ? metadata.styleTags.map(String).filter(Boolean) : [];
      const seasonTags = Array.isArray(metadata.seasonTags) ? metadata.seasonTags.map(String).filter(Boolean) : [];
      const occasionTags = Array.isArray(metadata.occasionTags) ? metadata.occasionTags.map(String).filter(Boolean) : [];
      const title = this._optionalString(metadata.title) || this._optionalString(row.name) || 'Unnamed item';
      const confidence = typeof metadata.confidence === 'number' ? metadata.confidence : 1;
      const extractionConfidence = typeof metadata.extractionConfidence === 'number'
        ? metadata.extractionConfidence
        : confidence;
      const requiresReview = Boolean(metadata.requiresReview);

      return {
        id: String(row.id || ''),
        name: title,
        title,
        category: /** @type {import('../models/garment.js').GarmentCategory} */ (row.category || 'shirt'),
        imageUrl: processedImageUrl || previewDataUrl || cutoutUrl || originalUrl || '',
        thumbnailUrl: processedThumbnailUrl || processedImageUrl || previewDataUrl || cutoutUrl || originalUrl || '',
        iconName: this._optionalString(metadata.iconName) || `icon-${row.category || 'shirt'}`,
        sourceType: /** @type {'single_item' | 'person_outfit' | 'manual' | 'unknown'} */ (this._optionalString(metadata.sourceType) || 'unknown'),
        backgroundRemoved,
        extractionConfidence,
        confidence,
        requiresReview,
        reviewState: /** @type {'draft' | 'approved' | 'requires_review' | 'rejected'} */ (
          this._optionalString(metadata.reviewState) || (requiresReview ? 'requires_review' : 'approved')
        ),
        bodySlot: /** @type {'head' | 'torso' | 'legs' | 'feet' | 'accessory' | undefined} */ (
          this._optionalString(metadata.bodySlot) || undefined
        ),
        positionOffsetX: typeof metadata.positionOffsetX === 'number' ? metadata.positionOffsetX : 0,
        positionOffsetY: typeof metadata.positionOffsetY === 'number' ? metadata.positionOffsetY : 0,
        processedImageUrl: processedImageUrl || undefined,
        rawImageFallback,
        colors,
        styleTags,
        seasonTags,
        occasionTags,
        subcategory: this._optionalString(metadata.subcategory),
        createdAt: this._optionalString(metadata.createdAt) || '',
        position,
        color: this._optionalString(row.color),
        brand: this._optionalString(row.brand),
        wearCount: typeof row.wear_count === 'number' ? row.wear_count : 0,
        costPerWear: typeof row.cost_per_wear === 'number' ? row.cost_per_wear : undefined,
        originalUrl: originalUrl || undefined,
        cutoutUrl: cutoutUrl || undefined,
        maskUrl: maskUrl || undefined,
        metadata: {
          ...metadata,
          backgroundRemoved,
          processedThumbnailUrl: processedThumbnailUrl || '',
          rawFallbackUrl: rawFallbackUrl || '',
          rawImageFallback,
        },
      };
    });
  }

  /**
   * @param {string} userId
   * @param {import('../models/garment.js').Garment[]} items
   * @param {string} [accessToken]
   * @returns {Promise<boolean>}
   */
  async _saveWardrobeNormalized(userId, items, accessToken) {
    const clearEndpoint = `${this.url}/rest/v1/wardrobe_items?user_id=eq.${encodeURIComponent(userId)}`;
    const clearRes = await fetch(clearEndpoint, {
      method: 'DELETE',
      headers: {
        ...this._headers(accessToken),
        Prefer: 'return=minimal',
      },
    });
    if (!clearRes.ok) return false;

    if (items.length === 0) return true;

    const itemRows = items.map(item => ({
      id: item.id,
      user_id: userId,
      name: item.name,
      category: item.category,
      color: item.color || null,
      brand: item.brand || null,
      wear_count: item.wearCount ?? 0,
      cost_per_wear: item.costPerWear ?? null,
      position: item.position,
      metadata: {
        ...(item.metadata || {}),
        title: item.title || item.name,
        subcategory: item.subcategory || '',
        colors: item.colors || (item.color ? [item.color] : []),
        styleTags: item.styleTags || [],
        seasonTags: item.seasonTags || [],
        occasionTags: item.occasionTags || [],
        iconName: item.iconName || `icon-${item.category}`,
        sourceType: item.sourceType || 'unknown',
        backgroundRemoved: Boolean(item.backgroundRemoved),
        processedImageUrl: item.processedImageUrl || item.cutoutUrl || '',
        processedThumbnailUrl: item.metadata?.processedThumbnailUrl || '',
        rawImageFallback: Boolean(item.rawImageFallback),
        rawFallbackUrl: item.metadata?.rawFallbackUrl || item.originalUrl || '',
        extractionConfidence: typeof item.extractionConfidence === 'number'
          ? item.extractionConfidence
          : (typeof item.confidence === 'number' ? item.confidence : 1),
        confidence: typeof item.confidence === 'number' ? item.confidence : 1,
        requiresReview: Boolean(item.requiresReview),
        reviewState: item.reviewState || (item.requiresReview ? 'requires_review' : 'approved'),
        bodySlot: item.bodySlot || '',
        positionOffsetX: Number.isFinite(Number(item.positionOffsetX)) ? Number(item.positionOffsetX) : 0,
        positionOffsetY: Number.isFinite(Number(item.positionOffsetY)) ? Number(item.positionOffsetY) : 0,
        createdAt: item.createdAt || new Date().toISOString(),
      },
    }));

    const itemsRes = await fetch(`${this.url}/rest/v1/wardrobe_items`, {
      method: 'POST',
      headers: {
        ...this._headers(accessToken),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(itemRows),
    });
    if (!itemsRes.ok) return false;

    const imageRows = items
      .filter(item => item.originalUrl || item.cutoutUrl || item.maskUrl)
      .map(item => ({
        item_id: item.id,
        original_url: item.originalUrl || item.imageUrl || null,
        cutout_url: item.cutoutUrl || item.processedImageUrl || null,
        mask_url: item.maskUrl || null,
      }));

    if (imageRows.length > 0) {
      const imagesRes = await fetch(`${this.url}/rest/v1/wardrobe_images`, {
        method: 'POST',
        headers: {
          ...this._headers(accessToken),
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(imageRows),
      });
      if (!imagesRes.ok) return false;
    }

    return true;
  }

  /**
   * @param {string} userId
   * @param {string} [accessToken]
   * @returns {Promise<import('../models/garment.js').Garment[] | null>}
   */
  async _getWardrobeLegacy(userId, accessToken) {
    const endpoint = `${this.url}/rest/v1/wardrobes?user_id=eq.${encodeURIComponent(userId)}&select=items`;
    const res = await fetch(endpoint, {
      headers: this._headers(accessToken),
    });

    if (!res.ok) return null;

    /** @type {Array<{items?: import('../models/garment.js').Garment[]}>} */
    const rows = await res.json();
    const items = rows?.[0]?.items;
    return Array.isArray(items) ? items : [];
  }

  /**
   * @param {string} userId
   * @param {import('../models/garment.js').Garment[]} items
   * @param {string} [accessToken]
   * @returns {Promise<boolean>}
   */
  async _saveWardrobeLegacy(userId, items, accessToken) {
    const endpoint = `${this.url}/rest/v1/wardrobes`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...this._headers(accessToken),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{ user_id: userId, items }]),
    });
    return res.ok;
  }

  /**
   * @param {string} [accessToken]
   * @returns {Record<string, string>}
   */
  _headers(accessToken) {
    const token = accessToken || this.anonKey;
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * @param {any} raw
   * @returns {import('../models/garment.js').GarmentPosition}
   */
  _normalizePosition(raw) {
    if (typeof raw !== 'object' || !raw) {
      return { x: 15, y: 8, width: 45, height: 28 };
    }
    return {
      x: Number(raw.x ?? 15),
      y: Number(raw.y ?? 8),
      width: Number(raw.width ?? 45),
      height: Number(raw.height ?? 28),
    };
  }

  /**
   * @param {any} raw
   * @returns {Record<string, any>}
   */
  _normalizeObject(raw) {
    return typeof raw === 'object' && raw ? raw : {};
  }

  /**
   * @param {any} value
   * @returns {string}
   */
  _optionalString(value) {
    return typeof value === 'string' ? value : '';
  }
}
