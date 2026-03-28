import type {
  BackgroundRemovalResult,
  FaceValidationResult,
  UploadClassificationResult,
  UploadInputType,
  WardrobeItem,
} from '../types/models';
import { buildWardrobeItem, normalizeWardrobeCategory } from './wardrobe';

export function normalizeUploadClassification(input: Partial<UploadClassificationResult>): UploadClassificationResult {
  const rawType = String(input.inputType || '').trim().toLowerCase();
  const inputType = normalizeInputType(rawType);
  return {
    inputType,
    confidence: clamp01(input.confidence ?? 0),
    reason: String(input.reason || fallbackReason(inputType)),
    metrics: input.metrics,
  };
}

export function createFaceValidationFallback(input: {
  uri: string;
  error?: string;
  warnings?: string[];
}): FaceValidationResult {
  return {
    success: !input.error,
    faceDetected: !input.error,
    source: 'fallback',
    avatarUrl: input.uri,
    croppedFaceUrl: input.uri,
    error: input.error,
    warnings: input.warnings || [],
    qualityScore: input.error ? 0 : 0.65,
  };
}

export function createBackgroundRemovalFallback(input: {
  uri: string;
  success?: boolean;
  error?: string;
}): BackgroundRemovalResult {
  return {
    success: input.success ?? !input.error,
    provider: 'fallback',
    backgroundRemoved: Boolean(input.success),
    imageDataUrl: input.uri,
    error: input.error,
  };
}

export function createWardrobeItemFromUpload(input: {
  title: string;
  category: string;
  uri: string;
  colors?: string[];
  confidence?: number;
}): WardrobeItem {
  const normalizedCategory = normalizeWardrobeCategory(input.category) || 'shirt';
  const primaryColor = input.colors?.[0] || '';
  return buildWardrobeItem({
    name: input.title,
    category: normalizedCategory,
    imageUrl: input.uri,
    thumbnailUrl: input.uri,
    sourceType: 'single_item',
    colors: input.colors || [],
    color: primaryColor,
    confidence: input.confidence ?? 0.7,
    extractionConfidence: input.confidence ?? 0.7,
    backgroundRemoved: false,
    requiresReview: (input.confidence ?? 0.7) < 0.72,
  });
}

function normalizeInputType(value: string): UploadInputType {
  switch (value) {
    case 'single_item':
    case 'person_outfit':
    case 'unsupported':
    case 'uncertain':
      return value;
    default:
      return 'uncertain';
  }
}

function fallbackReason(inputType: UploadInputType): string {
  switch (inputType) {
    case 'single_item':
      return 'Upload looks like a single wardrobe item.';
    case 'person_outfit':
      return 'Upload includes a full-person outfit.';
    case 'unsupported':
      return 'Upload type is not supported.';
    case 'uncertain':
    default:
      return 'Upload type could not be classified confidently.';
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
