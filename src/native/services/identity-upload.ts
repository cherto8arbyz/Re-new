import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';

import type { PickedImageAsset } from './image-picker';
import { resolveNativeBackendBaseUrl } from './backend-url';
import {
  IDENTITY_IMAGE_MAX_DIMENSION,
  MAX_IDENTITY_UPLOAD_BYTES,
} from '../screens/identity-capture.logic';

const COMPRESSION_PRESETS = [
  { maxDimension: IDENTITY_IMAGE_MAX_DIMENSION, compress: 0.7 },
  { maxDimension: IDENTITY_IMAGE_MAX_DIMENSION, compress: 0.58 },
  { maxDimension: 896, compress: 0.55 },
  { maxDimension: 768, compress: 0.5 },
] as const;

const IDENTITY_UPLOAD_TIMEOUT_MS = 30000;

export interface PreparedIdentityPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/jpeg';
  fileName: string;
  previewUri: string;
}

export interface IdentityUploadResult {
  uploadedCount: number;
  referenceUrls: string[];
}

export class IdentityUploadError extends Error {
  failedIndex: number | null;
  errorCode: string | null;
  statusCode: number;

  constructor(message: string, statusCode: number, failedIndex: number | null = null, errorCode: string | null = null) {
    super(message);
    this.name = 'IdentityUploadError';
    this.statusCode = statusCode;
    this.failedIndex = failedIndex;
    this.errorCode = errorCode;
  }
}

export async function prepareIdentityPhotoForUploadAsync(
  asset: PickedImageAsset,
  sequenceNumber: number,
): Promise<PreparedIdentityPhoto> {
  if (!asset.uri) {
    throw new Error('Selected photo is missing a local URI.');
  }

  let lastKnownSizeBytes = 0;
  for (const preset of COMPRESSION_PRESETS) {
    const result = await manipulateAsync(
      asset.uri,
      buildNormalizeActions(asset, preset.maxDimension),
      {
        base64: true,
        compress: preset.compress,
        format: SaveFormat.JPEG,
      },
    );

    const sizeBytes = estimateBase64SizeBytes(result.base64);
    lastKnownSizeBytes = sizeBytes;
    if (sizeBytes > 0 && sizeBytes <= MAX_IDENTITY_UPLOAD_BYTES) {
      return {
        id: buildPreparedPhotoId(sequenceNumber),
        uri: result.uri,
        width: result.width,
        height: result.height,
        sizeBytes,
        mimeType: 'image/jpeg',
        fileName: buildUploadFileName(asset.fileName, sequenceNumber),
        previewUri: result.uri,
      };
    }
  }

  throw new Error(
    `Photo ${sequenceNumber} could not be compressed below ${formatBytes(MAX_IDENTITY_UPLOAD_BYTES)}. Last result: ${formatBytes(lastKnownSizeBytes)}.`,
  );
}

export async function uploadIdentityReferencePhotosAsync(input: {
  photos: PreparedIdentityPhoto[];
  accessToken: string;
}): Promise<IdentityUploadResult> {
  const baseUrl = resolveNativeBackendBaseUrl({ preferProxy: false });
  if (!baseUrl) {
    throw new Error('Image pipeline URL is not configured.');
  }

  const accessToken = String(input.accessToken || '').trim();
  if (!accessToken) {
    throw new Error('Authentication token is missing.');
  }

  const formData = new FormData();
  for (const photo of input.photos) {
    const filePart = {
      uri: photo.uri,
      name: photo.fileName,
      type: photo.mimeType,
    } as unknown as Blob;
    formData.append('files', filePart);
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), IDENTITY_UPLOAD_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${baseUrl}/api/v1/identity/upload-reference`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
      signal: controller?.signal,
    });

    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      throw buildIdentityUploadError(response.status, payload);
    }

    return {
      uploadedCount: Number(payload?.uploaded_count || 0),
      referenceUrls: Array.isArray(payload?.reference_urls)
        ? payload.reference_urls.map((value: unknown) => String(value || '')).filter(Boolean)
        : [],
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    throw new IdentityUploadError(
      isTimeout
        ? `Identity upload timed out after ${IDENTITY_UPLOAD_TIMEOUT_MS} ms. Check that Expo is using the current backend IP on this Wi-Fi network.`
        : `Identity upload request failed: ${String((error as Error)?.message || 'unknown error')}`,
      0,
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function buildNormalizeActions(asset: PickedImageAsset, maxDimension: number): Action[] {
  const width = Math.max(0, Math.trunc(asset.width || 0));
  const height = Math.max(0, Math.trunc(asset.height || 0));

  if (!width || !height) {
    return [{ rotate: 0 }];
  }

  const dominantDimension = Math.max(width, height);
  const targetDimension = Math.min(dominantDimension, maxDimension);
  if (width >= height) {
    return [{ resize: { width: targetDimension } }];
  }
  return [{ resize: { height: targetDimension } }];
}

function estimateBase64SizeBytes(base64Value?: string): number {
  const base64 = String(base64Value || '').trim();
  if (!base64) return 0;

  let paddingBytes = 0;
  if (base64.endsWith('==')) paddingBytes = 2;
  else if (base64.endsWith('=')) paddingBytes = 1;

  return Math.max(0, Math.floor((base64.length * 3) / 4) - paddingBytes);
}

function buildPreparedPhotoId(sequenceNumber: number): string {
  return `identity-photo-${Date.now()}-${sequenceNumber}`;
}

function buildUploadFileName(originalFileName: string | null | undefined, sequenceNumber: number): string {
  const normalized = String(originalFileName || '').trim().replace(/\.[^.]+$/, '');
  const safeBase = normalized
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

  return `${safeBase || `identity-${sequenceNumber}`}.jpg`;
}

function formatBytes(bytes: number): string {
  const normalized = Math.max(0, bytes);
  return `${(normalized / (1024 * 1024)).toFixed(2)} MB`;
}

async function parseJsonSafely(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    const payload = JSON.parse(text);
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function buildIdentityUploadError(statusCode: number, payload: Record<string, unknown> | null): IdentityUploadError {
  const detail = payload?.detail;
  if (detail && typeof detail === 'object') {
    const detailObject = detail as Record<string, unknown>;
    return new IdentityUploadError(
      String(detailObject.message || `Identity upload failed with status ${statusCode}.`),
      statusCode,
      typeof detailObject.failed_index === 'number' ? detailObject.failed_index : null,
      typeof detailObject.error_code === 'string' ? detailObject.error_code : null,
    );
  }

  return new IdentityUploadError(
    String(payload?.message || `Identity upload failed with status ${statusCode}.`),
    statusCode,
  );
}
