import { WardrobeApi } from '../api/wardrobe-api.js';

const LEGACY_STORAGE_KEY = 'renew_wardrobe';

/** @type {string} */
let activeUserId = 'anonymous';
/** @type {string} */
let activeAccessToken = '';
/** @type {import('../models/garment.js').Garment[]} */
let cachedItems = [];

const wardrobeApi = new WardrobeApi();

/**
 * Sets the active user scope for subsequent repository calls.
 * @param {string} userId
 */
export function setActiveUser(userId) {
  activeUserId = userId || 'anonymous';
}

/**
 * Sets access token for backend requests (required for RLS-protected tables).
 * @param {string} accessToken
 */
export function setActiveAccessToken(accessToken) {
  activeAccessToken = accessToken || '';
  wardrobeApi.setAccessToken(activeAccessToken);
}

/**
 * Loads wardrobe from configured backend (with local fallback).
 * Legacy storage key is still read once to avoid data loss on migration.
 *
 * @param {string} [userId]
 * @returns {Promise<import('../models/garment.js').Garment[]>}
 */
export async function loadWardrobe(userId = activeUserId) {
  wardrobeApi.setAccessToken(activeAccessToken);
  const loaded = await wardrobeApi.loadWardrobe(userId);
  if (loaded.length === 0) {
    const legacy = readLegacyStorage();
    if (legacy.length > 0) {
      await wardrobeApi.saveWardrobe(userId, legacy);
      cachedItems = legacy;
      return legacy;
    }
  }

  cachedItems = loaded;
  return loaded;
}

/**
 * Persists full wardrobe snapshot.
 * @param {import('../models/garment.js').Garment[]} items
 * @param {string} [userId]
 * @returns {Promise<void>}
 */
export async function saveWardrobe(items, userId = activeUserId) {
  wardrobeApi.setAccessToken(activeAccessToken);
  cachedItems = [...items];
  await wardrobeApi.saveWardrobe(userId, items);
}

/**
 * Legacy sync accessor (returns in-memory cache).
 * Prefer loadWardrobe() in new code paths.
 *
 * @returns {import('../models/garment.js').Garment[]}
 */
export function getAll() {
  return [...cachedItems];
}

/**
 * @param {string} id
 * @returns {import('../models/garment.js').Garment | undefined}
 */
export function getById(id) {
  return cachedItems.find(g => g.id === id);
}

/**
 * @param {import('../models/garment.js').Garment} garment
 * @returns {Promise<void>}
 */
export async function save(garment) {
  const next = [...cachedItems];
  const idx = next.findIndex(g => g.id === garment.id);
  if (idx >= 0) next[idx] = garment;
  else next.push(garment);
  await saveWardrobe(next);
}

/**
 * Updates image links and editable metadata for a garment.
 * Fields are merged non-destructively.
 *
 * @param {string} garmentId
 * @param {{
 *  originalUrl?: string,
 *  cutoutUrl?: string,
 *  maskUrl?: string,
 *  metadata?: Record<string, any>
 * }} patch
 * @returns {Promise<void>}
 */
export async function updateGarmentAssets(garmentId, patch) {
  const next = cachedItems.map(item => {
    if (item.id !== garmentId) return item;
    return {
      ...item,
      originalUrl: patch.originalUrl || item.originalUrl,
      cutoutUrl: patch.cutoutUrl || item.cutoutUrl,
      maskUrl: patch.maskUrl || item.maskUrl,
      metadata: {
        ...(item.metadata || {}),
        ...(patch.metadata || {}),
      },
    };
  });

  await saveWardrobe(next);
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function remove(id) {
  const next = cachedItems.filter(g => g.id !== id);
  await saveWardrobe(next);
}

/**
 * @param {import('../models/garment.js').GarmentCategory} category
 * @returns {import('../models/garment.js').Garment[]}
 */
export function getByCategory(category) {
  return cachedItems.filter(g => g.category === category);
}

/**
 * @returns {import('../models/garment.js').Garment[]}
 */
function readLegacyStorage() {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
