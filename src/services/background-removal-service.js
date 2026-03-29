import { readConfig } from '../api/backend-config.js';
import { resolveBackendBaseUrl } from '../shared/backend-base-url.js';

const DEFAULT_BG_REMOVAL_URL = 'https://api.remove.bg/v1.0/removebg';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * @param {string} dataUrl
 * @returns {Promise<{ success: boolean, backgroundRemoved: boolean, imageDataUrl: string, provider: string, error?: string | null }>}
 */
export async function requestBackgroundRemoval(dataUrl) {
  const testOverride = await maybeResolveBackgroundRemovalTestOverride(dataUrl);
  if (testOverride) {
    return normalizeBackgroundRemovalResult(testOverride, dataUrl, 'test-override');
  }

  const timeoutMs = resolveTimeoutMs(readConfig('BG_REMOVAL_TIMEOUT_MS', String(DEFAULT_TIMEOUT_MS)));
  const apiKey = readConfig('BG_REMOVAL_API_KEY');

  if (apiKey) {
    const externalResult = await requestExternalBackgroundRemoval(dataUrl, {
      apiUrl: readConfig('BG_REMOVAL_API_URL', DEFAULT_BG_REMOVAL_URL),
      apiKey,
      timeoutMs,
    });
    if (externalResult.success && externalResult.backgroundRemoved) {
      return externalResult;
    }

    const pipelineFallback = await requestImagePipelineBackgroundRemoval(dataUrl, timeoutMs);
    if (pipelineFallback.success && pipelineFallback.backgroundRemoved) {
      return pipelineFallback;
    }

    return {
      success: externalResult.success || pipelineFallback.success,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider: pipelineFallback.provider || externalResult.provider || 'none',
      error: [externalResult.error, pipelineFallback.error].filter(Boolean).join(' ').trim() || 'Background removal failed.',
    };
  }

  return requestImagePipelineBackgroundRemoval(dataUrl, timeoutMs);
}

/**
 * @param {string} dataUrl
 * @returns {Promise<any>}
 */
async function maybeResolveBackgroundRemovalTestOverride(dataUrl) {
  const override = /** @type {any} */ (globalThis).__RENEW_TEST_BG_REMOVAL__;
  if (override === undefined || override === null) return undefined;
  if (typeof override === 'function') {
    return await override({ dataUrl });
  }
  if (typeof override === 'object' && typeof override.request === 'function') {
    return await override.request({ dataUrl });
  }
  return override;
}

/**
 * @param {any} input
 * @param {string} dataUrl
 * @param {string} fallbackProvider
 */
function normalizeBackgroundRemovalResult(input, dataUrl, fallbackProvider) {
  if (!input || typeof input !== 'object') {
    return {
      success: false,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider: fallbackProvider,
      error: 'Background removal override returned an invalid payload.',
    };
  }

  return {
    success: Boolean(input.success),
    backgroundRemoved: Boolean(input.backgroundRemoved),
    imageDataUrl: typeof input.imageDataUrl === 'string' && input.imageDataUrl.trim()
      ? input.imageDataUrl.trim()
      : dataUrl,
    provider: String(input.provider || fallbackProvider),
    error: input.error ? String(input.error) : null,
  };
}

/**
 * @param {string} value
 * @returns {number}
 */
function resolveTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.max(5000, Math.min(120000, Math.round(parsed)));
}

/**
 * @param {string} dataUrl
 * @param {{ apiUrl: string, apiKey: string, timeoutMs: number }} options
 * @returns {Promise<{ success: boolean, backgroundRemoved: boolean, imageDataUrl: string, provider: string, error?: string | null }>}
 */
