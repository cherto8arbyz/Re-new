import { readConfig } from '../api/backend-config.js';
import { generateGeminiContent } from '../api/gemini-client.js';
import { SupabaseApi } from '../api/supabase-api.js';
import { iconForCategory } from '../models/domain-models.js';
import { requestBackgroundRemoval } from './background-removal-service.js';
import { createLookFaceGenerationService } from './look-face-generation-service.js';
import { resolveBackendBaseUrl } from '../shared/backend-base-url.js';

/**
 * @typedef {Object} AvatarResult
 * @property {boolean} success
 * @property {string} avatarUrl
 * @property {string} [error]
 */

/**
 * @typedef {Object} FaceValidationResult
 * @property {boolean} success
 * @property {boolean} faceDetected
 * @property {'face-detector' | 'gemini-vision' | 'fallback'} source
 * @property {string} [error]
 * @property {{ faceCount: number, faceAreaRatio: number, blurScore: number, occlusionScore: number, imageWidth: number, imageHeight: number }} [metrics]
 * @property {string} [croppedFaceUrl]
 * @property {string} [avatarUrl]
 * @property {number} [qualityScore]
 * @property {string[]} [warnings]
 */

/**
 * @typedef {Object} UserFaceAssetResult
 * @property {boolean} success
 * @property {string} [error]
 * @property {string} [profileAvatarUrl]
 * @property {string} [lookFaceAssetUrl]
 * @property {import('../models/domain-models.js').FaceAsset | null} [faceAsset]
 * @property {string[]} [warnings]
 */

/**
 * @typedef {Object} GarmentAnalysisOptions
 * @property {string} [userId]
 * @property {string} [accessToken]
 * @property {boolean} [persist]
 * @property {string} [sourceFileName]
 * @property {'single_item' | 'person_outfit'} [inputTypeHint]
 */

/**
 * @typedef {Object} GarmentAnalysisResult
 * @property {boolean} success
 * @property {{
 *  name: string,
 *  category: import('../models/garment.js').GarmentCategory,
 *  color: string,
 *  imageUrl: string,
 *  position: import('../models/garment.js').GarmentPosition,
 *  originalUrl?: string,
 *  cutoutUrl?: string,
 *  maskUrl?: string,
 *  metadata?: Record<string, any>
 * }} garment
 * @property {string} [error]
 */

/**
 * @typedef {'single_item' | 'person_outfit' | 'unsupported' | 'uncertain'} UploadInputType
 */

/**
 * @typedef {Object} UploadClassification
 * @property {UploadInputType} inputType
 * @property {number} confidence
 * @property {string} reason
 * @property {Record<string, any>} [metrics]
 */

/**
 * @typedef {'accept' | 'reject' | 'review'} WardrobeValidationAcceptance
 */

/**
 * @typedef {Object} GeminiWardrobeValidation
 * @property {boolean} isValidWearable
 * @property {UploadInputType} inputType
 * @property {WardrobeValidationAcceptance} acceptance
 * @property {import('../models/garment.js').GarmentCategory | 'unknown'} category
 * @property {string} subcategory
 * @property {string} color
 * @property {string[]} colors
 * @property {string} title
 * @property {number} confidence
 * @property {'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks' | 'unknown'} [closetStorageMode]
 * @property {string | null} rejectionReason
 */

/**
 * @typedef {Object} GeminiWardrobeValidationResult
 * @property {boolean} available
 * @property {boolean} success
 * @property {GeminiWardrobeValidation | null} analysis
 * @property {'unavailable' | 'api_failure' | 'invalid_json' | 'invalid_payload' | null} failureKind
 * @property {string | null} failureReason
 */

/**
 * @typedef {Object} ExtractedWardrobeItem
 * @property {string} title
 * @property {import('../models/garment.js').GarmentCategory} category
 * @property {string} subcategory
 * @property {string[]} colors
 * @property {string[]} styleTags
 * @property {string[]} seasonTags
 * @property {string[]} occasionTags
 * @property {string} thumbnailUrl
 * @property {string} iconName
 * @property {'single_item' | 'person_outfit'} sourceType
 * @property {boolean} backgroundRemoved
 * @property {number} extractionConfidence
 * @property {number} confidence
 * @property {boolean} requiresReview
 * @property {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} [bodySlot]
 * @property {number} [positionOffsetX]
 * @property {number} [positionOffsetY]
 * @property {string} [processedImageUrl]
 * @property {boolean} [rawImageFallback]
 * @property {Record<string, any>} metadata
 */

/**
 * @typedef {Object} WardrobeExtractionResult
 * @property {boolean} success
 * @property {'success' | 'partial' | 'failed' | 'unsupported' | 'uncertain'} status
 * @property {UploadInputType} inputType
 * @property {ExtractedWardrobeItem[]} autoApproved
 * @property {ExtractedWardrobeItem[]} requiresReview
 * @property {UploadClassification} classification
 * @property {string[]} logs
 * @property {string | null} error
 */

const supabaseApi = new SupabaseApi();
const CATEGORY_DEFAULTS = {
  shirt: { category: 'shirt', position: { x: 15, y: 8, width: 45, height: 28 } },
  sweater: { category: 'sweater', position: { x: 13, y: 6, width: 50, height: 30 } },
  outerwear: { category: 'outerwear', position: { x: 10, y: 4, width: 56, height: 50 } },
  dress: { category: 'dress', position: { x: 14, y: 10, width: 50, height: 56 } },
  pants: { category: 'pants', position: { x: 18, y: 38, width: 38, height: 38 } },
  socks: { category: 'socks', position: { x: 28, y: 72, width: 28, height: 16 } },
  shoes: { category: 'shoes', position: { x: 20, y: 78, width: 35, height: 14 } },
  accessory: { category: 'accessory', position: { x: 30, y: 5, width: 16, height: 10 } },
  base: { category: 'base', position: { x: 17, y: 9, width: 42, height: 25 } },
};

const SUPPORTED_CATEGORIES = new Set(['base', 'shirt', 'sweater', 'outerwear', 'dress', 'accessory', 'pants', 'socks', 'shoes']);
const AUTO_APPROVE_CONFIDENCE = 0.72;
const MIN_CONFIDENCE_TO_KEEP = 0.45;
const IMAGE_PIPELINE_TIMEOUT_MS = 30000;
const lookFaceGenerationService = createLookFaceGenerationService();
const INVALID_FASHION_KEYWORDS = /\b(selfie|portrait|face only|face closeup|full person|person|interior|living room|bedroom|kitchen|room|pet|dog|cat|food|meal|landscape|mountain|beach|sunset|screenshot|screen grab|keyboard|monitor|mug|bottle)\b/i;
const TOP_KEYWORDS = /\b(top|t[\s-]?shirt|tee|shirt|blouse|tank|cami)\b/i;
const KNIT_KEYWORDS = /\b(hoodie|sweatshirt|sweater|cardigan|knitwear|jumper|pullover)\b/i;
const OUTERWEAR_KEYWORDS = /\b(jacket|coat|blazer|trench|puffer|parka|outerwear)\b/i;
const DRESS_KEYWORDS = /\b(dress|gown|slip dress|jumpsuit|romper)\b/i;
const BOTTOM_KEYWORDS = /\b(jeans|trousers?|pants|shorts?|skirt|leggings|cargo|chino)\b/i;
const SOCK_KEYWORDS = /\b(socks?|ankle socks?|crew socks?|stockings?|hosiery)\b/i;
const SHOES_KEYWORDS = /\b(sneakers?|shoes?|boots?|heels?|sandals?|loafers?|flats?|slippers?)\b/i;
const ACCESSORY_KEYWORDS = /\b(hat|cap|beanie|beret|bucket hat|trucker cap|bag|handbag|shoulder bag|crossbody|backpack|mini bag|tote|purse|scarf|belt|jewelry|jewellery|necklace|bracelet|ring|earrings?|headphones?|headset|earbuds?|airpods?|sunglasses|eyewear|gloves?)\b/i;
const BASE_KEYWORDS = /\b(base layer|undershirt|tank|cami)\b/i;
const HEADWEAR_STORAGE_KEYWORDS = /\b(trucker cap|baseball cap|bucket hat|cap|hat|beanie|beret|visor|headband)\b/i;
const CLOSET_STORAGE_MODE_SET = new Set(['hanger', 'folded', 'drawer', 'shoe-shelf', 'headwear-rail', 'accessory-hooks']);
/** @type {Record<string, import('../models/garment.js').GarmentCategory>} */
const CATEGORY_ALIAS_MAP = {
  accessory: 'accessory',
  accessories: 'accessory',
  bag: 'accessory',
  handbag: 'accessory',
  backpack: 'accessory',
  cap: 'accessory',
  hat: 'accessory',
  beanie: 'accessory',
  scarf: 'accessory',
  belt: 'accessory',
  jewelry: 'accessory',
  jewellery: 'accessory',
  eyewear: 'accessory',
  sunglasses: 'accessory',
  gloves: 'accessory',
  base: 'base',
  blouse: 'shirt',
  shirt: 'shirt',
  tee: 'shirt',
  tshirt: 'shirt',
  't-shirt': 'shirt',
  top: 'shirt',
  hoodie: 'sweater',
  sweatshirt: 'sweater',
  sweater: 'sweater',
  cardigan: 'sweater',
  knitwear: 'sweater',
  outerwear: 'outerwear',
  jacket: 'outerwear',
  coat: 'outerwear',
  blazer: 'outerwear',
  dress: 'dress',
  gown: 'dress',
  jumpsuit: 'dress',
  romper: 'dress',
  bottom: 'pants',
  pants: 'pants',
  jeans: 'pants',
  trousers: 'pants',
  skirt: 'pants',
  shorts: 'pants',
  leggings: 'pants',
  shoes: 'shoes',
  sneakers: 'shoes',
  sock: 'socks',
  socks: 'socks',
  boots: 'shoes',
  heels: 'shoes',
  sandals: 'shoes',
  loafers: 'shoes',
  flats: 'shoes',
  slippers: 'shoes',
};

/**
 * Generates a base avatar silhouette from the registration photo.
 * @param {string | null} photoDataUrl
 * @returns {Promise<AvatarResult>}
 */
export async function generateAvatar(photoDataUrl) {
  await delay(220);

  if (!photoDataUrl || photoDataUrl.length === 0) {
    return { success: false, avatarUrl: '', error: 'No photo provided.' };
  }

  const avatarUrl = await createPortraitAvatar(photoDataUrl);
  return { success: true, avatarUrl: avatarUrl || photoDataUrl };
}

/**
 * Extracts and validates a face asset from onboarding photo.
 * Performs face existence, size, blur, and occlusion checks.
 *
 * @param {string | null} photoDataUrl
 * @returns {Promise<FaceValidationResult>}
 */
export async function extractFaceAsset(photoDataUrl) {
  if (!photoDataUrl || photoDataUrl.length === 0) {
    return {
      success: false,
      faceDetected: false,
      source: 'fallback',
      error: 'Face photo is required.',
    };
  }

  const image = await safeLoadImage(photoDataUrl);
  if (!image) {
    return {
      success: false,
      faceDetected: false,
      source: 'fallback',
      error: 'Failed to decode image. Please upload another photo.',
    };
  }

  const mediaPipe = await detectFaceWithMediaPipeApi(photoDataUrl);
  if (!mediaPipe.success) {
    logPipeline('warn', 'face_detection_failed', { reason: mediaPipe.error });
    return {
      success: false,
      faceDetected: false,
      source: 'fallback',
      error: mediaPipe.error || 'Face not detected clearly. Please upload a better photo.',
    };
  }

  const metrics = {
    faceCount: Number(mediaPipe.metrics?.faceCount ?? (mediaPipe.faceDetected ? 1 : 0)),
    faceAreaRatio: Number(mediaPipe.metrics?.faceAreaRatio ?? 0),
    blurScore: Number(mediaPipe.metrics?.blurScore ?? computeBlurScore(image)),
    occlusionScore: Number(mediaPipe.metrics?.occlusionScore ?? 0),
    imageWidth: Number(mediaPipe.metrics?.imageWidth ?? image.naturalWidth ?? image.width ?? 0),
    imageHeight: Number(mediaPipe.metrics?.imageHeight ?? image.naturalHeight ?? image.height ?? 0),
  };
  const warningFlags = Array.isArray(mediaPipe.warnings)
    ? mediaPipe.warnings.map(flag => String(flag)).filter(Boolean)
    : [];

  if (warningFlags.length > 0) {
    logPipeline('warn', 'face_detection_warning', {
      warnings: warningFlags,
      blurScore: metrics.blurScore,
    });
  }

  if (!mediaPipe.faceDetected || !mediaPipe.valid) {
    logPipeline('warn', 'face_validation_invalid', {
      faceDetected: mediaPipe.faceDetected,
      metrics,
      reason: mediaPipe.error,
    });

    return {
      success: false,
      faceDetected: Boolean(mediaPipe.faceDetected),
      source: 'face-detector',
      metrics,
      warnings: warningFlags,
      error: mediaPipe.error || 'Face not detected clearly. Please upload a better photo.',
    };
  }

  const avatarUrl = await createPortraitAvatar(photoDataUrl);
  const croppedFaceUrl = mediaPipe.croppedFaceUrl || (
    mediaPipe.boundingBox
      ? cropFaceFromImage(image, mediaPipe.boundingBox)
      : ''
  );
  const confidence = clamp01(Number(mediaPipe.confidence ?? 0.75));
  const blurComponent = clamp01(metrics.blurScore / 180);
  const qualityScore = clamp01(confidence * 0.65 + blurComponent * 0.35);

  logPipeline('info', 'face_detection_success', {
    confidence,
    faceAreaRatio: metrics.faceAreaRatio,
    blurScore: metrics.blurScore,
  });

  return {
    success: true,
    faceDetected: true,
    source: 'face-detector',
    metrics,
    croppedFaceUrl,
    avatarUrl,
    qualityScore,
    warnings: warningFlags,
  };
}

