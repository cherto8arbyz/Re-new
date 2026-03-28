import { readConfig } from '../api/backend-config.js';

const DEFAULT_PIPELINE_URL = readConfig('IMAGE_PIPELINE_URL', 'http://127.0.0.1:8000').replace(/\/+$/, '');
const LOOK_FACE_PROVIDER = readConfig('LOOK_FACE_PROVIDER', 'image_pipeline').toLowerCase();
const LOOK_FACE_TIMEOUT_MS = 45000;

/**
 * @typedef {Object} LookFaceGenerationInput
 * @property {string} originalPhotoDataUrl
 * @property {string} croppedFaceDataUrl
 * @property {Record<string, any> | null} [faceMetrics]
 */

/**
 * @typedef {Object} LookFaceGenerationOutput
 * @property {boolean} success
 * @property {string} imageDataUrl
 * @property {string} provider
 * @property {string | null} [error]
 */

/**
 * @typedef {Object} LookFaceGenerationProvider
 * @property {(input: LookFaceGenerationInput) => Promise<LookFaceGenerationOutput>} generate
 */

/**
 * Service wrapper for generating a dedicated look-face asset.
 * Provider-backed with runtime switch point for real image generation/edit vendors.
 */
export class LookFaceGenerationService {
  /**
   * @param {LookFaceGenerationProvider} provider
   */
  constructor(provider) {
    this.provider = provider;
  }

  /**
   * @param {LookFaceGenerationInput} input
   * @returns {Promise<LookFaceGenerationOutput>}
   */
  async generateLookFaceAsset(input) {
    return this.provider.generate(input);
  }
}

/**
 * @returns {LookFaceGenerationService}
 */
export function createLookFaceGenerationService() {
  const provider = createProvider();
  return new LookFaceGenerationService(provider);
}

/**
 * @returns {LookFaceGenerationProvider}
 */
function createProvider() {
  if (LOOK_FACE_PROVIDER === 'image_pipeline') {
    return new ImagePipelineLookFaceProvider(DEFAULT_PIPELINE_URL);
  }

  // Integration point for future providers (for example clipdrop/openai/etc.).
  return new DisabledLookFaceProvider(`LOOK_FACE_PROVIDER "${LOOK_FACE_PROVIDER}" is not supported.`);
}

class ImagePipelineLookFaceProvider {
  /**
   * @param {string} baseUrl
   */
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * @param {LookFaceGenerationInput} input
   * @returns {Promise<LookFaceGenerationOutput>}
   */
  async generate(input) {
    if (!this.baseUrl) {
      return {
        success: false,
        imageDataUrl: '',
        provider: 'image_pipeline',
        error: 'IMAGE_PIPELINE_URL is not configured.',
      };
    }

    let originalBlob = null;
    let faceBlob = null;
    try {
      originalBlob = await dataUrlToBlob(input.originalPhotoDataUrl);
      faceBlob = await dataUrlToBlob(input.croppedFaceDataUrl);
    } catch {
      return {
        success: false,
        imageDataUrl: '',
        provider: 'image_pipeline',
        error: 'Failed to decode look-face input image.',
      };
    }

    const form = new FormData();
    form.append('file', originalBlob, `source.${guessImageExtension(originalBlob.type || 'image/jpeg')}`);
    form.append('face_crop', faceBlob, `face.${guessImageExtension(faceBlob.type || 'image/png')}`);
    form.append('face_metrics_json', JSON.stringify(input.faceMetrics || {}));

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timeoutId = null;
    if (controller) timeoutId = setTimeout(() => controller.abort(), LOOK_FACE_TIMEOUT_MS);

    try {
      const res = await fetch(`${this.baseUrl}/api/image/look-face-generate`, {
        method: 'POST',
        body: form,
        signal: controller?.signal,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          imageDataUrl: '',
          provider: 'image_pipeline',
          error: String(payload?.error || `Look face generation error (${res.status}).`),
        };
      }

      const imageDataUrl = extractImageDataUrl(payload);
      if (!imageDataUrl) {
        return {
          success: false,
          imageDataUrl: '',
          provider: 'image_pipeline',
          error: 'Look face provider returned empty asset.',
        };
      }

      return {
        success: true,
        imageDataUrl,
        provider: 'image_pipeline',
        error: payload?.error ? String(payload.error) : null,
      };
    } catch (err) {
      const message = String((/** @type {Error} */ (err))?.message || 'unknown error');
      const isTimeout =
        typeof DOMException !== 'undefined' &&
        err instanceof DOMException &&
        err.name === 'AbortError';
      return {
        success: false,
        imageDataUrl: '',
        provider: 'image_pipeline',
        error: isTimeout
          ? `Look face generation timed out after ${LOOK_FACE_TIMEOUT_MS} ms.`
          : `Look face generation request failed: ${message}`,
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

class DisabledLookFaceProvider {
  /**
   * @param {string} reason
   */
  constructor(reason) {
    this.reason = reason;
  }

  /**
   * @returns {Promise<LookFaceGenerationOutput>}
   */
  async generate() {
    return {
      success: false,
      imageDataUrl: '',
      provider: 'disabled',
      error: this.reason,
    };
  }
}

/**
 * @param {Record<string, any>} payload
 * @returns {string}
 */
function extractImageDataUrl(payload) {
  const candidates = [
    payload?.look_face_data_url,
    payload?.image_data_url,
    payload?.asset_data_url,
    payload?.result?.look_face_data_url,
    payload?.result?.image_data_url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

/**
 * @param {string} dataUrl
 * @returns {Promise<Blob>}
 */
async function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Expected base64 image data URL.');
  }

  const mimeType = match[1];
  const encoded = match[2];
  const bytes = decodeBase64(encoded);
  const copy = Uint8Array.from(bytes);
  return new Blob([copy.buffer], { type: mimeType });
}

/**
 * @param {string} mimeType
 * @returns {string}
 */
function guessImageExtension(mimeType) {
  const clean = String(mimeType || '').toLowerCase();
  if (clean.includes('png')) return 'png';
  if (clean.includes('webp')) return 'webp';
  if (clean.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * @param {string} encoded
 * @returns {Uint8Array}
 */
function decodeBase64(encoded) {
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
  }

  const runtime = /** @type {any} */ (globalThis);
  if (runtime?.Buffer) {
    const buffer = runtime.Buffer.from(encoded, 'base64');
    return new Uint8Array(buffer);
  }
  throw new Error('Base64 decoding is not supported in this runtime.');
}