async function requestExternalBackgroundRemoval(dataUrl, options) {
  const cleanedApiUrl = String(options.apiUrl || '').trim();
  if (!cleanedApiUrl) {
    return {
      success: false,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider: 'external-api',
      error: 'BG_REMOVAL_API_URL is not configured.',
    };
  }

  let parsed;
  try {
    parsed = parseDataUrl(dataUrl);
  } catch (error) {
    return {
      success: false,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider: 'external-api',
      error: error instanceof Error ? error.message : 'Failed to decode image for background removal.',
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId = null;
  if (controller) timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const form = new FormData();
    form.append('size', 'auto');
    form.append('format', 'png');
    form.append('image_file_b64', parsed.data);

    const response = await fetch(cleanedApiUrl, {
      method: 'POST',
      headers: {
        'X-Api-Key': options.apiKey,
      },
      body: form,
      signal: controller?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        backgroundRemoved: false,
        imageDataUrl: dataUrl,
        provider: 'external-api',
        error: readErrorMessage(errorText, response.status, 'Background removal API request failed.'),
      };
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('image/')) {
      const blob = await response.blob();
      const imageDataUrl = await blobToDataUrl(blob);
      return {
        success: true,
        backgroundRemoved: true,
        imageDataUrl,
        provider: 'remove.bg',
        error: null,
      };
    }

    const responseText = await response.text().catch(() => '');
    const payload = safeParseJson(responseText);
    const imageDataUrl = extractImageDataUrl(payload);
    if (!imageDataUrl) {
      return {
        success: false,
        backgroundRemoved: false,
        imageDataUrl: dataUrl,
        provider: String(payload?.provider || 'external-api'),
        error: 'Background removal API returned an unsupported payload.',
      };
    }

    return {
      success: true,
      backgroundRemoved: true,
      imageDataUrl,
      provider: String(payload?.provider || 'external-api'),
      error: payload?.error ? String(payload.error) : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Background removal request failed.';
    const timedOut = typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError';
    return {
      success: false,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider: 'external-api',
      error: timedOut
        ? `Background removal API timed out after ${options.timeoutMs} ms.`
        : message,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * @param {string} dataUrl
 * @param {number} timeoutMs
 * @returns {Promise<{ success: boolean, backgroundRemoved: boolean, imageDataUrl: string, provider: string, error?: string | null }>}
 */
async function requestImagePipelineBackgroundRemoval(dataUrl, timeoutMs) {
  const baseUrl = resolveBackendBaseUrl({
    preferProxy: false,
    allowDevLocalFallback: true,
  });
  if (!baseUrl) {
    return {
      success: false,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider: 'image-pipeline',
      error: 'IMAGE_PIPELINE_URL is not configured.',
    };
  }

  let blob = null;
  try {
    blob = await dataUrlToBlob(dataUrl);
  } catch {
    return {
      success: false,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider: 'image-pipeline',
      error: 'Failed to decode image for background removal.',
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId = null;
  if (controller) timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.append('file', blob, `upload.${guessImageExtension(blob.type || 'image/jpeg')}`);

    const response = await fetch(`${baseUrl}/api/image/background-remove`, {
      method: 'POST',
      body: form,
      signal: controller?.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        backgroundRemoved: false,
        imageDataUrl: dataUrl,
        provider: 'image-pipeline',
        error: String(payload?.error || `Image pipeline error (${response.status}).`),
      };
    }

    const imageDataUrl = typeof payload.image_data_url === 'string' && payload.image_data_url.trim()
      ? payload.image_data_url.trim()
      : dataUrl;

    return {
      success: true,
      backgroundRemoved: Boolean(payload.background_removed),
      imageDataUrl,
      provider: String(payload.provider || 'image-pipeline'),
      error: payload.error ? String(payload.error) : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image pipeline request failed.';
    const timedOut = typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError';
    const isNetworkFail = /failed to fetch/i.test(message) || /networkerror/i.test(message);
    return {
      success: false,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider: 'image-pipeline',
      error: timedOut
        ? `Image pipeline request timed out after ${timeoutMs} ms (${baseUrl}).`
        : isNetworkFail
          ? `Image pipeline is unreachable at ${baseUrl}.`
          : `Image pipeline request failed: ${message}`,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * @param {string} text
 * @param {number} status
 * @param {string} fallback
 * @returns {string}
 */
function readErrorMessage(text, status, fallback) {
  const payload = safeParseJson(text);
  if (payload?.errors?.[0]?.title) return `${payload.errors[0].title} (${status}).`;
  if (payload?.error?.message) return `${payload.error.message} (${status}).`;
  if (payload?.error) return `${String(payload.error)} (${status}).`;
  const normalized = String(text || '').trim();
  return normalized ? `${normalized.slice(0, 180)} (${status}).` : `${fallback} (${status}).`;
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

/**
 * @param {any} payload
 * @returns {string}
 */
function extractImageDataUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.image_data_url,
    payload.imageDataUrl,
    payload.cutoutDataUrl,
    payload.resultDataUrl,
    payload.data?.image_data_url,
    payload.data?.imageDataUrl,
    payload.output?.image_data_url,
    payload.output?.imageDataUrl,
  ]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  if (candidates[0]) return candidates[0];

  const base64Payload = [
    payload.result_b64,
    payload.image_base64,
    payload.data?.result_b64,
    payload.data?.image_base64,
    payload.output?.result_b64,
    payload.output?.image_base64,
  ]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean);

  return base64Payload ? `data:image/png;base64,${base64Payload}` : '';
}

/**
 * @param {string} dataUrl
 * @returns {{ mimeType: string, data: string }}
 */
function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Expected base64 data URL.');
  }
  return {
    mimeType: match[1],
    data: match[2],
  };
}

/**
 * @param {string} dataUrl
 * @returns {Promise<Blob>}
 */
async function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Unsupported data URL format.');
  }

  const mimeType = match[1];
  const base64 = match[2];
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  }

  const runtime = /** @type {any} */ (globalThis);
  if (!runtime.Buffer) {
    throw new Error('Base64 decoding is not supported in this runtime.');
  }

  const buffer = runtime.Buffer.from(base64, 'base64');
  return new Blob([buffer], { type: mimeType });
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function blobToDataUrl(blob) {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Failed to convert processed image to data URL.'));
      };
      reader.onerror = () => reject(new Error('Failed to read processed image blob.'));
      reader.readAsDataURL(blob);
    });
  }

  const runtime = /** @type {any} */ (globalThis);
  const buffer = runtime.Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || 'image/png'};base64,${buffer.toString('base64')}`;
}

/**
 * @param {string} mimeType
 * @returns {string}
 */
function guessImageExtension(mimeType) {
  if (/png/i.test(mimeType)) return 'png';
  if (/webp/i.test(mimeType)) return 'webp';
  if (/gif/i.test(mimeType)) return 'gif';
  return 'jpg';
}
