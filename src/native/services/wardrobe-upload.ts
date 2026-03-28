import { buildWardrobeItem, normalizeWardrobeCategory } from '../../shared/wardrobe';
import {
  isStrongBlockedUploadReason,
  runWardrobeUploadBatch,
  shouldRetryWardrobeUploadAsSingleItem,
} from '../../services/wardrobe-upload-flow.js';
import { extractWardrobeFromUpload } from '../../services/cv-service.js';
import type { WardrobeItem } from '../../types/models';
import type { PickedImageAsset } from './image-picker';

const MIN_ITEM_CONFIDENCE = 0.45;
const INVALID_UPLOAD_ERROR = 'Upload only clothing, shoes, or wearable accessories.';
const BLOCKED_UPLOAD_KEYWORDS = /\b(selfie|portrait|face only|full person|person outfit|interior|living room|bedroom|kitchen|room|pet|dog|cat|food|landscape|mountain|beach|sunset|screenshot|screen grab|keyboard|monitor|mug|bottle)\b/i;
const WEARABLE_UPLOAD_KEYWORDS = /\b(top|t[\s-]?shirt|tee|shirt|blouse|hoodie|sweatshirt|sweater|cardigan|knitwear|jacket|coat|blazer|outerwear|dress|jumpsuit|romper|jeans|trousers?|pants|shorts?|skirt|leggings|sneakers?|shoes?|boots?|heels?|sandals?|loafers?|flats?|slippers?|socks?|hat|cap|beanie|bag|handbag|shoulder bag|backpack|mini bag|scarf|belt|jewelry|jewellery|sunglasses|eyewear|gloves|headphones?|headset|earbuds?|earrings?)\b/i;

interface ExtractedWardrobeCandidate {
  title: string;
  category: WardrobeItem['category'];
  subcategory: string;
  colors: string[];
  thumbnailUrl: string;
  sourceType: WardrobeItem['sourceType'];
  backgroundRemoved: boolean;
  extractionConfidence: number;
  confidence: number;
  requiresReview: boolean;
  bodySlot?: WardrobeItem['bodySlot'];
  positionOffsetX?: number;
  positionOffsetY?: number;
  processedImageUrl?: string;
  rawImageFallback?: boolean;
  metadata?: Record<string, unknown>;
}

interface UploadExtractionResult {
  success?: boolean;
  status?: 'success' | 'partial' | 'failed' | 'unsupported' | 'uncertain';
  error?: string | null;
  inputType: 'single_item' | 'person_outfit' | 'unsupported' | 'uncertain';
  classification: {
    reason: string;
    metrics?: Record<string, unknown>;
  };
  autoApproved: ExtractedWardrobeCandidate[];
  requiresReview: ExtractedWardrobeCandidate[];
}

export interface WardrobeUploadAnalysis {
  item: WardrobeItem;
  note: string;
}

export interface WardrobeUploadReviewEntry {
  id: string;
  asset: PickedImageAsset;
  status: 'queued' | 'analyzing' | 'ready' | 'invalid';
  item: WardrobeItem | null;
  note: string;
  error: string;
}

export interface WardrobeUploadBatchSummary {
  total: number;
  ready: number;
  invalid: number;
  analyzing: number;
  queued: number;
}

