import { readConfig } from '../api/backend-config.js';

/** @type {Promise<{ GoogleGenAI: any }> | null} */
let sdkLoader = null;

/**
 * @returns {Promise<{ GoogleGenAI: any }>}
 */
async function loadGeminiSdk() {
  if (!sdkLoader) {
    sdkLoader = import('@google/genai')
      .catch(async () => {
        const dynamicImport = /** @type {(src: string) => Promise<any>} */ ((0, eval)('(src) => import(src)'));
        return dynamicImport('https://esm.sh/@google/genai@1');
      });
  }
  return sdkLoader;
}

export class DailyLookPhotoService {
  constructor() {
    this.enabled = readConfig('DAILY_LOOK_PHOTO_ENABLED', 'true') === 'true';
    this.lookParamsModel = readConfig('LOOK_PARAMS_MODEL', 'gemini-2.5-flash');
    this.lookParamsApiKey = readConfig('LOOK_PARAMS_API_KEY') || readConfig('GEMINI_API_KEY');
    this.nanoBananaEndpoint = readConfig('NANO_BANANA_ENDPOINT', '');
    this.nanoBananaApiKey = readConfig('NANO_BANANA_API_KEY') || readConfig('GEMINI_API_KEY');
    this.nanoBananaModel = readConfig('NANO_BANANA_MODEL', 'gemini-3-pro-image-preview');
    this.defaultFaceReferenceUrl = readConfig('DEFAULT_FACE_REFERENCE_URL');
  }

  /**
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.nanoBananaApiKey);
  }

  /**
   * Mandatory two-stage render flow:
   * 1) another model defines parameters
   * 2) nano-banana generates photorealistic final image
   *
   * @param {{
   *  date: string,
   *  city: string,
   *  weatherSummary: string,
   *  styleName: string,
   *  garments: import('../models/garment.js').Garment[],
   *  faceReferenceUrl?: string,
   *  trendSignals?: Array<{ tag: string, score: number }>
   * }} input
   * @returns {Promise<{ success: true, photoUrl: string, renderParameters: Record<string, any>, usedFaceReference: string } | { success: false, error: string }>}
   */
  async generateDailyLookPhoto(input) {
    if (!this.enabled) {
      return { success: false, error: 'Daily look photo generation is disabled.' };
    }
    if (!this.isConfigured()) {
      return { success: false, error: 'Nano Banana provider key is not configured.' };
    }
    if (!this.lookParamsApiKey) {
      return { success: false, error: 'LOOK_PARAMS_API_KEY or GEMINI_API_KEY is required for parameter planning.' };
    }

    const faceReference = input.faceReferenceUrl || this.defaultFaceReferenceUrl || buildFallbackFaceReference();
    const planning = await this._resolveRenderParameters(input);
    if (!planning.success) {
      return { success: false, error: planning.error };
    }
    const renderParameters = planning.renderParameters;
    const prompt = this._buildPrompt(input, renderParameters);
    const negativePrompt = String(renderParameters.negative_prompt || [
      'cartoon',
      'illustration',
      'cgi',
      'anime',
      'deformed hands',
      'deformed face',
      'low quality',
      'blurry',
      'overprocessed skin',
      'bad anatomy',
    ].join(', '));
    const fullPrompt = `${prompt}\nAvoid visual defects and styles: ${negativePrompt}`;
    const contents = await buildGeminiImageContents(fullPrompt, faceReference);

    const requestedModel = this.nanoBananaModel || 'gemini-3-pro-image-preview';
    const fallbackModels = ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'];
    const modelCandidates = Array.from(new Set([requestedModel, ...fallbackModels]));

    /** @type {string[]} */
    const errors = [];
    setLastNanoBananaCall({
      timestamp: Date.now(),
      status: 'started',
      requestedModel,
      city: input.city,
      styleName: input.styleName,
      garmentCount: input.garments.length,
    });

    for (const model of modelCandidates) {
      const endpoint = resolveGeminiEndpoint(this.nanoBananaEndpoint, model);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.nanoBananaApiKey || '',
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: {
                aspectRatio: '2:3',
              },
              temperature: 0.2,
            },
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          errors.push(`${model} (${res.status}): ${text}`);
          continue;
        }

        const data = await res.json();
        const photoUrl = extractImageUrl(data);
        if (!photoUrl) {
          errors.push(`${model}: empty image in response`);
          continue;
        }

        setLastNanoBananaCall({
          timestamp: Date.now(),
          status: 'success',
          requestedModel,
          usedModel: model,
          endpoint,
        });