/**
 * Validates that the uploaded registration image contains a visible face.
 * Uses FaceDetector when available, and degrades gracefully on unsupported runtimes.
 *
 * @param {string | null} photoDataUrl
 * @returns {Promise<FaceValidationResult>}
 */
export async function validateFacePhoto(photoDataUrl) {
  const result = await extractFaceAsset(photoDataUrl);
  return result;
}

/**
 * Builds profile avatar + dedicated look face asset from one uploaded photo.
 * Flow:
 * 1) MediaPipe detect + crop
 * 2) LookFaceGenerationService provider call (real integration point)
 * 3) AI-normalized fallback composition (no raw crop as final asset)
 *
 * @param {string | null} photoDataUrl
 * @returns {Promise<UserFaceAssetResult>}
 */
export async function prepareUserFaceAssets(photoDataUrl) {
  if (!photoDataUrl || photoDataUrl.length === 0) {
    return { success: false, error: 'Face photo is required.' };
  }

  const face = await extractFaceAsset(photoDataUrl);
  if (!face.success || !face.faceDetected || !face.croppedFaceUrl) {
    return {
      success: false,
      error: face.error || 'Face not detected clearly. Please upload a better photo.',
      warnings: face.warnings || [],
    };
  }

  const generated = await lookFaceGenerationService.generateLookFaceAsset({
    originalPhotoDataUrl: photoDataUrl,
    croppedFaceDataUrl: face.croppedFaceUrl,
    faceMetrics: face.metrics || null,
  });

  let lookFaceSource = '';
  if (generated.success && generated.imageDataUrl) {
    lookFaceSource = generated.imageDataUrl;
    logPipeline('info', 'look_face_generation_provider_success', {
      provider: generated.provider,
    });
  } else {
    logPipeline('warn', 'look_face_generation_provider_failed', {
      provider: generated.provider || 'unknown',
      reason: generated.error || null,
    });

    // Keep existing face detection flow and use a normalized composition fallback.
    const bgRemoval = await removeBackgroundWithApi(face.croppedFaceUrl);
    if (bgRemoval.success && bgRemoval.backgroundRemoved && bgRemoval.imageDataUrl) {
      lookFaceSource = bgRemoval.imageDataUrl;
      logPipeline('info', 'look_face_background_removal_success', {
        provider: bgRemoval.provider,
      });
    } else {
      lookFaceSource = face.croppedFaceUrl;
      logPipeline('warn', 'look_face_background_removal_failed', {
        provider: bgRemoval.provider || 'none',
        reason: bgRemoval.error || null,
      });
    }
  }

  const lookFaceAssetUrl = await normalizeLookFaceAsset(lookFaceSource, photoDataUrl);
  if (!lookFaceAssetUrl) {
    return {
      success: false,
      error: 'Could not generate look-face asset. Please upload a clearer front-facing photo.',
      warnings: face.warnings || [],
    };
  }

  const profileAvatarUrl = photoDataUrl;
  return {
    success: true,
    profileAvatarUrl,
    lookFaceAssetUrl,
    warnings: face.warnings || [],
    faceAsset: {
      id: `face-${Date.now()}`,
      originalUrl: photoDataUrl,
      avatarUrl: profileAvatarUrl,
      croppedFaceUrl: face.croppedFaceUrl,
      qualityScore: Number(face.qualityScore || 0.75),
      metrics: face.metrics || {
        faceCount: 1,
        faceAreaRatio: 0.15,
        blurScore: 80,
        occlusionScore: 0.2,
        imageWidth: 0,
        imageHeight: 0,
      },
      reviewState: 'approved',
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Full wardrobe CV pipeline:
 * upload original -> segment/cutout -> classify -> upload cutout/mask.
 *
 * @param {string | null} photoDataUrl
 * @param {GarmentAnalysisOptions} [options]
 * @returns {Promise<GarmentAnalysisResult>}
 */
export async function analyzeGarment(photoDataUrl, options = {}) {
  const extraction = await extractWardrobeFromUpload(photoDataUrl, options);
  if (!extraction.success) {
    return {
      success: false,
      garment: /** @type {any} */ (null),
      error: extraction.error || 'Extraction failed.',
    };
  }

  const best = extraction.autoApproved[0] || extraction.requiresReview[0];
  if (!best) {
    return {
      success: false,
      garment: /** @type {any} */ (null),
      error: 'No garments detected from upload.',
    };
  }

  const defaults = CATEGORY_DEFAULTS[best.category] || CATEGORY_DEFAULTS.shirt;
  return {
    success: true,
    garment: {
      name: best.title,
      category: best.category,
      color: best.colors[0] || '#808080',
      imageUrl: best.processedImageUrl || best.thumbnailUrl,
      position: { ...defaults.position },
      originalUrl: String(best.metadata?.originalUrl || ''),
      cutoutUrl: String(best.metadata?.cutoutUrl || ''),
      maskUrl: String(best.metadata?.maskUrl || ''),
      metadata: {
        ...best.metadata,
        backgroundRemoved: Boolean(best.backgroundRemoved),
        processedImageUrl: best.processedImageUrl || best.metadata?.cutoutUrl || '',
        rawImageFallback: Boolean(best.rawImageFallback || best.metadata?.rawImageFallback),
        bodySlot: best.bodySlot || '',
        positionOffsetX: Number(best.positionOffsetX || 0),
        positionOffsetY: Number(best.positionOffsetY || 0),
        extractionConfidence: best.extractionConfidence,
        confidence: best.confidence,
        requiresReview: best.requiresReview,
      },
    },
  };
}

/**
 * Robust ingestion pipeline for wardrobe uploads.
 * Supports single item photos and full person outfit photos.
 *
 * @param {string | null} photoDataUrl
 * @param {GarmentAnalysisOptions} [options]
 * @returns {Promise<WardrobeExtractionResult>}
 */
export async function extractWardrobeFromUpload(photoDataUrl, options = {}) {
  /** @type {string[]} */
  const logs = [];
  if (!photoDataUrl || photoDataUrl.length === 0) {
    return {
      success: false,
      status: 'failed',
      inputType: 'unsupported',
      autoApproved: [],
      requiresReview: [],
      classification: {
        inputType: 'unsupported',
        confidence: 0,
        reason: 'No image provided.',
      },
      logs,
      error: 'No image provided.',
    };
  }

  logs.push('upload_received');
  const geminiValidation = await validateWardrobeUploadWithGemini(photoDataUrl, options.sourceFileName || '');
  /** @type {UploadClassification} */
  let classification;
  /** @type {{
   *  success: boolean,
   *  title: string,
   *  category: import('../models/garment.js').GarmentCategory,
   *  color: string,
   *  colors: string[],
   *  subcategory: string,
   *  styleTags: string[],
   *  seasonTags: string[],
   *  occasionTags: string[],
   *  confidence: number,
   *  closetStorageMode: 'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks',
   *  source: 'gemini-vision',
   *  error?: string
   * } | null} */
  let seededClassification = null;
  let forceHeuristicClassifier = false;
  let geminiFailureMessage = '';

  if (geminiValidation.success && geminiValidation.analysis) {
    classification = buildUploadClassificationFromGeminiValidation(geminiValidation.analysis);
    logs.push(`gemini_wardrobe_validation:${classification.inputType}:${classification.confidence.toFixed(2)}`);
    logs.push(`classified:${classification.inputType}:${classification.confidence.toFixed(2)}`);

    if (!geminiValidation.analysis.isValidWearable) {
      return {
        success: false,
        status: 'unsupported',
        inputType: geminiValidation.analysis.inputType,
        autoApproved: [],
        requiresReview: [],
        classification,
        logs,
        error: geminiValidation.analysis.rejectionReason || classification.reason || 'Unsupported upload type.',
      };
    }

    if (geminiValidation.analysis.inputType === 'person_outfit' && options.inputTypeHint !== 'person_outfit') {
      return {
        success: false,
        status: 'unsupported',
        inputType: geminiValidation.analysis.inputType,
        autoApproved: [],
        requiresReview: [],
        classification,
        logs,
        error: geminiValidation.analysis.rejectionReason || 'Upload a single clothing item instead of a full-person outfit photo.',
      };
    }

    seededClassification = buildSeededGarmentClassification(geminiValidation.analysis);
  } else {
    if (geminiValidation.available) {
      geminiFailureMessage = buildGeminiValidationFailureMessage(geminiValidation);
      logs.push(`gemini_wardrobe_validation_failed:${geminiValidation.failureKind || 'unknown'}`);
      forceHeuristicClassifier = true;
    }

    const rawClassification = await classifyUploadInput(photoDataUrl, options, {
      skipGemini: geminiValidation.available,
    });
    logs.push(`classified:${rawClassification.inputType}:${rawClassification.confidence.toFixed(2)}`);

    classification = rawClassification.inputType === 'person_outfit'
      ? {
          ...rawClassification,
          inputType: /** @type {'single_item'} */ ('single_item'),
          reason: 'Person outfit photo detected. Continuing through wearable item extraction.',
          metrics: {
            ...(rawClassification.metrics || {}),
            processingState: 'person_outfit_routed_to_wearable_pipeline',
          },
        }
      : rawClassification;

    if (classification.inputType === 'unsupported') {
      return {
        success: false,
        status: 'unsupported',
        inputType: classification.inputType,
        autoApproved: [],
        requiresReview: [],
        classification,
        logs,
        error: geminiFailureMessage || classification.reason || 'Unsupported upload type.',
      };
    }
  }

  const userId = options.userId || 'anonymous';
  const shouldPersist = options.persist === true;
  const objectBase = `${userId}/${Date.now()}-${simpleHash(photoDataUrl).toString(16)}`;
  let originalUpload = null;
  if (shouldPersist) {
    try {
      const originalBlob = await dataUrlToBlob(photoDataUrl);
      originalUpload = await supabaseApi.uploadStorageObject(
        readConfig('SUPABASE_BUCKET_ORIGINALS', 'wardrobe-originals'),
        `${objectBase}/original.${guessImageExtension(originalBlob.type)}`,
        originalBlob,
        { accessToken: options.accessToken, contentType: originalBlob.type || 'image/jpeg' },
      );
    } catch {
      logs.push('original_upload_failed');
    }
  }

  /** @type {ExtractedWardrobeItem[]} */
  let extracted = [];
  if (classification.inputType === 'uncertain') {
    logs.push('uncertain_upload_continues_to_item_classifier');
  }

  logs.push('single_item_pipeline_start');
  extracted = await processSingleItemUpload(photoDataUrl, options, {
    originalUrl: originalUpload?.url || '',
    objectBase,
    persist: shouldPersist,
    accessToken: options.accessToken,
  }, {
    seededClassification,
    forceHeuristicClassifier,
  });
  logs.push(`single_item_pipeline_result:${extracted.length}`);

  if (extracted.length === 0) {
    return {
      success: false,
      status: 'failed',
      inputType: classification.inputType,
      autoApproved: [],
      requiresReview: [],
      classification,
      logs,
      error: geminiFailureMessage || 'No garments were extracted with sufficient confidence.',
    };
  }

  const autoApproved = extracted.filter(item => item.confidence >= AUTO_APPROVE_CONFIDENCE);
  const requiresReview = extracted
    .filter(item => item.confidence >= MIN_CONFIDENCE_TO_KEEP && item.confidence < AUTO_APPROVE_CONFIDENCE)
    .map(item => ({
      ...item,
      requiresReview: true,
      metadata: {
        ...(item.metadata || {}),
        reviewReason: 'Low extraction confidence',
      },
    }));

  const status =
    autoApproved.length > 0 && requiresReview.length > 0 ? 'partial' :
    autoApproved.length > 0 ? 'success' :
    requiresReview.length > 0 ? 'partial' :
    'failed';

  if (status === 'failed') {
    return {
      success: false,
      status: 'failed',
      inputType: classification.inputType,
      autoApproved: [],
      requiresReview: [],
      classification,
      logs,
      error: geminiFailureMessage || 'Extraction confidence was too low. Please upload a clearer photo.',
    };
  }

  return {
    success: true,
    status,
    inputType: classification.inputType,
    autoApproved,
    requiresReview,
    classification,
    logs,
    error: null,
  };
}

/**
 * @param {string} dataUrl
 * @param {GarmentAnalysisOptions} [options]
 * @param {{ skipGemini?: boolean }} [runtime]
 * @returns {Promise<UploadClassification>}
 */
async function classifyUploadInput(dataUrl, options = {}, runtime = {}) {
  const hintedType = options.inputTypeHint;
  if (hintedType === 'single_item' || hintedType === 'person_outfit') {
    return {
      inputType: hintedType,
      confidence: 0.98,
      reason: `Upload type was selected by user: ${hintedType}.`,
      metrics: { source: 'user-hint' },
    };
  }

  const faceProbe = await detectFacePresence(dataUrl);
  if (faceProbe.faceDetected && faceProbe.confidence >= 0.8) {
    return {
      inputType: 'person_outfit',
      confidence: Math.max(0.78, faceProbe.confidence),
      reason: 'Face detected in upload. Treating as person outfit photo.',
      metrics: faceProbe.metrics,
    };
  }

  const gemini = runtime.skipGemini
    ? null
    : await classifyUploadWithGemini(dataUrl);
  if (gemini) {
    if (shouldPreferWearableItemReview(gemini, faceProbe)) {
      const fallbackInputType = faceProbe.confidence >= 0.55 ? 'single_item' : 'uncertain';
      return {
        inputType: fallbackInputType,
        confidence: Math.max(
          gemini.confidence,
          faceProbe.confidence,
          fallbackInputType === 'single_item' ? 0.58 : 0.4,
        ),
        reason: 'No face detected. Keeping upload in wearable item review instead of rejecting it as unsupported.',
        metrics: {
          ...(faceProbe.metrics || {}),
          downgradedFrom: gemini.inputType,
          downgradedReason: gemini.reason,
        },
      };
    }
    return gemini;
  }

  if (!faceProbe.faceDetected && faceProbe.confidence >= 0.55) {
    return {
      inputType: 'single_item',
      confidence: 0.62,
      reason: 'No face detected; treating as single item upload.',
      metrics: faceProbe.metrics,
    };
  }

  if (isImageDataUrl(dataUrl)) {
    return {
      inputType: 'single_item',
      confidence: 0.58,
      reason: 'Fallback heuristic treated upload as a single wardrobe item.',
      metrics: {
        ...(faceProbe.metrics || {}),
        source: 'heuristic-single-item',
      },
    };
  }

  return {
    inputType: 'uncertain',
    confidence: 0.35,
    reason: 'Could not confidently classify upload as single item or person outfit.',
    metrics: faceProbe.metrics,
  };
}

/**
 * @param {string} dataUrl
 * @param {string} [sourceFileName]
 * @returns {Promise<GeminiWardrobeValidationResult>}
 */
async function validateWardrobeUploadWithGemini(dataUrl, sourceFileName = '') {
  try {
    const mocked = await maybeResolveGeminiTestOverride('wardrobeValidation', {
      dataUrl,
      sourceFileName,
    });
    if (mocked !== undefined) {
      const rawResponse = typeof mocked === 'string' ? mocked : JSON.stringify(mocked);
      logPipeline('info', 'gemini_wardrobe_validation_raw_response', {
        source: 'test-override',
        rawResponse: truncateForLog(rawResponse),
      });
      const parsedMock = typeof mocked === 'string'
        ? parseJsonObject(mocked)
        : typeof mocked === 'object' && mocked
          ? mocked
          : null;
      if (!parsedMock || typeof parsedMock !== 'object') {
        return {
          available: true,
          success: false,
          analysis: null,
          failureKind: 'invalid_json',
          failureReason: 'Gemini wardrobe validation mock returned a response that could not be parsed as JSON.',
        };
      }
      const normalized = normalizeWardrobeValidationPayload(
        parsedMock,
        sourceFileName,
      );
      if (!normalized) {
        return {
          available: true,
          success: false,
          analysis: null,
          failureKind: 'invalid_payload',
          failureReason: 'Gemini wardrobe validation mock returned an unusable payload.',
        };
      }
      return {
        available: true,
        success: true,
        analysis: normalized,
        failureKind: null,
        failureReason: null,
      };
    }
  } catch (error) {
    return {
      available: true,
      success: false,
      analysis: null,
      failureKind: 'api_failure',
      failureReason: error instanceof Error
        ? error.message
        : 'Gemini wardrobe validation mock failed.',
    };
  }

  const geminiApiKey = readConfig('GEMINI_API_KEY');
  if (!geminiApiKey) {
    return {
      available: false,
      success: false,
      analysis: null,
      failureKind: 'unavailable',
      failureReason: null,
    };
  }

  const response = await requestGeminiJsonCandidate({
    stage: 'wardrobe_validation',
    dataUrl,
    temperature: 0.1,
    promptLines: [
      'You are validating a wardrobe upload for a fashion app.',
      'Decide if this image should be accepted into the wardrobe as a single wearable fashion item.',
      'VALID: isolated tops, shirts, blouses, t-shirts, hoodies, sweaters, knitwear, jackets, coats, blazers, dresses, skirts, pants, jeans, trousers, shorts, jumpsuits, shoes, sneakers, boots, heels, sandals, socks, hats, caps, headphones, scarves, belts, bags, and wearable accessories.',
      'INVALID: selfies, face photos, full-body person photos, interiors, pets, food, landscapes, screenshots, and random non-fashion objects.',
      'Important: isolated clothing on a plain background must be accepted. Isolated jeans, shirts, blouses, shorts, shoes, socks, hats, bags, and accessories must be accepted.',
      'If the item is clearly wearable but not fully certain, use acceptance "review" instead of rejecting it.',
      'Recommend closetStorageMode for wardrobe display: hanger, folded, drawer, shoe-shelf, headwear-rail, or accessory-hooks.',
      sourceFileName ? `Source filename hint: ${sourceFileName}` : 'No source filename hint available.',
      'Return STRICT JSON only. No prose. No markdown. No code fences.',
      'Schema:',
      '{"isValidWearable":true,"inputType":"single_item|person_outfit|unsupported|uncertain","acceptance":"accept|reject|review","category":"base|shirt|sweater|outerwear|dress|accessory|pants|socks|shoes|unknown","subcategory":"string","color":"string","colors":["string"],"title":"string","confidence":0.0,"closetStorageMode":"hanger|folded|drawer|shoe-shelf|headwear-rail|accessory-hooks|unknown","rejectionReason":null}',
    ],
  });
  if (!response.available) {
    return {
      available: false,
      success: false,
      analysis: null,
      failureKind: 'unavailable',
      failureReason: null,
    };
  }
  if (!response.success || !response.parsed) {
    return {
      available: true,
      success: false,
      analysis: null,
      failureKind: response.failureKind,
      failureReason: response.failureReason,
    };
  }

  const normalized = normalizeWardrobeValidationPayload(response.parsed, sourceFileName);
  if (!normalized) {
    return {
      available: true,
      success: false,
      analysis: null,
      failureKind: 'invalid_payload',
      failureReason: 'Gemini wardrobe validation returned an unusable payload.',
    };
  }

  return {
    available: true,
    success: true,
    analysis: normalized,
    failureKind: null,
    failureReason: null,
  };
}

/**
 * @param {string} dataUrl
 * @returns {Promise<UploadClassification | null>}
 */
async function classifyUploadWithGemini(dataUrl) {
  const geminiApiKey = readConfig('GEMINI_API_KEY');
  if (!geminiApiKey) return null;

  const response = await requestGeminiJsonCandidate({
    stage: 'upload_classification',
    dataUrl,
    temperature: 0.1,
    promptLines: [
      'Classify this fashion upload type.',
      'Treat clothing, footwear, hats, bags, scarves, belts, jewelry, eyewear, and gloves as valid single_item uploads.',
      'Treat standalone product photos or cutout photos of garments on a plain background as valid single_item uploads.',
      'Treat faces, selfies, full-person photos, interiors, pets, food, landscapes, screenshots, and random non-fashion objects as unsupported or person_outfit.',
      'Return STRICT JSON only. No prose. No markdown. No code fences.',
      'Schema:',
      '{"inputType":"single_item|person_outfit|unsupported|uncertain","confidence":0.0,"reason":"string"}',
    ],
  });
  if (!response.success || !response.parsed) {
    return null;
  }

  const inputType = String(response.parsed.inputType || '').toLowerCase();
  if (!['single_item', 'person_outfit', 'unsupported', 'uncertain'].includes(inputType)) return null;

  return {
    inputType: /** @type {UploadInputType} */ (inputType),
    confidence: Math.max(0, Math.min(1, Number(response.parsed.confidence ?? 0))),
    reason: String(response.parsed.reason || 'Gemini upload classification'),
  };
}

/**
 * @param {string} dataUrl
 * @param {GarmentAnalysisOptions} options
 * @param {{ originalUrl: string, objectBase: string, persist: boolean, accessToken?: string }} context
 * @param {{
 *  seededClassification?: {
 *    success: boolean,
 *    title: string,
 *    category: import('../models/garment.js').GarmentCategory,
 *    color: string,
 *    colors: string[],
 *    subcategory: string,
 *    styleTags: string[],
 *    seasonTags: string[],
 *    occasionTags: string[],
 *    confidence: number,
 *    closetStorageMode: 'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks',
 *    source: 'gemini-vision',
 *    error?: string,
 *  } | null,
 *  forceHeuristicClassifier?: boolean,
 * }} [overrides]
 * @returns {Promise<ExtractedWardrobeItem[]>}
 */
async function processSingleItemUpload(dataUrl, options, context, overrides = {}) {
  logPipeline('info', 'single_item_upload_received', {
    sourceFileName: options.sourceFileName || null,
    rawUploadUrl: toLogAssetRef(context.originalUrl || dataUrl),
    objectBase: context.objectBase,
    persist: context.persist,
  });

  const segmentation = await segmentGarmentImage(dataUrl);
  logPipeline(
    segmentation.backgroundRemoved ? 'info' : 'warn',
    segmentation.backgroundRemoved ? 'background_removal_success' : 'background_removal_failed',
    {
      source: segmentation.source,
      reason: segmentation.error || null,
    },
  );

  const classification = overrides.seededClassification
    ? overrides.seededClassification
    : overrides.forceHeuristicClassifier
      ? buildHeuristicGarmentFallback(
        segmentation.cutoutDataUrl || dataUrl,
        options.sourceFileName || '',
        'AI validation was unavailable. Falling back to local wardrobe heuristics.',
      )
      : await classifyGarment(segmentation.cutoutDataUrl || dataUrl, options.sourceFileName || '');
  if (!classification.success || classification.confidence < MIN_CONFIDENCE_TO_KEEP) {
    logPipeline('warn', 'garment_classification_failed', {
      reason: classification.error || 'low-confidence',
      confidence: classification.confidence,
    });
    return [];
  }

  const cutoutUpload = context.persist && segmentation.backgroundRemoved
    ? await uploadDataUrl(
      readConfig('SUPABASE_BUCKET_CUTOUTS', 'wardrobe-cutouts'),
      `${context.objectBase}/single-cutout.png`,
      segmentation.cutoutDataUrl,
      context.accessToken,
    )
    : null;
  const maskUpload = context.persist && segmentation.backgroundRemoved && segmentation.maskDataUrl
    ? await uploadDataUrl(
      readConfig('SUPABASE_BUCKET_CUTOUTS', 'wardrobe-cutouts'),
      `${context.objectBase}/single-mask.png`,
      segmentation.maskDataUrl,
      context.accessToken,
    )
    : null;

  const thumb = await createThumbnailDataUrl(segmentation.cutoutDataUrl || dataUrl, 320);
  const confidence = classification.confidence;
  const bodySlot = inferBodySlotForExtracted(
    classification.category,
    classification.title,
    classification.subcategory,
  );
  let processedImageUrl = segmentation.backgroundRemoved
    ? (cutoutUpload?.url || segmentation.cutoutDataUrl || '')
    : '';
  let processedThumbnailUrl = segmentation.backgroundRemoved
    ? (thumb || '')
    : '';
  let backgroundRemoved = segmentation.backgroundRemoved;

  if (backgroundRemoved && !processedImageUrl) {
    logPipeline('warn', 'processed_asset_missing_after_bg_remove', {
      source: segmentation.source,
      reason: 'processedImageUrl empty',
      rawUploadUrl: toLogAssetRef(context.originalUrl || dataUrl),
    });
    backgroundRemoved = false;
    processedImageUrl = '';
    processedThumbnailUrl = '';
  }

  logPipeline(backgroundRemoved ? 'info' : 'warn', 'processed_asset_saved', {
    backgroundRemoved,
    processedImageUrl: toLogAssetRef(processedImageUrl),
    cutoutUploadUrl: toLogAssetRef(cutoutUpload?.url || ''),
    processedThumbnailUrl: toLogAssetRef(processedThumbnailUrl),
    maskUrl: toLogAssetRef(maskUpload?.url || ''),
    rawUploadUrl: toLogAssetRef(context.originalUrl || dataUrl),
  });

  const rawFallbackUrl = context.originalUrl || dataUrl;
  const rawImageFallback = !backgroundRemoved;
  const item = {
    title: classification.title,
    category: classification.category,
    subcategory: classification.subcategory || '',
    colors: classification.colors.length > 0 ? classification.colors : [classification.color],
    styleTags: classification.styleTags,
    seasonTags: classification.seasonTags,
    occasionTags: classification.occasionTags,
    thumbnailUrl: processedThumbnailUrl || thumb || '',
    processedImageUrl,
    iconName: iconForCategory(classification.category),
    sourceType: /** @type {'single_item'} */ ('single_item'),
    backgroundRemoved,
    extractionConfidence: confidence,
    confidence,
    requiresReview: confidence < AUTO_APPROVE_CONFIDENCE,
    bodySlot,
    positionOffsetX: 0,
    positionOffsetY: 0,
    rawImageFallback,
    metadata: {
      originalUrl: context.originalUrl,
      cutoutUrl: cutoutUpload?.url || '',
      maskUrl: maskUpload?.url || '',
      backgroundRemoved,
      bgRemovalStatus: backgroundRemoved ? 'succeeded' : 'failed',
      bgRemovalProvider: segmentation.source,
      processedImageUrl,
      processedThumbnailUrl,
      rawFallbackUrl,
      rawImageFallback,
      closetStorageMode: classification.closetStorageMode,
      closetStorageSource: classification.source,
      bodySlot,
      positionOffsetX: 0,
      positionOffsetY: 0,
      segmentation: segmentation.source,
      segmentationError: segmentation.error || null,
      classifier: classification.source,
      sourceFileName: options.sourceFileName || null,
      validationError: classification.error || null,
    },
  };

  logPipeline('info', 'wardrobe_item_asset_linked', {
    category: item.category,
    title: item.title,
    backgroundRemoved: item.backgroundRemoved,
    processedImageUrl: toLogAssetRef(item.processedImageUrl || ''),
    thumbnailUrl: toLogAssetRef(item.thumbnailUrl || ''),
    rawImageFallback: item.rawImageFallback,
  });

  return [item];
}

/**
 * @param {string} bucket
 * @param {string} objectPath
 * @param {string} dataUrl
 * @param {string} [accessToken]
 * @returns {Promise<{ path: string, url: string } | null>}
 */
async function uploadDataUrl(bucket, objectPath, dataUrl, accessToken) {
  try {
    const blob = await dataUrlToBlob(dataUrl);
    return await supabaseApi.uploadStorageObject(bucket, objectPath, blob, {
      accessToken,
      contentType: blob.type || 'image/png',
    });
  } catch {
    return null;
  }
}

/**
 * @param {string} dataUrl
 * @returns {Promise<{ cutoutDataUrl: string, maskDataUrl: string | null, backgroundRemoved: boolean, source: string, error?: string | null }>}
 */
async function segmentGarmentImage(dataUrl) {
  logPipeline('info', 'background_removal_request_started', {
    source: toLogAssetRef(dataUrl),
  });

  const removeBgResult = await removeBackgroundWithApi(dataUrl);
  if (removeBgResult.success && removeBgResult.backgroundRemoved) {
    return {
      cutoutDataUrl: removeBgResult.imageDataUrl,
      maskDataUrl: null,
      backgroundRemoved: true,
      source: removeBgResult.provider,
      error: removeBgResult.error || null,
    };
  }

  return {
    cutoutDataUrl: dataUrl,
    maskDataUrl: null,
    backgroundRemoved: false,
    source: 'fallback',
    error: removeBgResult.error || 'Background removal failed.',
  };
}

/**
 * @param {string} dataUrl
 * @returns {Promise<{ success: boolean, backgroundRemoved: boolean, imageDataUrl: string, provider: string, error?: string | null }>}
 */
async function removeBackgroundWithApi(dataUrl) {
  const response = await requestBackgroundRemoval(dataUrl);
  if (!response.success) {
    logPipeline('warn', 'background_removal_request_failed', {
      reason: response.error || null,
      provider: response.provider || 'none',
    });
    return {
      success: false,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider: response.provider || 'none',
      error: response.error || 'Background removal request failed.',
    };
  }

  const imageDataUrl = typeof response.imageDataUrl === 'string' && response.imageDataUrl.length > 0
    ? response.imageDataUrl
    : dataUrl;
  const provider = String(response.provider || 'remove.bg');
  const requestedBackgroundRemoved = Boolean(response.backgroundRemoved);

  if (!requestedBackgroundRemoved) {
    logPipeline('warn', 'background_removal_provider_reported_failure', {
      provider,
      reason: response.error ? String(response.error) : null,
    });
    return {
      success: true,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider,
      error: response.error ? String(response.error) : null,
    };
  }

  const validation = await validateProcessedTransparentAsset(imageDataUrl);
  if (!validation.valid) {
    logPipeline('warn', 'background_removal_validation_failed', {
      provider,
      mimeType: validation.mimeType,
      hasTransparency: validation.hasTransparency,
      reason: validation.reason,
    });
    return {
      success: true,
      backgroundRemoved: false,
      imageDataUrl: dataUrl,
      provider,
      error: validation.reason || 'Processed asset failed transparency validation.',
    };
  }

  logPipeline('info', 'background_removal_provider_success', {
    provider,
    mimeType: validation.mimeType,
    hasTransparency: validation.hasTransparency,
    output: toLogAssetRef(imageDataUrl),
  });

  return {
    success: true,
    backgroundRemoved: true,
    imageDataUrl,
    provider,
    error: response.error ? String(response.error) : null,
  };
}

/**
 * @param {string} dataUrl
 * @param {string} [sourceFileName]
 * @returns {Promise<{
 *  success: boolean,
 *  title: string,
 *  category: import('../models/garment.js').GarmentCategory,
 *  color: string,
 *  colors: string[],
 *  subcategory: string,
 *  styleTags: string[],
 *  seasonTags: string[],
 *  occasionTags: string[],
 *  confidence: number,
 *  closetStorageMode: 'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks',
 *  source: 'gemini-vision',
 *  error?: string
 * }>}
 */
async function classifyGarment(dataUrl, sourceFileName = '') {
  const geminiApiKey = readConfig('GEMINI_API_KEY');
  if (!geminiApiKey) {
    return classifyGarmentHeuristically(dataUrl, sourceFileName);
  }

  const response = await requestGeminiJsonCandidate({
    stage: 'garment_classification',
    dataUrl,
    temperature: 0.1,
    promptLines: [
      'Analyze this wearable fashion item photo and return STRICT JSON.',
      'Accepted wearables include tops, knitwear, outerwear, dresses, bottoms, socks, shoes, hats, headphones, bags, scarves, belts, jewelry, eyewear, and gloves.',
      'Standalone product photos of hoodies, jeans, shorts, shoes, hats, and bags are valid wearable items.',
      'Do not reject isolated garments only because the item is cropped or shown on a white background.',
      'Map tops, shirts, blouses, tees to shirt.',
      'Map hoodies, sweatshirts, sweaters, cardigans, knitwear to sweater.',
      'Map jackets, coats, blazers, trench, puffer to outerwear.',
      'Map dresses and jumpsuits to dress.',
      'Map jeans, trousers, skirts, shorts, leggings to pants.',
      'Map socks to socks.',
      'Map sneakers, boots, heels, sandals, loafers, flats, slippers to shoes.',
      'Map hats, caps, beanies, headphones, bags, scarves, belts, jewelry, sunglasses, eyewear, gloves to accessory.',
      'Recommend closetStorageMode for wardrobe browsing: hanger for hanging garments, folded for folded shelf items, drawer for socks, shoe-shelf for shoes, headwear-rail for caps/hats, accessory-hooks for non-headwear accessories.',
      'Use a specific subcategory and do not collapse everything into shirt.',
      sourceFileName ? `Source filename hint: ${sourceFileName}` : 'No source filename hint available.',
      'Return STRICT JSON only. No prose. No markdown. No code fences.',
      'JSON schema:',
      '{"title":"string","category":"base|shirt|sweater|outerwear|dress|accessory|pants|socks|shoes","subcategory":"string","colors":["string"],"styleTags":["string"],"seasonTags":["string"],"occasionTags":["string"],"confidence":0.0,"closetStorageMode":"hanger|folded|drawer|shoe-shelf|headwear-rail|accessory-hooks|unknown"}',
    ],
  });
  if (!response.success || !response.parsed) {
    return buildHeuristicGarmentFallback(
      dataUrl,
      sourceFileName,
      response.failureReason || 'Gemini returned invalid JSON for garment classification.',
    );
  }

  const normalized = normalizeGarmentClassificationPayload(response.parsed, sourceFileName);
  if (!normalized) {
    return buildHeuristicGarmentFallback(
      dataUrl,
      sourceFileName,
      'Gemini classification was inconclusive for a wearable item.',
    );
  }

  const confidence = clamp01(Number(response.parsed.confidence ?? 0));

  return {
    success: true,
    title: normalized.title,
    category: normalized.category,
    color: normalized.color,
    colors: normalized.colors,
    subcategory: normalized.subcategory,
    styleTags: Array.isArray(response.parsed.styleTags) ? response.parsed.styleTags.map(String).slice(0, 8) : [],
    seasonTags: Array.isArray(response.parsed.seasonTags) ? response.parsed.seasonTags.map(String).slice(0, 4) : [],
    occasionTags: Array.isArray(response.parsed.occasionTags) ? response.parsed.occasionTags.map(String).slice(0, 4) : [],
    confidence: confidence >= MIN_CONFIDENCE_TO_KEEP
      ? confidence
      : Math.max(confidence, MIN_CONFIDENCE_TO_KEEP + 0.01),
    closetStorageMode: normalized.closetStorageMode,
    source: 'gemini-vision',
  };
}

/**
 * @param {UploadClassification} gemini
 * @param {{ faceDetected: boolean, confidence: number }} faceProbe
 * @returns {boolean}
 */
function shouldPreferWearableItemReview(gemini, faceProbe) {
  return gemini.inputType === 'unsupported'
    && !faceProbe.faceDetected
    && gemini.confidence < 0.9;
}

/**
 * @param {string} dataUrl
 * @param {string} sourceFileName
 * @param {string} reason
 */
function buildHeuristicGarmentFallback(dataUrl, sourceFileName, reason) {
  const heuristic = classifyGarmentHeuristically(dataUrl, sourceFileName);
  return {
    ...heuristic,
    error: reason,
  };
}

/**
 * @param {string} dataUrl
 * @param {string} [sourceFileName]
 */
function classifyGarmentHeuristically(dataUrl, sourceFileName = '') {
  const probe = buildClassificationMarker(sourceFileName, dataUrl);
  if (isBlockedFashionMarker(probe)) {
    return {
      success: false,
      title: '',
      category: /** @type {import('../models/garment.js').GarmentCategory} */ ('shirt'),
      color: '#808080',
      colors: [],
      subcategory: '',
      styleTags: [],
      seasonTags: [],
      occasionTags: [],
      confidence: 0,
      closetStorageMode: inferClosetStorageMode('shirt', sourceFileName),
      source: /** @type {'gemini-vision'} */ ('gemini-vision'),
      error: 'Upload does not appear to be a wearable fashion item.',
    };
  }

  const category = /** @type {import('../models/garment.js').GarmentCategory} */ (normalizeSupportedCategory('', probe) || 'shirt');
  const subcategory = normalizeDetectedSubcategory('', '', category, sourceFileName);
  const color = inferHeuristicColor(probe);
  const confidence = hasWearableSignal(probe)
    ? 0.68
    : sourceFileName
      ? 0.52
      : 0.46;

  return {
    success: true,
    title: buildDetectedTitle(sourceFileName || '', subcategory, /** @type {import('../models/garment.js').GarmentCategory} */ (category)),
    category: /** @type {import('../models/garment.js').GarmentCategory} */ (category),
    color,
    colors: [color],
    subcategory,
    styleTags: ['fallback'],
    seasonTags: [],
    occasionTags: [],
    confidence,
    closetStorageMode: inferClosetStorageMode(category, sourceFileName),
    source: /** @type {'gemini-vision'} */ ('gemini-vision'),
  };
}

/**
 * @param {Record<string, any>} parsed
 * @param {string} sourceFileName
 * @returns {{
 *  title: string,
 *  category: import('../models/garment.js').GarmentCategory,
 *  color: string,
 *  colors: string[],
 *  subcategory: string,
 *  closetStorageMode: 'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks',
 * } | null}
 */
function normalizeGarmentClassificationPayload(parsed, sourceFileName) {
  const marker = buildClassificationMarker(parsed.category, parsed.subcategory, parsed.title, sourceFileName);
  if (isBlockedFashionMarker(marker)) return null;

  const category = normalizeSupportedCategory(parsed.category, marker);
  if (!category) return null;

  const subcategory = normalizeDetectedSubcategory(parsed.subcategory, parsed.title, category, sourceFileName);
  const colors = [
    ...(Array.isArray(parsed.colors) ? parsed.colors : []),
    parsed.color,
  ]
    .map(value => normalizeColorToken(String(value || '')))
    .filter(Boolean)
    .slice(0, 4);
  const primaryColor = colors[0] || '#808080';

  return {
    title: buildDetectedTitle(String(parsed.title || ''), subcategory, category),
    category,
    color: primaryColor,
    colors: colors.length ? colors : [primaryColor],
    subcategory,
    closetStorageMode: normalizeClosetStorageMode(
      parsed.closetStorageMode,
      category,
      subcategory,
      parsed.title,
      sourceFileName,
    ),
  };
}

/**
 * @param {unknown} value
 * @param {import('../models/garment.js').GarmentCategory} category
 * @param {...string} markerParts
 * @returns {'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks'}
 */
function normalizeClosetStorageMode(value, category, ...markerParts) {
  const normalized = String(value || '').trim().toLowerCase();
  if (CLOSET_STORAGE_MODE_SET.has(normalized)) {
    return /** @type {'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks'} */ (normalized);
  }
  return inferClosetStorageMode(category, buildClassificationMarker(...markerParts));
}

/**
 * @param {import('../models/garment.js').GarmentCategory} category
 * @param {string} marker
 * @returns {'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks'}
 */
function inferClosetStorageMode(category, marker = '') {
  if (category === 'shoes') return 'shoe-shelf';
  if (category === 'socks') return 'drawer';
  if (category === 'pants') return 'folded';
  if (category === 'accessory') {
    return HEADWEAR_STORAGE_KEYWORDS.test(marker) ? 'headwear-rail' : 'accessory-hooks';
  }
  return 'hanger';
}

/**
 * @param {...string} parts
 * @returns {string}
 */
function buildClassificationMarker(...parts) {
  return parts
    .map(part => String(part || '').trim().toLowerCase().replace(/[_-]+/g, ' '))
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {GeminiWardrobeValidation} analysis
 * @returns {UploadClassification}
 */
function buildUploadClassificationFromGeminiValidation(analysis) {
  const descriptor = [analysis.title, analysis.subcategory, analysis.category]
    .filter(Boolean)
    .join(' / ');
  const reason = analysis.isValidWearable
    ? analysis.acceptance === 'review'
      ? `Gemini identified a wearable item and kept it in review: ${descriptor || 'single wardrobe item'}.`
      : `Gemini accepted this upload as a wardrobe item: ${descriptor || 'single wardrobe item'}.`
    : analysis.rejectionReason || 'Gemini rejected this upload as not suitable for wardrobe storage.';

  return {
    inputType: analysis.inputType,
    confidence: clamp01(analysis.confidence),
    reason,
    metrics: {
      source: 'gemini-wardrobe-validation',
      geminiValidation: {
        isValidWearable: analysis.isValidWearable,
        inputType: analysis.inputType,
        acceptance: analysis.acceptance,
        category: analysis.category,
        subcategory: analysis.subcategory,
        color: analysis.color,
        colors: analysis.colors,
        title: analysis.title,
        confidence: analysis.confidence,
        rejectionReason: analysis.rejectionReason,
      },
    },
  };
}

/**
 * @param {GeminiWardrobeValidation} analysis
 * @returns {{
 *  success: boolean,
 *  title: string,
 *  category: import('../models/garment.js').GarmentCategory,
 *  color: string,
 *  colors: string[],
 *  subcategory: string,
 *  styleTags: string[],
 *  seasonTags: string[],
 *  occasionTags: string[],
 *  confidence: number,
 *  closetStorageMode: 'hanger' | 'folded' | 'drawer' | 'shoe-shelf' | 'headwear-rail' | 'accessory-hooks',
 *  source: 'gemini-vision',
 *  error?: string
 * }}
 */
function buildSeededGarmentClassification(analysis) {
  const confidence = analysis.acceptance === 'review'
    ? Math.max(MIN_CONFIDENCE_TO_KEEP + 0.01, clamp01(analysis.confidence))
    : Math.max(AUTO_APPROVE_CONFIDENCE, clamp01(analysis.confidence));

  return {
    success: true,
    title: analysis.title,
    category: analysis.category === 'unknown' ? 'shirt' : analysis.category,
    color: analysis.color || analysis.colors[0] || '',
    colors: analysis.colors.length ? analysis.colors : analysis.color ? [analysis.color] : [],
    subcategory: analysis.subcategory,
    styleTags: [],
    seasonTags: [],
    occasionTags: [],
    confidence,
    closetStorageMode: normalizeClosetStorageMode(
      analysis.closetStorageMode,
      analysis.category === 'unknown' ? 'shirt' : analysis.category,
      analysis.subcategory,
      analysis.title,
    ),
    source: 'gemini-vision',
  };
}

/**
 * @param {GeminiWardrobeValidationResult} result
 * @returns {string}
 */
function buildGeminiValidationFailureMessage(result) {
  if (result.failureKind === 'invalid_json' || result.failureKind === 'invalid_payload') {
    return 'AI validation returned an unreadable result. Please try this upload again.';
  }
  return 'AI validation is temporarily unavailable. Please try this upload again.';
}

/**
 * @param {Record<string, any>} parsed
 * @param {string} sourceFileName
 * @returns {GeminiWardrobeValidation | null}
 */
function normalizeWardrobeValidationPayload(parsed, sourceFileName) {
  const acceptance = normalizeValidationAcceptance(parsed.acceptance, Boolean(parsed.isValidWearable));
  const marker = buildClassificationMarker(
    parsed.inputType,
    parsed.category,
    parsed.subcategory,
    parsed.title,
    parsed.color,
    Array.isArray(parsed.colors) ? parsed.colors.join(' ') : '',
    parsed.rejectionReason,
    sourceFileName,
  );
  const normalizedInputType = normalizeValidationInputType(parsed.inputType, marker);
  const clearlyWearable = hasWearableSignal(marker) && !isBlockedFashionMarker(marker);
  const requestedValid = parsed.isValidWearable === true || acceptance !== 'reject';

  if (!requestedValid && !clearlyWearable) {
    return {
      isValidWearable: false,
      inputType: normalizedInputType,
      acceptance: 'reject',
      category: 'unknown',
      subcategory: '',
      color: '',
      colors: [],
      title: '',
      confidence: clamp01(Number(parsed.confidence ?? 0)),
      closetStorageMode: 'unknown',
      rejectionReason: String(parsed.rejectionReason || parsed.reason || 'Upload is not a supported wearable fashion item.').trim(),
    };
  }

  const category = normalizeSupportedCategory(parsed.category, marker);
  const safeCategory = category || (clearlyWearable ? normalizeSupportedCategory('', marker) : null);
  if (!safeCategory) {
    return requestedValid
      ? {
          isValidWearable: true,
          inputType: normalizedInputType === 'unsupported' ? 'uncertain' : normalizedInputType,
          acceptance: 'review',
          category: 'shirt',
          subcategory: normalizeDetectedSubcategory(parsed.subcategory, parsed.title, 'shirt', sourceFileName),
          color: normalizeValidationColorName(parsed.color) || inferColorNameFromMarker(marker),
          colors: [normalizeValidationColorName(parsed.color) || inferColorNameFromMarker(marker)].filter(Boolean),
          title: buildWardrobeValidationTitle(
            parsed.title,
            normalizeDetectedSubcategory(parsed.subcategory, parsed.title, 'shirt', sourceFileName),
            'shirt',
            normalizeValidationColorName(parsed.color) || inferColorNameFromMarker(marker),
          ),
          confidence: Math.max(MIN_CONFIDENCE_TO_KEEP + 0.01, clamp01(Number(parsed.confidence ?? 0))),
          closetStorageMode: normalizeClosetStorageMode(parsed.closetStorageMode, 'shirt', parsed.subcategory, parsed.title, sourceFileName),
          rejectionReason: null,
        }
      : null;
  }

  const subcategory = normalizeDetectedSubcategory(parsed.subcategory, parsed.title, safeCategory, sourceFileName);
  const colors = [
    ...(Array.isArray(parsed.colors) ? parsed.colors : []),
    parsed.color,
  ]
    .map(value => normalizeValidationColorName(String(value || '')))
    .filter(Boolean)
    .slice(0, 4);
  const primaryColor = colors[0] || inferColorNameFromMarker(marker);
  const resolvedInputType = normalizedInputType === 'unsupported' && requestedValid
    ? 'uncertain'
    : normalizedInputType;

  return {
    isValidWearable: true,
    inputType: resolvedInputType === 'person_outfit' && !clearlyWearable ? 'person_outfit' : resolvedInputType,
    acceptance: requestedValid && acceptance === 'reject' ? 'review' : acceptance,
    category: safeCategory,
    subcategory,
    color: primaryColor,
    colors: colors.length ? colors : primaryColor ? [primaryColor] : [],
    title: buildWardrobeValidationTitle(parsed.title, subcategory, safeCategory, primaryColor),
    confidence: Math.max(
      requestedValid ? MIN_CONFIDENCE_TO_KEEP + 0.01 : 0,
      clamp01(Number(parsed.confidence ?? 0)),
    ),
    closetStorageMode: normalizeClosetStorageMode(
      parsed.closetStorageMode,
      safeCategory,
      subcategory,
      parsed.title,
      sourceFileName,
    ),
    rejectionReason: null,
  };
}

/**
 * @param {unknown} value
 * @param {boolean} requestedValid
 * @returns {WardrobeValidationAcceptance}
 */
function normalizeValidationAcceptance(value, requestedValid) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'accept' || normalized === 'reject' || normalized === 'review') {
    return /** @type {WardrobeValidationAcceptance} */ (normalized);
  }
  return requestedValid ? 'accept' : 'reject';
}

/**
 * @param {unknown} value
 * @param {string} marker
 * @returns {UploadInputType}
 */
function normalizeValidationInputType(value, marker) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'single_item' || normalized === 'person_outfit' || normalized === 'unsupported' || normalized === 'uncertain') {
    return /** @type {UploadInputType} */ (normalized);
  }
  if (/\b(selfie|portrait|face|full person|full-body|person outfit|model)\b/i.test(marker)) {
    return 'person_outfit';
  }
  return hasWearableSignal(marker) ? 'single_item' : 'unsupported';
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeValidationColorName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (/white|ivory|cream/.test(normalized)) return 'white';
  if (/black|charcoal/.test(normalized)) return 'black';
  if (/gray|grey|silver/.test(normalized)) return 'gray';
  if (/beige|camel|tan/.test(normalized)) return 'beige';
  if (/brown/.test(normalized)) return 'brown';
  if (/navy|blue|denim/.test(normalized)) return normalized.includes('navy') ? 'navy' : 'blue';
  if (/olive|green|sage/.test(normalized)) return normalized.includes('olive') ? 'olive' : 'green';
  if (/red|burgundy|maroon/.test(normalized)) return normalized.includes('burgundy') ? 'burgundy' : 'red';
  if (/pink|rose/.test(normalized)) return 'pink';
  if (/purple|lilac|violet/.test(normalized)) return 'purple';
  if (/orange|rust|terracotta/.test(normalized)) return 'orange';
  if (/yellow|mustard/.test(normalized)) return 'yellow';
  return normalized.replace(/[^a-z\s-]/g, '').trim();
}

