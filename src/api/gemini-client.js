import { readConfig } from './backend-config.js';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * @param {{
 *  model: string,
 *  body: Record<string, any>,
 *  timeoutMs?: number,
 *  returnText?: boolean,
 * }} input
 * @returns {Promise<any>}
 */
export async function generateGeminiContent(input) {
  const model = String(input?.model || '').trim() || 'gemini-2.5-flash';
  const body = input?.body && typeof input.body === 'object' ? input.body : {};
  const timeoutMs = Number.isFinite(input?.timeoutMs) ? Number(input.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const returnText = Boolean(input?.returnText);

  const proxyBaseUrl = normalizeBaseUrl(readConfig('AI_PROXY_URL') || readConfig('IMAGE_PIPELINE_URL'));
  let proxyError = null;

  if (proxyBaseUrl) {
    try {
      return await postJson(`${proxyBaseUrl}/api/ai/generate-content`, { model, body }, timeoutMs, returnText);
    } catch (error) {
      proxyError = error;
    }
  }

  const apiKey = readConfig('GEMINI_API_KEY');
  if (!apiKey) {
    if (proxyError instanceof Error) throw proxyError;
    throw new Error('Gemini is not configured. Set backend GEMINI_API_KEY or EXPO_PUBLIC_GEMINI_API_KEY.');
  }

  return postJson(
    `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    body,
    timeoutMs,
    returnText,
  );
}

/**
 * @param {string} url
 * @param {Record<string, any>} body
 * @param {number} timeoutMs
 * @param {boolean} returnText
 * @returns {Promise<any>}
 */
async function postJson(url, body, timeoutMs, returnText) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });

    const rawText = await response.text();
    const data = safeParseJson(rawText);

    if (!response.ok) {
      const message = String(data?.error || data?.detail || `Gemini request failed with ${response.status}.`);
      throw new Error(message);
    }

    return returnText ? { rawText, data } : (data || {});
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gemini request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * @param {string} url
 * @returns {string}
 */
function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * @param {string} text
 * @returns {any}
 */
function safeParseJson(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}