        return {
          success: true,
          photoUrl,
          renderParameters: {
            ...renderParameters,
            renderer_model: model,
            renderer_endpoint: endpoint,
          },
          usedFaceReference: faceReference,
        };
      } catch (err) {
        errors.push(`${model}: ${/** @type {Error} */ (err).message}`);
      }
    }

    setLastNanoBananaCall({
      timestamp: Date.now(),
      status: 'failed',
      requestedModel,
      errors,
    });

    return {
      success: false,
      error: `Nano Banana request failed for all models. ${errors.join(' | ')}`.slice(0, 1400),
    };
  }

  /**
   * @param {{
   *  date: string,
   *  city: string,
   *  weatherSummary: string,
   *  styleName: string,
   *  garments: import('../models/garment.js').Garment[],
   *  trendSignals?: Array<{ tag: string, score: number }>
   * }} input
   * @returns {Promise<Record<string, any>>}
   */
  async _resolveRenderParameters(input) {
    try {
      const sdk = await loadGeminiSdk();
      const client = new sdk.GoogleGenAI({ apiKey: this.lookParamsApiKey });
      const trendText = Array.isArray(input.trendSignals) && input.trendSignals.length > 0
        ? input.trendSignals.map(t => `${t.tag}:${t.score}`).join(', ')
        : 'none';

      const response = await client.models.generateContent({
        model: this.lookParamsModel,
        contents: [{
          role: 'user',
          parts: [{ text: [
            'You are a visual director for high-end fashion editorials.',
            'Determine exact rendering parameters before image generation.',
            'Return STRICT JSON only.',
            'Schema:',
            '{"camera_angle":"string","lens":"string","lighting":"string","background":"string","pose":"string","composition":"string","color_grading":"string","skin_retouching":"string","negative_prompt":"string"}',
            `Date: ${input.date}`,
            `City: ${input.city}`,
            `Weather: ${input.weatherSummary}`,
            `Style name: ${input.styleName}`,
            `Trend signals: ${trendText}`,
            `Garments: ${input.garments.map(g => `${g.name} (${g.category}, ${g.color || 'no-color'})`).join('; ')}`,
            'Output must optimize for professional fashion photograph realism.',
          ].join('\n') }],
        }],
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      });

      const text = extractText(response);
      const parsed = parseJsonObject(text);
      if (!parsed) {
        return {
          success: false,
          error: `Planner model returned invalid JSON: "${text.slice(0, 180)}"`,
        };
      }

      return {
        success: true,
        renderParameters: {
          camera_angle: String(parsed.camera_angle || ''),
          lens: String(parsed.lens || ''),
          lighting: String(parsed.lighting || ''),
          background: String(parsed.background || ''),
          pose: String(parsed.pose || ''),
          composition: String(parsed.composition || ''),
          color_grading: String(parsed.color_grading || ''),
          skin_retouching: String(parsed.skin_retouching || ''),
          negative_prompt: String(parsed.negative_prompt || ''),
          source: `planner:${this.lookParamsModel}`,
        },
      };
    } catch {
      return {
        success: false,
        error: 'Planner model request failed. Render aborted before nano-banana call.',
      };
    }
  }

  /**
   * @param {{
   *  date: string,
   *  city: string,
   *  weatherSummary: string,
   *  styleName: string,
   *  garments: import('../models/garment.js').Garment[],
   * }} input
   * @param {Record<string, any>} params
   * @returns {string}
   */
  _buildPrompt(input, params) {
    const garmentText = input.garments
      .map(garment => `${garment.name} (${garment.category}${garment.color ? `, ${garment.color}` : ''})`)
      .join('; ');

    return [
      'Generate a PROFESSIONAL FASHION PHOTOGRAPH.',
      'Photorealistic output only.',
      `Look date: ${input.date}`,
      `City/weather context: ${input.city}; ${input.weatherSummary}`,
      `Outfit style: ${input.styleName}`,
      `Wardrobe items selected for this day: ${garmentText}`,
      `Camera angle: ${params.camera_angle}`,
      `Lens: ${params.lens}`,
      `Lighting: ${params.lighting}`,
      `Background: ${params.background}`,
      `Pose: ${params.pose}`,
      `Composition: ${params.composition}`,
      `Color grading: ${params.color_grading}`,
      `Skin retouching: ${params.skin_retouching}`,
      'Face identity must follow the provided face reference exactly.',
      'Image quality target: premium editorial campaign photo, ultra realistic textures.',
    ].join('\n');
  }
}

/**
 * @returns {string}
 */