/**
 * @param {string} marker
 * @returns {string}
 */
function inferColorNameFromMarker(marker) {
  return normalizeValidationColorName(marker);
}

/**
 * @param {unknown} rawTitle
 * @param {string} subcategory
 * @param {import('../models/garment.js').GarmentCategory} category
 * @param {string} color
 * @returns {string}
 */
function buildWardrobeValidationTitle(rawTitle, subcategory, category, color) {
  const cleaned = String(rawTitle || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (cleaned && !looksLikeTechnicalName(cleaned) && !isGenericDescriptor(cleaned.toLowerCase()) && cleaned.split(' ').length <= 6) {
    return toTitleCase(cleaned);
  }

  const descriptor = subcategory || buildCategoryTitle(category);
  const composite = [color, descriptor]
    .filter(Boolean)
    .join(' ')
    .trim();
  return toTitleCase(composite || buildCategoryTitle(category));
}

/**
 * @param {string} value
 * @returns {string}
 */
function toTitleCase(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * @param {string} key
 * @param {Record<string, any>} payload
 * @returns {Promise<any>}
 */
async function maybeResolveGeminiTestOverride(key, payload) {
  const overrides = /** @type {any} */ (globalThis).__RENEW_TEST_GEMINI__;
  if (!overrides || typeof overrides !== 'object') return undefined;
  const handler = overrides[key];
  if (handler === undefined) return undefined;
  return typeof handler === 'function'
    ? await handler(payload)
    : handler;
}

/**
 * @param {string} marker
 * @returns {boolean}
 */
function isBlockedFashionMarker(marker) {
  return INVALID_FASHION_KEYWORDS.test(marker) && !hasWearableSignal(marker);
}

/**
 * @param {string} marker
 * @returns {boolean}
 */
function hasWearableSignal(marker) {
  return TOP_KEYWORDS.test(marker)
    || KNIT_KEYWORDS.test(marker)
    || OUTERWEAR_KEYWORDS.test(marker)
    || DRESS_KEYWORDS.test(marker)
    || BOTTOM_KEYWORDS.test(marker)
    || SHOES_KEYWORDS.test(marker)
    || ACCESSORY_KEYWORDS.test(marker)
    || BASE_KEYWORDS.test(marker);
}

/**
 * @param {string} rawCategory
 * @param {string} marker
 * @returns {import('../models/garment.js').GarmentCategory | null}
 */
function normalizeSupportedCategory(rawCategory, marker) {
  const normalizedRaw = String(rawCategory || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  const direct = CATEGORY_ALIAS_MAP[normalizedRaw];
  if (direct && SUPPORTED_CATEGORIES.has(direct)) {
    return /** @type {import('../models/garment.js').GarmentCategory} */ (direct);
  }
  if (DRESS_KEYWORDS.test(marker)) return 'dress';
  if (OUTERWEAR_KEYWORDS.test(marker)) return 'outerwear';
  if (KNIT_KEYWORDS.test(marker)) return 'sweater';
  if (BOTTOM_KEYWORDS.test(marker)) return 'pants';
  if (SOCK_KEYWORDS.test(marker)) return 'socks';
  if (SHOES_KEYWORDS.test(marker)) return 'shoes';
  if (ACCESSORY_KEYWORDS.test(marker)) return 'accessory';
  if (BASE_KEYWORDS.test(marker)) return 'base';
  if (TOP_KEYWORDS.test(marker)) return 'shirt';
  return null;
}

/**
 * @param {string} rawSubcategory
 * @param {string} rawTitle
 * @param {import('../models/garment.js').GarmentCategory} category
 * @param {string} [sourceFileName]
 * @returns {string}
 */
function normalizeDetectedSubcategory(rawSubcategory, rawTitle, category, sourceFileName = '') {
  const cleanedSubcategory = normalizeDescriptorToken(rawSubcategory);
  if (cleanedSubcategory) return cleanedSubcategory;

  const marker = buildClassificationMarker(rawSubcategory, rawTitle, sourceFileName);
  const inferred = inferSpecificSubcategory(marker, category);
  if (inferred) return inferred;

  const cleanedTitle = normalizeDescriptorToken(rawTitle);
  if (cleanedTitle && cleanedTitle.split(' ').length <= 4) return cleanedTitle;

  return '';
}

/**
 * @param {string} marker
 * @param {import('../models/garment.js').GarmentCategory} category
 * @returns {string}
 */
function inferSpecificSubcategory(marker, category) {
  const rules = [
    { pattern: /\b(t[\s-]?shirt|tee)\b/, label: 't-shirt', categories: ['shirt', 'base'] },
    { pattern: /\b(top|tank|cami)\b/, label: 'top', categories: ['shirt', 'base'] },
    { pattern: /\bblouse\b/, label: 'blouse', categories: ['shirt'] },
    { pattern: /\bshirt\b/, label: 'shirt', categories: ['shirt'] },
    { pattern: /\bhoodie\b/, label: 'hoodie', categories: ['sweater'] },
    { pattern: /\bsweatshirt\b/, label: 'sweatshirt', categories: ['sweater'] },
    { pattern: /\bcardigan\b/, label: 'cardigan', categories: ['sweater'] },
    { pattern: /\bknitwear\b/, label: 'knitwear', categories: ['sweater'] },
    { pattern: /\bsweater\b/, label: 'sweater', categories: ['sweater'] },
    { pattern: /\bblazer\b/, label: 'blazer', categories: ['outerwear'] },
    { pattern: /\btrench\b/, label: 'trench coat', categories: ['outerwear'] },
    { pattern: /\bpuffer\b/, label: 'puffer jacket', categories: ['outerwear'] },
    { pattern: /\bcoat\b/, label: 'coat', categories: ['outerwear'] },
    { pattern: /\bjacket\b/, label: 'jacket', categories: ['outerwear'] },
    { pattern: /\bjumpsuit\b/, label: 'jumpsuit', categories: ['dress'] },
    { pattern: /\bromper\b/, label: 'romper', categories: ['dress'] },
    { pattern: /\bslip dress\b/, label: 'slip dress', categories: ['dress'] },
    { pattern: /\bdress\b/, label: 'dress', categories: ['dress'] },
    { pattern: /\bwide[\s-]?leg\s+jeans?\b/, label: 'wide-leg jeans', categories: ['pants'] },
    { pattern: /\bcargo\s+pants?\b/, label: 'cargo pants', categories: ['pants'] },
    { pattern: /\bjeans\b/, label: 'jeans', categories: ['pants'] },
    { pattern: /\btrousers\b/, label: 'trousers', categories: ['pants'] },
    { pattern: /\bskirt\b/, label: 'skirt', categories: ['pants'] },
    { pattern: /\bshorts?\b/, label: 'shorts', categories: ['pants'] },
    { pattern: /\bleggings\b/, label: 'leggings', categories: ['pants'] },
    { pattern: /\bpants\b/, label: 'pants', categories: ['pants'] },
    { pattern: /\bsneakers?\b/, label: 'sneakers', categories: ['shoes'] },
    { pattern: /\bboots?\b/, label: 'boots', categories: ['shoes'] },
    { pattern: /\bloafers?\b/, label: 'loafers', categories: ['shoes'] },
    { pattern: /\bheels?\b/, label: 'heels', categories: ['shoes'] },
    { pattern: /\bsandals?\b/, label: 'sandals', categories: ['shoes'] },
    { pattern: /\bflats?\b/, label: 'flats', categories: ['shoes'] },
    { pattern: /\bslippers?\b/, label: 'slippers', categories: ['shoes'] },
    { pattern: /\bsocks?\b/, label: 'socks', categories: ['socks'] },
    { pattern: /\b(trucker cap|baseball cap|bucket hat)\b/, label: 'cap', categories: ['accessory'] },
    { pattern: /\b(cap|beanie|beret|hat|headband)\b/, label: 'hat', categories: ['accessory'] },
    { pattern: /\b(mini bag|shoulder bag|crossbody bag)\b/, label: 'shoulder bag', categories: ['accessory'] },
    { pattern: /\b(handbag|purse)\b/, label: 'handbag', categories: ['accessory'] },
    { pattern: /\bbackpack\b/, label: 'backpack', categories: ['accessory'] },
    { pattern: /\btote\b/, label: 'tote bag', categories: ['accessory'] },
    { pattern: /\bbag\b/, label: 'bag', categories: ['accessory'] },
    { pattern: /\b(sunglasses|eyewear|glasses)\b/, label: 'eyewear', categories: ['accessory'] },
    { pattern: /\b(headphones?|headset|earbuds?|airpods?)\b/, label: 'headphones', categories: ['accessory'] },
    { pattern: /\b(earrings?|ear cuff|stud earrings?)\b/, label: 'earrings', categories: ['accessory'] },
    { pattern: /\b(necklace|bracelet|ring|earrings?|jewelry|jewellery)\b/, label: 'jewelry', categories: ['accessory'] },
    { pattern: /\bgloves?\b/, label: 'gloves', categories: ['accessory'] },
    { pattern: /\bscarf\b/, label: 'scarf', categories: ['accessory'] },
    { pattern: /\bbelt\b/, label: 'belt', categories: ['accessory'] },
  ];

  const match = rules.find(rule => rule.pattern.test(marker) && rule.categories.includes(category));
  return match ? match.label : '';
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeDescriptorToken(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/^(light|dark|white|black|gray|grey|beige|brown|blue|green|red|pink|purple|orange|yellow|navy|cream|ivory|silver|gold|camel)\s+/i, '')
    .replace(/\b(item|garment|fashion|wearable|clothing|apparel)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || /^(heuristic detected|detected|unknown|uncertain)$/i.test(cleaned)) return '';
  return cleaned;
}

/**
 * @param {string} rawTitle
 * @param {string} subcategory
 * @param {import('../models/garment.js').GarmentCategory} category
 * @returns {string}
 */
function buildDetectedTitle(rawTitle, subcategory, category) {
  const cleanedTitle = normalizeDescriptorToken(rawTitle);
  if (cleanedTitle && cleanedTitle.split(' ').length <= 4 && !looksLikeTechnicalName(cleanedTitle) && !isGenericDescriptor(cleanedTitle)) {
    return cleanedTitle
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  if (subcategory) {
    return subcategory
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return buildCategoryTitle(category);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isGenericDescriptor(value) {
  return /^(unknown|uncertain|detected|item|garment|fashion item|wearable|clothing|apparel|photo|image)$/i.test(String(value || '').trim());
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function looksLikeTechnicalName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return /^(img|image|pxl|dsc|screenshot|photo|scan|capture)[\s_-]?\d+/i.test(normalized)
    || /^[a-z]{2,5}\d{3,}$/i.test(normalized)
    || /^\d+$/.test(normalized);
}

/**
 * @param {string} probe
 * @returns {string}
 */
function inferHeuristicColor(probe) {
  if (/black|charcoal/.test(probe)) return '#222222';
  if (/white|ivory|cream/.test(probe)) return '#F4F0E8';
  if (/navy/.test(probe)) return '#233B6E';
  if (/blue|denim/.test(probe)) return '#4A90D9';
  if (/olive|green/.test(probe)) return '#4A8F63';
  if (/red|burgundy/.test(probe)) return '#B84A4A';
  if (/pink|rose/.test(probe)) return '#E78AB8';
  if (/purple|lilac/.test(probe)) return '#8B73C7';
  if (/beige|camel|tan/.test(probe)) return '#D8C3A5';
  if (/brown/.test(probe)) return '#8A5A3B';
  if (/gray|grey|silver/.test(probe)) return '#8E949E';
  if (/yellow|mustard/.test(probe)) return '#D1A620';
  if (/orange|rust|terracotta/.test(probe)) return '#C9713D';
  return '#808080';
}

/**
 * @param {any} response
 * @returns {string}
 */
function extractGeminiText(response) {
  try {
    if (typeof response?.text === 'string') return response.text;
  } catch (error) {
    logPipeline('warn', 'gemini_text_getter_failed', {
      reason: error instanceof Error ? error.message : 'Gemini response.text getter failed.',
    });
  }
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((/** @type {any} */ part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {{
 *  stage: string,
 *  dataUrl: string,
 *  promptLines: string[],
 *  temperature: number,
 * }} input
 * @returns {Promise<{
 *  available: boolean,
 *  success: boolean,
 *  parsed: Record<string, any> | null,
 *  rawResponse: string,
 *  rawText: string,
 *  failureKind: 'unavailable' | 'api_failure' | 'invalid_json' | 'invalid_payload' | null,
 *  failureReason: string | null,
 * }>}
 */
async function requestGeminiJsonCandidate(input) {
  const proxyUrl = readConfig('AI_PROXY_URL') || readConfig('IMAGE_PIPELINE_URL');
  const apiKey = readConfig('GEMINI_API_KEY');
  if (!proxyUrl && !apiKey) {
    return {
      available: false,
      success: false,
      parsed: null,
      rawResponse: '',
      rawText: '',
      failureKind: 'unavailable',
      failureReason: null,
    };
  }

  const { mimeType, data } = parseDataUrl(input.dataUrl);
  const model = readConfig('CV_GEMINI_MODEL', 'gemini-2.5-flash');

  let rawResponse = '';
  try {
    const geminiResponse = await generateGeminiContent({
      model,
      body: {
        contents: [{
          role: 'user',
          parts: [
            { text: input.promptLines.join('\n') },
            { inlineData: { mimeType, data } },
          ],
        }],
        generationConfig: {
          temperature: input.temperature,
          responseMimeType: 'application/json',
        },
      },
      returnText: true,
    });

    rawResponse = geminiResponse.rawText;
    logPipeline('info', `gemini_${input.stage}_raw_response`, {
      status: 200,
      rawResponse: truncateForLog(rawResponse),
    });

    const parsedEnvelope = safeParseJsonText(rawResponse);
    if (!parsedEnvelope || typeof parsedEnvelope !== 'object') {
      return {
        available: true,
        success: false,
        parsed: null,
        rawResponse,
        rawText: '',
        failureKind: 'invalid_json',
        failureReason: 'Gemini HTTP response was not valid JSON.',
      };
    }

    const rawText = extractGeminiText(parsedEnvelope);
    logPipeline('info', `gemini_${input.stage}_raw_text`, {
      rawText: truncateForLog(rawText),
    });
    const parsed = parseJsonObject(rawText);
    if (!parsed) {
      return {
        available: true,
        success: false,
        parsed: null,
        rawResponse,
        rawText,
        failureKind: 'invalid_json',
        failureReason: 'Gemini returned a candidate that could not be parsed as JSON.',
      };
    }

    return {
      available: true,
      success: true,
      parsed,
      rawResponse,
      rawText,
      failureKind: null,
      failureReason: null,
    };
  } catch (error) {
    logPipeline('warn', `gemini_${input.stage}_request_failed`, {
      rawResponse: truncateForLog(rawResponse),
      reason: error instanceof Error ? error.message : 'Gemini request failed.',
    });
    return {
      available: true,
      success: false,
      parsed: null,
      rawResponse,
      rawText: '',
      failureKind: 'api_failure',
      failureReason: error instanceof Error ? error.message : 'Gemini request failed.',
    };
  }
}

/**
 * @param {string} text
 * @returns {Record<string, any> | null}
 */
function parseJsonObject(text) {
  if (!text) return null;
  const candidates = collectJsonCandidates(text);
  for (const candidate of candidates) {
    const parsed = safeParseJsonText(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * @param {string} text
 * @returns {any | null}
 */
function safeParseJsonText(text) {
  const normalized = String(text || '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!normalized) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function collectJsonCandidates(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  /** @type {string[]} */
  const candidates = [];
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .replace(/```json/gi, '```')
    .trim();

  const direct = cleaned.replace(/```/g, '').trim();
  if (direct) candidates.push(direct);

  const fencedMatches = cleaned.match(/```[\s\S]*?```/g) || [];
  for (const fenced of fencedMatches) {
    const stripped = fenced.replace(/```/g, '').trim();
    if (stripped) candidates.push(stripped);
  }

  for (const candidate of findBalancedJsonObjects(cleaned)) {
    candidates.push(candidate);
  }

  return Array.from(new Set(candidates.map(value => value.trim()).filter(Boolean)));
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function findBalancedJsonObjects(text) {
  /** @type {string[]} */
  const matches = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth <= 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        matches.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return matches;
}

/**
 * Calls backend MediaPipe face detection endpoint.
 *
 * @param {string} dataUrl
 * @returns {Promise<{
 *  success: boolean,
 *  faceDetected: boolean,
 *  valid: boolean,
 *  confidence: number,
 *  boundingBox: { x: number, y: number, width: number, height: number } | null,
 *  croppedFaceUrl: string,
 *  metrics: Record<string, any>,
 *  warnings: string[],
 *  error: string | null
 * }>}
 */
async function detectFaceWithMediaPipeApi(dataUrl) {
  const payload = await postImagePipeline('face-detect', dataUrl);
  if (!payload.success) {
    return {
      success: false,
      faceDetected: false,
      valid: false,
      confidence: 0,
      boundingBox: null,
      croppedFaceUrl: '',
      metrics: {},
      warnings: [],
      error: payload.error || 'Face detection request failed.',
    };
  }

  const data = payload.data || {};
  const bbox = data?.bbox && typeof data.bbox === 'object'
    ? {
      x: clamp01(Number(data.bbox.x)),
      y: clamp01(Number(data.bbox.y)),
      width: clamp01(Number(data.bbox.width)),
      height: clamp01(Number(data.bbox.height)),
    }
    : null;

  return {
    success: true,
    faceDetected: Boolean(data.face_detected),
    valid: Boolean(data.valid),
    confidence: clamp01(Number(data.confidence ?? 0)),
    boundingBox: bbox,
    croppedFaceUrl: typeof data.cropped_face_data_url === 'string' ? data.cropped_face_data_url : '',
    metrics: typeof data.metrics === 'object' && data.metrics ? data.metrics : {},
    warnings: Array.isArray(data.warnings) ? data.warnings.map(v => String(v)).filter(Boolean) : [],
    error: data.error ? String(data.error) : null,
  };
}

/**
 * @param {'face-detect' | 'background-remove'} path
 * @param {string} dataUrl
 * @returns {Promise<{ success: boolean, data?: Record<string, any>, error?: string }>}
 */
async function postImagePipeline(path, dataUrl) {
  const baseUrl = resolveBackendBaseUrl({
    preferProxy: false,
    allowDevLocalFallback: true,
  });

  if (!baseUrl) {
    return { success: false, error: 'IMAGE_PIPELINE_URL is not configured.' };
  }

  let blob = null;
  try {
    blob = await dataUrlToBlob(dataUrl);
  } catch {
    return { success: false, error: 'Failed to decode image for pipeline request.' };
  }

  const form = new FormData();
  form.append('file', blob, `upload.${guessImageExtension(blob.type || 'image/jpeg')}`);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timeoutId = null;
  if (controller) timeoutId = setTimeout(() => controller.abort(), IMAGE_PIPELINE_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/image/${path}`, {
      method: 'POST',
      body: form,
      signal: controller?.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: String(data?.error || `Image pipeline error (${res.status}).`),
      };
    }
    return {
      success: true,
      data: typeof data === 'object' && data ? data : {},
    };
  } catch (err) {
    const message = String((/** @type {Error} */ (err))?.message || 'unknown error');
    const isTimeout =
      typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError';
    const isNetworkFail =
      /failed to fetch/i.test(message) ||
      /networkerror/i.test(message);

    if (isTimeout) {
      return {
        success: false,
        error: `Image pipeline request timed out after ${IMAGE_PIPELINE_TIMEOUT_MS} ms (${baseUrl}).`,
      };
    }
    if (isNetworkFail) {
      return {
        success: false,
        error: [
          `Image pipeline is unreachable at ${baseUrl}.`,
          'Start backend: cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
        ].join(' '),
      };
    }

    return {
      success: false,
      error: `Image pipeline request failed: ${message}`,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * @param {string} dataUrl
 * @returns {Promise<{ faceDetected: boolean, confidence: number, metrics: Record<string, any> }>}
 */
async function detectFacePresence(dataUrl) {
  const mediaPipe = await detectFaceWithMediaPipeApi(dataUrl);
  if (mediaPipe.success) {
    const faceCount = Number(mediaPipe.metrics?.faceCount ?? (mediaPipe.faceDetected ? 1 : 0));
    return {
      faceDetected: Boolean(mediaPipe.faceDetected),
      confidence: mediaPipe.faceDetected
        ? clamp01(Number(mediaPipe.confidence || 0.8))
        : 0.4,
      metrics: {
        faceCount,
        faceAreaRatio: Number(mediaPipe.metrics?.faceAreaRatio ?? 0),
        blurScore: Number(mediaPipe.metrics?.blurScore ?? 0),
        source: 'mediapipe-api',
      },
    };
  }

  return {
    faceDetected: false,
    confidence: 0.1,
    metrics: { source: 'mediapipe-api-unavailable' },
  };
}

/**
 * @param {HTMLImageElement} image
 * @returns {number}
 */
function computeBlurScore(image) {
  if (typeof document === 'undefined') return 0;
  const canvas = document.createElement('canvas');
  const width = Math.max(64, Math.min(256, image.naturalWidth || image.width || 128));
  const height = Math.max(64, Math.min(256, image.naturalHeight || image.height || 128));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.drawImage(image, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);

  for (let i = 0; i < gray.length; i++) {
    const px = i * 4;
    gray[i] = 0.299 * img.data[px] + 0.587 * img.data[px + 1] + 0.114 * img.data[px + 2];
  }

  const lap = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const value =
        gray[idx - width] +
        gray[idx - 1] -
        4 * gray[idx] +
        gray[idx + 1] +
        gray[idx + width];
      lap.push(value);
    }
  }

  if (lap.length === 0) return 0;
  const mean = lap.reduce((acc, v) => acc + v, 0) / lap.length;
  const variance = lap.reduce((acc, v) => acc + (v - mean) ** 2, 0) / lap.length;
  return Number(variance.toFixed(2));
}

/**
 * @param {HTMLImageElement} image
 * @param {{ x: number, y: number, width: number, height: number }} bbox
 * @returns {string}
 */
function cropFaceFromImage(image, bbox) {
  if (typeof document === 'undefined') return '';
  const sourceW = image.naturalWidth || image.width || 1;
  const sourceH = image.naturalHeight || image.height || 1;
  const x = Math.floor(clamp01(bbox.x) * sourceW);
  const y = Math.floor(clamp01(bbox.y) * sourceH);
  const w = Math.floor(clamp01(bbox.width) * sourceW);
  const h = Math.floor(clamp01(bbox.height) * sourceH);
  if (w < 12 || h < 12) return '';

  const expand = 0.22;
  const ex = Math.max(0, Math.floor(x - w * expand));
  const ey = Math.max(0, Math.floor(y - h * expand));
  const ew = Math.min(sourceW - ex, Math.floor(w * (1 + expand * 2)));
  const eh = Math.min(sourceH - ey, Math.floor(h * (1 + expand * 2)));

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#f2f3f5';
  ctx.fillRect(0, 0, 512, 512);
  ctx.drawImage(image, ex, ey, ew, eh, 0, 0, 512, 512);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * @param {string} dataUrl
 * @param {number} targetSize
 * @returns {Promise<string>}
 */
async function createThumbnailDataUrl(dataUrl, targetSize = 320) {
  if (!dataUrl || typeof document === 'undefined') return '';
  const image = await safeLoadImage(dataUrl);
  if (!image) return '';
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#f4f5f7';
  ctx.fillRect(0, 0, targetSize, targetSize);

  const sourceW = image.naturalWidth || image.width || 1;
  const sourceH = image.naturalHeight || image.height || 1;
  const ratio = Math.min(targetSize / sourceW, targetSize / sourceH);
  const drawW = Math.floor(sourceW * ratio);
  const drawH = Math.floor(sourceH * ratio);
  const dx = Math.floor((targetSize - drawW) / 2);
  const dy = Math.floor((targetSize - drawH) / 2);
  ctx.drawImage(image, 0, 0, sourceW, sourceH, dx, dy, drawW, drawH);
  return canvas.toDataURL('image/webp', 0.9);
}

/**
 * @param {string} dataUrl
 * @param {string} [referenceDataUrl]
 * @returns {Promise<string>}
 */
async function normalizeLookFaceAsset(dataUrl, referenceDataUrl = '') {
  if (!dataUrl || typeof document === 'undefined') return '';
  const image = await safeLoadImage(dataUrl);
  if (!image) return '';

  const referenceImage = referenceDataUrl ? await safeLoadImage(referenceDataUrl) : null;
  const tone = sampleImageTone(referenceImage || image);

  const sourceW = image.naturalWidth || image.width || 1;
  const sourceH = image.naturalHeight || image.height || 1;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, `rgba(${Math.round(tone.r + 18)}, ${Math.round(tone.g + 20)}, ${Math.round(tone.b + 24)}, 0.95)`);
  bg.addColorStop(1, `rgba(${Math.max(30, Math.round(tone.r - 40))}, ${Math.max(32, Math.round(tone.g - 38))}, ${Math.max(34, Math.round(tone.b - 34))}, 0.98)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const target = 610;
  const ratio = Math.min((canvas.width * 0.8) / sourceW, target / sourceH);
  const drawW = Math.max(1, Math.floor(sourceW * ratio));
  const drawH = Math.max(1, Math.floor(sourceH * ratio));
  const dx = Math.floor((canvas.width - drawW) / 2);
  const dy = Math.floor(Math.max(36, canvas.height * 0.12));

  const subject = document.createElement('canvas');
  subject.width = drawW;
  subject.height = drawH;
  const subjectCtx = subject.getContext('2d');
  if (!subjectCtx) return '';
  subjectCtx.drawImage(image, 0, 0, sourceW, sourceH, 0, 0, drawW, drawH);

  const matte = subjectCtx.createRadialGradient(drawW / 2, drawH * 0.44, drawW * 0.16, drawW / 2, drawH * 0.54, drawW * 0.58);
  matte.addColorStop(0, 'rgba(255,255,255,1)');
  matte.addColorStop(0.76, 'rgba(255,255,255,0.95)');
  matte.addColorStop(1, 'rgba(255,255,255,0.12)');
  subjectCtx.globalCompositeOperation = 'destination-in';
  subjectCtx.fillStyle = matte;
  subjectCtx.fillRect(0, 0, drawW, drawH);
  subjectCtx.globalCompositeOperation = 'source-over';

  ctx.filter = 'blur(14px)';
  ctx.globalAlpha = 0.24;
  ctx.drawImage(subject, dx + 4, dy + 10, drawW, drawH);
  ctx.globalAlpha = 1;
  ctx.filter = 'contrast(1.08) saturate(1.1) brightness(1.03)';
  ctx.drawImage(subject, dx, dy, drawW, drawH);
  ctx.filter = 'none';

  const topGlow = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.18, 8, canvas.width * 0.5, canvas.height * 0.18, canvas.width * 0.5);
  topGlow.addColorStop(0, 'rgba(255,255,255,0.2)');
  topGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/png');
}

/**
 * @param {HTMLImageElement} image
 * @returns {{ r: number, g: number, b: number }}
 */
function sampleImageTone(image) {
  if (typeof document === 'undefined') {
    return { r: 181, g: 171, b: 165 };
  }
  const w = Math.max(1, Math.floor((image.naturalWidth || image.width || 1) / 4));
  const h = Math.max(1, Math.floor((image.naturalHeight || image.height || 1) / 4));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { r: 181, g: 171, b: 165 };
  try {
    ctx.drawImage(image, 0, 0, w, h);
    const x = Math.max(0, Math.min(w - 1, Math.floor(w * 0.5)));
    const y = Math.max(0, Math.min(h - 1, Math.floor(h * 0.42)));
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    return {
      r: Number(pixel[0] || 181),
      g: Number(pixel[1] || 171),
      b: Number(pixel[2] || 165),
    };
  } catch {
    return { r: 181, g: 171, b: 165 };
  }
}

/**
 * @param {import('../models/garment.js').GarmentCategory} category
 * @param {string} title
 * @param {string} [subcategory]
 * @returns {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'}
 */
function inferBodySlotForExtracted(category, title, subcategory = '') {
  if (category === 'pants') return 'legs';
  if (category === 'socks') return 'socks';
  if (category === 'shoes') return 'feet';
  if (category === 'base' || category === 'shirt' || category === 'sweater' || category === 'outerwear' || category === 'dress') return 'torso';

  const marker = `${title || ''} ${subcategory || ''}`.toLowerCase();
  if (/\b(hat|cap|beanie|helmet|headband|headwear)\b/.test(marker)) return 'head';
  if (/\b(belt)\b/.test(marker)) return 'accessory';
  return 'accessory';
}

/**
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement | null>}
 */
async function safeLoadImage(dataUrl) {
  try {
    return await dataUrlToImage(dataUrl);
  } catch {
    return null;
  }
}

/**
 * @param {string} dataUrl
 * @returns {{ mimeType: string, data: string }}
 */
function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
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
 * @returns {boolean}
 */
function isImageDataUrl(dataUrl) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(String(dataUrl || ''));
}

/**
 * @param {string} dataUrl
 * @returns {Promise<Blob>}
 */
async function dataUrlToBlob(dataUrl) {
  const base64Match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (base64Match) {
    const mimeType = base64Match[1];
    const base64 = base64Match[2];

    /** @type {number[]} */
    const bytes = [];
    if (typeof atob === 'function') {
      try {
        const binary = atob(base64);
        for (let i = 0; i < binary.length; i++) {
          bytes.push(binary.charCodeAt(i));
        }
      } catch {
        const encoded = new TextEncoder().encode(base64);
        for (let i = 0; i < encoded.length; i++) {
          bytes.push(encoded[i]);
        }
      }
    } else {
      const runtime = /** @type {any} */ (globalThis);
      if (!runtime.Buffer) throw new Error('Base64 decoding is not supported in this runtime.');
      /** @type {any} */
      let buffer = null;
      try {
        buffer = runtime.Buffer.from(base64, 'base64');
      } catch {
        buffer = runtime.Buffer.from(base64, 'utf8');
      }
      for (let i = 0; i < buffer.length; i++) {
        bytes.push(buffer[i]);
      }
    }

    return new Blob([new Uint8Array(bytes)], { type: mimeType });
  }

  const plainMatch = dataUrl.match(/^data:([^;,]+),(.+)$/);
  if (plainMatch) {
    const mimeType = plainMatch[1];
    const payload = decodeURIComponent(plainMatch[2]);
    return new Blob([payload], { type: mimeType });
  }

  throw new Error('Unsupported data URL format.');
}

/**
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image.'));
    img.src = dataUrl;
  });
}

/**
 * @param {string} hex
 * @returns {string}
 */
function normalizeHexColor(hex) {
  const normalized = hex.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9A-F]{3}$/.test(normalized)) {
    const chars = normalized.slice(1).split('');
    return `#${chars.map(ch => ch + ch).join('')}`;
  }
  return '#808080';
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeColorToken(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const hex = normalizeHexColor(normalized);
  if (hex !== '#808080' || /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
    return hex;
  }

  const marker = normalized.toLowerCase();
  if (/black|charcoal/.test(marker)) return '#222222';
  if (/white|ivory|cream/.test(marker)) return '#F4F0E8';
  if (/gray|grey|silver/.test(marker)) return '#8E949E';
  if (/beige|camel|tan/.test(marker)) return '#D8C3A5';
  if (/brown/.test(marker)) return '#8A5A3B';
  if (/navy/.test(marker)) return '#233B6E';
  if (/blue|denim/.test(marker)) return '#4A90D9';
  if (/olive|green/.test(marker)) return '#4A8F63';
  if (/red|burgundy/.test(marker)) return '#B84A4A';
  if (/pink|rose/.test(marker)) return '#E78AB8';
  if (/purple|lilac/.test(marker)) return '#8B73C7';
  if (/orange|rust|terracotta/.test(marker)) return '#C9713D';
  if (/yellow|mustard/.test(marker)) return '#D1A620';
  return '#808080';
}

/**
 * @param {import('../models/garment.js').GarmentCategory} category
 * @returns {string}
 */
function buildCategoryTitle(category) {
  const names = {
    base: 'Base Layer',
    shirt: 'Shirt',
    sweater: 'Sweater',
    outerwear: 'Outerwear',
    dress: 'Dress',
    pants: 'Pants',
    socks: 'Socks',
    shoes: 'Shoes',
    accessory: 'Accessory',
  };
  return names[category] || 'Garment';
}

/**
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * @param {string} mimeType
 * @returns {'jpg' | 'jpeg' | 'png' | 'webp'}
 */
function guessImageExtension(mimeType) {
  const lower = mimeType.toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('jpeg')) return 'jpeg';
  if (lower.includes('jpg')) return 'jpg';
  return 'jpg';
}

/**
 * @param {string} dataUrl
 * @returns {Promise<{ valid: boolean, mimeType: string, hasTransparency: boolean | null, reason?: string }>}
 */
async function validateProcessedTransparentAsset(dataUrl) {
  const mimeType = readDataUrlMimeType(dataUrl);
  if (!mimeType) {
    return { valid: false, mimeType: '', hasTransparency: null, reason: 'Processed asset is not a data URL.' };
  }

  if (!mimeType.includes('png')) {
    return { valid: false, mimeType, hasTransparency: null, reason: `Expected PNG output, got ${mimeType}.` };
  }

  const hasTransparency = await detectTransparencyInDataUrl(dataUrl);
  if (hasTransparency === false) {
    return {
      valid: false,
      mimeType,
      hasTransparency: false,
      reason: 'Output PNG has no transparent pixels (likely white/raw background).',
    };
  }

  return {
    valid: true,
    mimeType,
    hasTransparency,
  };
}

/**
 * @param {string} dataUrl
 * @returns {string}
 */
function readDataUrlMimeType(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,/i);
  return match ? String(match[1] || '').toLowerCase() : '';
}

/**
 * @param {string} dataUrl
 * @returns {Promise<boolean | null>}
 */
async function detectTransparencyInDataUrl(dataUrl) {
  if (!dataUrl || typeof document === 'undefined') return null;
  const image = await safeLoadImage(dataUrl);
  if (!image) return null;
  const sourceW = image.naturalWidth || image.width || 0;
  const sourceH = image.naturalHeight || image.height || 0;
  if (!sourceW || !sourceH) return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(256, sourceW));
  canvas.height = Math.max(1, Math.min(256, sourceH));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    ctx.drawImage(image, 0, 0, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let samples = 0;
    let transparentSamples = 0;
    for (let i = 3; i < pixels.length; i += 16) {
      samples += 1;
      if (pixels[i] < 250) transparentSamples += 1;
    }
    if (samples === 0) return null;
    const transparentRatio = transparentSamples / samples;
    return transparentRatio >= 0.002;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @param {number} [maxLength]
 * @returns {string}
 */
function truncateForLog(value, maxLength = 180) {
  const text = String(value || '').replace(/^\uFEFF/, '').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

/**
 * @param {string} url
 * @returns {string}
 */
function toLogAssetRef(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('data:image/')) {
    return `${value.slice(0, 26)}...(${value.length} chars)`;
  }
  return value.length > 180 ? `${value.slice(0, 180)}...` : value;
}

/**
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} event
 * @param {Record<string, any>} payload
 */
function logPipeline(level, event, payload = {}) {
  const data = { event, ...payload };
  if (level === 'error') {
    console.error('[cv-pipeline]', data);
    return;
  }
  if (level === 'warn') {
    console.warn('[cv-pipeline]', data);
    return;
  }
  console.info('[cv-pipeline]', data);
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @param {string} str
 * @returns {number}
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Builds a portrait avatar from the uploaded user photo.
 * Keeps the real face/skin instead of replacing with a silhouette.
 *
 * @param {string} dataUrl
 * @returns {Promise<string>}
 */
async function createPortraitAvatar(dataUrl) {
  if (typeof document === 'undefined') return dataUrl;

  try {
    const image = await dataUrlToImage(dataUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return dataUrl;

    const cropSize = Math.min(width, height);
    const sx = Math.max(0, Math.floor((width - cropSize) / 2));
    const sy = Math.max(0, Math.floor((height - cropSize) / 2));

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    ctx.fillStyle = '#f2f3f5';
    ctx.fillRect(0, 0, 640, 640);
    ctx.filter = 'contrast(1.06) saturate(1.08)';
    ctx.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, 640, 640);
    ctx.filter = 'none';

    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return dataUrl;
  }
}