export async function analyzeWardrobeUpload(asset: PickedImageAsset): Promise<{ success: true; analysis: WardrobeUploadAnalysis } | { success: false; error: string }> {
  try {
    const dataUrl = await assetToDataUrl(asset);
    const rawExtraction = await extractWardrobeFromUpload(dataUrl, {
      persist: false,
      sourceFileName: asset.fileName || undefined,
    }) as UploadExtractionResult;
    let extraction = normalizeExtractionResult(rawExtraction);
    let candidate = extraction.autoApproved[0] || extraction.requiresReview[0];

    // Native wardrobe add flow is item-first. If routing misclassifies the upload,
    // retry once in explicit single-item mode before rejecting the image.
    if (shouldRetryWardrobeUploadAsSingleItem(extraction.classification, Boolean(candidate))) {
      const retryRawExtraction = await extractWardrobeFromUpload(dataUrl, {
        persist: false,
        sourceFileName: asset.fileName || undefined,
        inputTypeHint: 'single_item',
      }) as UploadExtractionResult;
      const retryExtraction = normalizeExtractionResult(retryRawExtraction);
      const retryCandidate = retryExtraction.autoApproved[0] || retryExtraction.requiresReview[0];
      if (retryCandidate || !isStrongBlockedUploadReason(retryExtraction.classification)) {
        extraction = retryExtraction;
        candidate = retryCandidate;
      }
    }

    const acceptedCandidate = candidate && candidate.confidence >= MIN_ITEM_CONFIDENCE && isAcceptedWearableCandidate(candidate)
      ? candidate
      : null;
    const fallbackItem = !acceptedCandidate && shouldUseReviewFallback(extraction, asset, candidate)
      ? buildReviewFallbackItem(asset, extraction, candidate)
      : null;
    if (extraction.status === 'unsupported' || extraction.inputType === 'person_outfit' || extraction.inputType === 'unsupported') {
      return { success: false, error: resolveUploadErrorMessage(extraction) };
    }

    if (!acceptedCandidate && !fallbackItem) {
      return { success: false, error: resolveUploadErrorMessage(extraction) };
    }

    const item = acceptedCandidate
      ? buildWardrobeItem({
          name: acceptedCandidate.title || '',
          title: acceptedCandidate.title || '',
          category: acceptedCandidate.category,
          subcategory: acceptedCandidate.subcategory,
          colors: acceptedCandidate.colors,
          imageUrl: asset.uri,
          thumbnailUrl: acceptedCandidate.thumbnailUrl || asset.uri,
          originalUrl: asset.uri,
          processedImageUrl: acceptedCandidate.processedImageUrl,
          sourceType: acceptedCandidate.sourceType || 'single_item',
          backgroundRemoved: acceptedCandidate.backgroundRemoved,
          extractionConfidence: acceptedCandidate.extractionConfidence,
          confidence: acceptedCandidate.confidence,
          requiresReview: acceptedCandidate.requiresReview,
          bodySlot: acceptedCandidate.bodySlot,
          positionOffsetX: acceptedCandidate.positionOffsetX,
          positionOffsetY: acceptedCandidate.positionOffsetY,
          rawImageFallback: acceptedCandidate.rawImageFallback,
          metadata: {
            ...(acceptedCandidate.metadata || {}),
            uploadInputType: extraction.inputType,
            classificationReason: extraction.classification.reason,
            localAssetUri: asset.uri,
          },
        })
      : fallbackItem!;

    return {
      success: true,
      analysis: {
        item,
        note: fallbackItem
          ? buildFallbackReviewNote(extraction)
          : buildAcceptedItemReviewNote(item),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error && error.message
        ? error.message
        : 'Failed to analyze the selected image.',
    };
  }
}

export async function analyzeWardrobeUploadBatch(
  assets: PickedImageAsset[],
  onProgress?: (entries: WardrobeUploadReviewEntry[], summary: WardrobeUploadBatchSummary, activeIndex: number) => void,
): Promise<WardrobeUploadReviewEntry[]> {
  return runWardrobeUploadBatch(assets, {
    analyze: analyzeWardrobeUpload,
    onProgress,
  }) as Promise<WardrobeUploadReviewEntry[]>;
}

function normalizeExtractionResult(input: Partial<UploadExtractionResult> | null | undefined): UploadExtractionResult {
  return {
    success: input?.success === true,
    status: input?.status === 'success' || input?.status === 'partial' || input?.status === 'failed' || input?.status === 'unsupported' || input?.status === 'uncertain'
      ? input.status
      : 'failed',
    error: typeof input?.error === 'string' ? input.error : null,
    inputType: input?.inputType === 'single_item' || input?.inputType === 'person_outfit' || input?.inputType === 'unsupported' || input?.inputType === 'uncertain'
      ? input.inputType
      : 'uncertain',
    classification: {
      reason: String(input?.classification?.reason || ''),
      metrics: input?.classification?.metrics && typeof input.classification.metrics === 'object'
        ? input.classification.metrics
        : undefined,
    },
    autoApproved: Array.isArray(input?.autoApproved) ? input.autoApproved : [],
    requiresReview: Array.isArray(input?.requiresReview) ? input.requiresReview : [],
  };
}

function isAcceptedWearableCandidate(candidate: ExtractedWardrobeCandidate): boolean {
  if (!candidate) return false;
  if (!['base', 'shirt', 'sweater', 'outerwear', 'dress', 'pants', 'socks', 'shoes', 'accessory'].includes(candidate.category)) {
    return false;
  }

  const marker = `${candidate.title || ''} ${candidate.subcategory || ''} ${candidate.metadata?.sourceFileName || ''}`.toLowerCase();
  const blocked = /\b(selfie|portrait|face only|interior|living room|bedroom|kitchen|pet|dog|cat|food|landscape|screenshot|keyboard|monitor|bottle|mug)\b/i;
  if (blocked.test(marker)) return false;

  const wearable = /\b(top|t-shirt|tee|shirt|blouse|hoodie|sweatshirt|sweater|cardigan|knitwear|jacket|coat|blazer|dress|jumpsuit|jeans|trousers|pants|shorts|skirt|leggings|sneakers|shoes|boots|heels|sandals|loafers|flats|slippers|socks|hat|cap|beanie|bag|handbag|shoulder bag|backpack|mini bag|scarf|belt|jewelry|jewellery|sunglasses|eyewear|gloves|headphones|headset|earbuds|earrings)\b/i;
  return wearable.test(marker) || candidate.category === 'dress';
}

function shouldUseReviewFallback(
  extraction: UploadExtractionResult,
  asset: PickedImageAsset,
  candidate?: ExtractedWardrobeCandidate,
): boolean {
  if (isAiValidationFailure(extraction)) {
    return false;
  }

  if (!(extraction.inputType === 'single_item' || extraction.inputType === 'uncertain')) {
    return false;
  }

  const marker = buildUploadMarker(asset, extraction, candidate);
  if (BLOCKED_UPLOAD_KEYWORDS.test(marker)) {
    return false;
  }

  return extraction.inputType === 'single_item' || WEARABLE_UPLOAD_KEYWORDS.test(marker);
}

function buildReviewFallbackItem(
  asset: PickedImageAsset,
  extraction: UploadExtractionResult,
  candidate?: ExtractedWardrobeCandidate,
): WardrobeItem {
  const marker = buildUploadMarker(asset, extraction, candidate);
  const category = normalizeWardrobeCategory(marker) ?? 'shirt';
  const subcategory = inferFallbackSubcategory(marker, category);
  const colors = inferFallbackColors(marker);

  return buildWardrobeItem({
    name: asset.fileName || candidate?.title || '',
    title: asset.fileName || candidate?.title || '',
    category,
    subcategory,
    colors,
    imageUrl: asset.uri,
    thumbnailUrl: asset.uri,
    originalUrl: asset.uri,
    sourceType: 'single_item',
    backgroundRemoved: false,
    extractionConfidence: MIN_ITEM_CONFIDENCE + 0.01,
    confidence: MIN_ITEM_CONFIDENCE + 0.01,
    requiresReview: true,
    rawImageFallback: true,
    metadata: {
      uploadInputType: extraction.inputType,
      classificationReason: extraction.classification.reason,
      localAssetUri: asset.uri,
      sourceFileName: asset.fileName || null,
      reviewFallback: true,
      reviewReason: 'Automated classification was inconclusive.',
    },
  });
}

function buildFallbackReviewNote(extraction: UploadExtractionResult): string {
  if (isAiValidationFailure(extraction)) {
    return `${extraction.error || extraction.classification.reason || 'AI validation is temporarily unavailable.'} Item kept in review using local fallback detection.`;
  }
  const base = extraction.classification.reason || 'Automated classification was inconclusive.';
  return `${base} Review the detected category before saving.`;
}

function buildAcceptedItemReviewNote(item: WardrobeItem): string {
  const segmentationError = String(item.metadata?.segmentationError || '').trim();
  if (segmentationError) {
    return 'Background cleanup failed, so the original image will be used as fallback.';
  }
  return '';
}

function buildUploadMarker(
  asset: PickedImageAsset,
  extraction: UploadExtractionResult,
  candidate?: ExtractedWardrobeCandidate,
): string {
  return [
    asset.fileName,
    candidate?.title,
    candidate?.subcategory,
    candidate?.category,
    extraction.classification.reason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

function inferFallbackSubcategory(marker: string, category: WardrobeItem['category']): string {
  const rules: { pattern: RegExp; label: string; categories: WardrobeItem['category'][] }[] = [
    { pattern: /\b(t[\s-]?shirt|tee)\b/i, label: 't-shirt', categories: ['shirt', 'base'] },
    { pattern: /\b(top|tank|cami)\b/i, label: 'top', categories: ['shirt', 'base'] },
    { pattern: /\bblouse\b/i, label: 'blouse', categories: ['shirt'] },
    { pattern: /\bhoodie\b/i, label: 'hoodie', categories: ['sweater'] },
    { pattern: /\bsweatshirt\b/i, label: 'sweatshirt', categories: ['sweater'] },
    { pattern: /\bcardigan\b/i, label: 'cardigan', categories: ['sweater'] },
    { pattern: /\bsweater\b/i, label: 'sweater', categories: ['sweater'] },
    { pattern: /\bjacket\b/i, label: 'jacket', categories: ['outerwear'] },
    { pattern: /\bcoat\b/i, label: 'coat', categories: ['outerwear'] },
    { pattern: /\bblazer\b/i, label: 'blazer', categories: ['outerwear'] },
    { pattern: /\bdress\b/i, label: 'dress', categories: ['dress'] },
    { pattern: /\bjumpsuit\b/i, label: 'jumpsuit', categories: ['dress'] },
    { pattern: /\bwide[\s-]?leg\s+jeans?\b/i, label: 'wide-leg jeans', categories: ['pants'] },
    { pattern: /\bjeans\b/i, label: 'jeans', categories: ['pants'] },
    { pattern: /\btrousers?\b/i, label: 'trousers', categories: ['pants'] },
    { pattern: /\bskirt\b/i, label: 'skirt', categories: ['pants'] },
    { pattern: /\bshorts?\b/i, label: 'shorts', categories: ['pants'] },
    { pattern: /\bpants?\b/i, label: 'pants', categories: ['pants'] },
    { pattern: /\bsneakers?\b/i, label: 'sneakers', categories: ['shoes'] },
    { pattern: /\bboots?\b/i, label: 'boots', categories: ['shoes'] },
    { pattern: /\bsandals?\b/i, label: 'sandals', categories: ['shoes'] },
    { pattern: /\bheels?\b/i, label: 'heels', categories: ['shoes'] },
    { pattern: /\bsocks?\b/i, label: 'socks', categories: ['socks'] },
    { pattern: /\b(cap|trucker cap|baseball cap)\b/i, label: 'cap', categories: ['accessory'] },
    { pattern: /\b(hat|beanie|beret)\b/i, label: 'hat', categories: ['accessory'] },
    { pattern: /\b(mini bag|shoulder bag|crossbody bag)\b/i, label: 'shoulder bag', categories: ['accessory'] },
    { pattern: /\b(handbag|purse)\b/i, label: 'handbag', categories: ['accessory'] },
    { pattern: /\bbackpack\b/i, label: 'backpack', categories: ['accessory'] },
    { pattern: /\bbag\b/i, label: 'bag', categories: ['accessory'] },
    { pattern: /\bscarf\b/i, label: 'scarf', categories: ['accessory'] },
    { pattern: /\bbelt\b/i, label: 'belt', categories: ['accessory'] },
    { pattern: /\b(sunglasses|eyewear|glasses)\b/i, label: 'eyewear', categories: ['accessory'] },
    { pattern: /\b(headphones?|headset|earbuds?|airpods?)\b/i, label: 'headphones', categories: ['accessory'] },
    { pattern: /\b(earrings?|ear cuff|stud earrings?)\b/i, label: 'earrings', categories: ['accessory'] },
    { pattern: /\b(gloves?)\b/i, label: 'gloves', categories: ['accessory'] },
  ];

  const match = rules.find(rule => rule.pattern.test(marker) && rule.categories.includes(category));
  return match?.label || '';
}

function inferFallbackColors(marker: string): string[] {
  const colors = [
    'black',
    'white',
    'gray',
    'grey',
    'silver',
    'blue',
    'navy',
    'green',
    'olive',
    'sage',
    'red',
    'burgundy',
    'pink',
    'purple',
    'orange',
    'yellow',
    'beige',
    'brown',
    'cream',
  ];
  const match = colors.find(color => new RegExp(`\\b${color}\\b`, 'i').test(marker));
  if (!match) return [];
  return [match === 'grey' ? 'gray' : match];
}

function resolveUploadErrorMessage(extraction: UploadExtractionResult): string {
  if (typeof extraction.error === 'string' && extraction.error.trim()) {
    return extraction.error.trim();
  }
  if (typeof extraction.classification.reason === 'string' && extraction.classification.reason.trim()) {
    return extraction.classification.reason.trim();
  }
  return INVALID_UPLOAD_ERROR;
}

function isAiValidationFailure(extraction: UploadExtractionResult): boolean {
  const marker = `${String(extraction.error || '')} ${String(extraction.classification.reason || '')}`.toLowerCase();
  return /\b(ai validation|gemini)\b/i.test(marker)
    && /\b(temporarily unavailable|unreadable result|request failed|failed)\b/i.test(marker);
}

async function assetToDataUrl(asset: PickedImageAsset): Promise<string> {
  const mimeType = asset.mimeType || guessMimeType(asset.fileName) || 'image/jpeg';
  const base64 = String(asset.base64 || '').trim();
  if (!base64) {
    throw new Error('Missing base64 payload for selected image.');
  }
  return `data:${mimeType};base64,${base64}`;
}

function guessMimeType(fileName?: string | null): string {
  const normalized = String(fileName || '').trim().toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.heic') || normalized.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}