function buildFallbackFaceReference() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#eceff3"/>
    <ellipse cx="256" cy="188" rx="92" ry="108" fill="#d2b49c"/>
    <path d="M170 334c22-42 58-64 86-64s64 22 86 64v106H170z" fill="#c8ccd2"/>
    <circle cx="220" cy="176" r="8" fill="#1f1f1f"/>
    <circle cx="292" cy="176" r="8" fill="#1f1f1f"/>
    <path d="M224 224c22 18 42 18 64 0" fill="none" stroke="#6b4f3f" stroke-width="8" stroke-linecap="round"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * @param {string} configuredEndpoint
 * @param {string} model
 * @returns {string}
 */
function resolveGeminiEndpoint(configuredEndpoint, model) {
  const trimmed = (configuredEndpoint || '').trim();
  if (!trimmed) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  }
  if (trimmed.includes('{MODEL}')) {
    return trimmed.replace('{MODEL}', encodeURIComponent(model));
  }
  return trimmed;
}

/**
 * @param {string} prompt
 * @param {string} faceReference
 * @returns {Promise<Array<{ role: 'user', parts: Array<Record<string, any>> }>>}
 */
async function buildGeminiImageContents(prompt, faceReference) {
  /** @type {Array<Record<string, any>>} */
  const parts = [{ text: prompt }];
  const faceInline = await toInlineImagePart(faceReference);
  if (faceInline) {
    parts.push({
      text: 'Reference identity photo is attached. Keep face identity, skin tone, and proportions consistent.',
    });
    parts.push({
      inlineData: faceInline,
    });
  }

  return [{
    role: 'user',
    parts,
  }];
}

/**
 * @param {string} source
 * @returns {Promise<{ mimeType: string, data: string } | null>}
 */
async function toInlineImagePart(source) {
  if (!source) return null;

  const dataUrlPart = parseImageDataUrl(source);
  if (dataUrlPart) {
    return dataUrlPart;
  }

  try {
    const res = await fetch(source);
    if (!res.ok) return null;
    const blob = await res.blob();
    const base64 = await blobToBase64(blob);
    if (!base64) return null;
    return {
      mimeType: blob.type || 'image/jpeg',
      data: base64,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} dataUrl
 * @returns {{ mimeType: string, data: string } | null}
 */
function parseImageDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function blobToBase64(blob) {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || '');
        const parsed = parseImageDataUrl(value);
        resolve(parsed?.data || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  if (typeof Response !== 'undefined') {
    const arrBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa === 'function') {
      return btoa(binary);
    }
  }

  return '';
}

/**
 * @param {any} data
 * @returns {string}
 */
function extractText(data) {
  if (typeof data?.text === 'string') return data.text;
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((/** @type {any} */ part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {string} text
 * @returns {Record<string, any> | null}
 */
function parseJsonObject(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {any} data
 * @returns {string}
 */
function extractImageUrl(data) {
  if (typeof data === 'string' && data.trim()) return data.trim();

  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      const b64 = inlineData?.data;
      const mime = inlineData?.mimeType || inlineData?.mime_type || 'image/png';
      if (typeof b64 === 'string' && b64.length > 0) {
        return `data:${mime};base64,${b64}`;
      }
      const uri = part?.fileData?.fileUri || part?.file_data?.file_uri || part?.url;
      if (typeof uri === 'string' && uri.trim()) {
        return uri.trim();
      }
    }
  }

  const candidates = [
    data?.image_url,
    data?.imageUrl,
    data?.url,
    data?.result?.image_url,
    data?.result?.imageUrl,
    data?.result?.url,
    data?.data?.[0]?.url,
    data?.data?.[0]?.image_url,
    data?.images?.[0]?.url,
    data?.output?.[0]?.url,
    typeof data?.output?.[0] === 'string' ? data.output[0] : '',
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const b64 = data?.b64_json || data?.data?.[0]?.b64_json || data?.images?.[0]?.b64_json;
  if (typeof b64 === 'string' && b64.length > 0) {
    return `data:image/png;base64,${b64}`;
  }

  return '';
}

/**
 * Keeps an inspectable runtime trace for debugging Nano Banana calls.
 * Accessible in browser console as window.__renewNanoBananaLastCall.
 *
 * @param {Record<string, any>} payload
 */
function setLastNanoBananaCall(payload) {
  if (typeof window === 'undefined') return;
  const runtime = /** @type {any} */ (window);
  runtime.__renewNanoBananaLastCall = {
    ...(runtime.__renewNanoBananaLastCall || {}),
    ...payload,
  };
}
