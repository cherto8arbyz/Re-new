/**
 * Gemini key provider utilities.
 * Priority: runtime config -> localStorage (runtime override).
 */

import { readConfig } from '../api/backend-config.js';
import { GeminiService } from './gemini-service.js';

const API_KEY_STORAGE = 'renew_gemini_key';

const configKey = readConfig('GEMINI_API_KEY');

/** @type {GeminiService | null} */
let geminiService = null;

/**
 * @returns {string}
 */
export function getGeminiApiKey() {
  const local = typeof localStorage !== 'undefined'
    ? (localStorage.getItem(API_KEY_STORAGE) || '').trim()
    : '';
  return local || configKey;
}

/**
 * @returns {GeminiService | null}
 */
export function getGeminiService() {
  const key = getGeminiApiKey();
  if (!key) return null;
  if (geminiService && geminiService.apiKey === key) return geminiService;
  geminiService = new GeminiService(key);
  return geminiService;
}

/**
 * @param {string} apiKey
 */
export function setGeminiApiKey(apiKey) {
  const clean = apiKey.trim();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(API_KEY_STORAGE, clean);
  }
  geminiService = clean ? new GeminiService(clean) : null;
}

/**
 * @returns {boolean}
 */
export function hasGeminiKey() {
  return Boolean(getGeminiApiKey());
}
