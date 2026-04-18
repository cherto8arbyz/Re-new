import type { PickedImageAsset } from './image-picker';
import { resolveNativeBackendBaseUrl } from './backend-url';

const LOOK_FACE_TIMEOUT_MS = 45000;

export interface LookFaceGenerationResult {
  success: boolean;
  imageDataUrl: string;
  provider: 'image_pipeline';
  error: string | null;
}

export async function generateLookFaceAssetAsync(
  asset: PickedImageAsset,
): Promise<LookFaceGenerationResult> {
  const baseUrl = resolveNativeBackendBaseUrl({
    preferProxy: false,
    allowDevLocalFallback: true,
  });
  if (!baseUrl) {
    return {
      success: false,
      imageDataUrl: '',
      provider: 'image_pipeline',
      error: 'Image pipeline URL is not configured.',
    };
  }

  const uri = String(asset.uri || '').trim();
  if (!uri) {
    return {
      success: false,
      imageDataUrl: '',
      provider: 'image_pipeline',
      error: 'Avatar source image is missing.',
    };
  }

  const formData = new FormData();
  formData.append('file', {
    uri,
    name: buildImageFileName(asset.fileName),
    type: resolveImageMimeType(asset.mimeType),
  } as unknown as Blob);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), LOOK_FACE_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${baseUrl}/api/image/look-face-generate`, {
      method: 'POST',
      body: formData,
      signal: controller?.signal,
    });
    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      return {
        success: false,
        imageDataUrl: '',
        provider: 'image_pipeline',
        error: String(payload?.error || `Look face generation error (${response.status}).`),
      };
    }

    const imageDataUrl = String(payload?.look_face_url || payload?.look_face_data_url || '').trim();
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
      error: typeof payload?.error === 'string' ? payload.error : null,
    };
  } catch (error) {
    const isTimeout = typeof DOMException !== 'undefined'
      && error instanceof DOMException
      && error.name === 'AbortError';

    return {
      success: false,
      imageDataUrl: '',
      provider: 'image_pipeline',
      error: isTimeout
        ? `Look face generation timed out after ${LOOK_FACE_TIMEOUT_MS} ms.`
        : `Look face generation request failed: ${String((error as Error)?.message || 'unknown error')}`,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function buildImageFileName(fileName: string | null | undefined): string {
  const raw = String(fileName || '').trim().replace(/\.[^.]+$/, '');
  const safeBase = raw
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${safeBase || `avatar-${Date.now()}`}.jpg`;
}

function resolveImageMimeType(mimeType: string | null | undefined): string {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (normalized === 'image/png' || normalized === 'image/webp') return normalized;
  return 'image/jpeg';
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
