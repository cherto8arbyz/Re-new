import type { AvatarGender } from '../../types/models';
import { resolveNativeBackendBaseUrl } from './backend-url';

export type DailyLookJobStatus =
  | 'idle'
  | 'starting'
  | 'processing'
  | 'generating_base'
  | 'vton_iterating'
  | 'face_swap'
  | 'completed'
  | 'failed';

export interface DailyLookAvailableGarmentInput {
  garment_id: string;
  image_url: string;
  category: string;
  color?: string | string[];
  style_tags?: string[];
  name?: string;
}

export interface DailyLookWeatherContextInput {
  temperature_celsius: number;
  condition?: string;
  summary?: string;
  precipitation?: string;
  is_raining?: boolean;
  is_snowing?: boolean;
  location?: string;
  season?: string;
}

export interface DailyLookGenerateInput {
  accessToken: string;
  availableGarments: DailyLookAvailableGarmentInput[];
  weatherContext: DailyLookWeatherContextInput;
  gender?: AvatarGender;
}

export interface DailyLookGenerateResponse {
  jobId: string;
  status: DailyLookJobStatus;
  selectedGarmentIds: string[];
}

interface DailyLookRequestGarmentPayload {
  garment_id: string;
  image_url: string;
  category: string;
  name?: string;
  color?: string;
}

export interface DailyLookJobResponse {
  id: string;
  userId: string;
  status: DailyLookJobStatus;
  selectedGarmentIds: string[];
  weatherContext: Record<string, unknown>;
  prompt: string | null;
  finalImageUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export class DailyLookApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'DailyLookApiError';
    this.statusCode = statusCode;
  }
}

const uploadedDailyLookImageCache = new Map<string, string>();

export async function createDailyLookJobAsync(input: DailyLookGenerateInput): Promise<DailyLookGenerateResponse> {
  const baseUrl = resolveNativeBackendBaseUrl({ preferProxy: false });
  const accessToken = String(input.accessToken || '').trim();
  if (!baseUrl) {
    throw new DailyLookApiError('Image pipeline URL is not configured.', 0);
  }
  if (!accessToken) {
    throw new DailyLookApiError('Authentication token is missing.', 401);
  }

  const resolvedGarments = await resolveDailyLookGarmentsAsync(baseUrl, input.availableGarments);
  if (input.availableGarments.length > 0 && resolvedGarments.length === 0) {
    throw new DailyLookApiError(
      'Wardrobe images could not be synced to the image pipeline, so no paid AI request was sent. Reopen Wardrobe and try the garment upload again.',
      0,
    );
  }

  const response = await fetch(`${baseUrl}/api/v1/daily-look/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      ...(input.gender ? { gender: input.gender } : {}),
      weather_context: input.weatherContext,
      available_garments: resolvedGarments.map(normalizeDailyLookRequestGarment),
    }),
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw buildDailyLookApiError(response.status, payload);
  }

  return {
    jobId: String(payload?.job_id || ''),
    status: normalizeDailyLookJobStatus(payload?.status),
    selectedGarmentIds: normalizeStringArray(payload?.selected_garment_ids),
  };
}

async function resolveDailyLookGarmentsAsync(
  baseUrl: string,
  garments: DailyLookAvailableGarmentInput[],
): Promise<DailyLookAvailableGarmentInput[]> {
  const resolved = await Promise.all(garments.map(async garment => {
    const imageUrl = await ensureResolvableGarmentImageUrlAsync(baseUrl, garment.image_url, garment.garment_id);
    if (!imageUrl) return null;
    return {
      ...garment,
      image_url: imageUrl,
    };
  }));

  return resolved.filter((garment): garment is DailyLookAvailableGarmentInput => Boolean(garment));
}

function normalizeDailyLookRequestGarment(garment: DailyLookAvailableGarmentInput): DailyLookRequestGarmentPayload {
  const normalized: DailyLookRequestGarmentPayload = {
    garment_id: String(garment.garment_id || '').trim(),
    image_url: String(garment.image_url || '').trim(),
    category: String(garment.category || '').trim(),
  };

  const normalizedName = String(garment.name || '').trim();
  if (normalizedName) {
    normalized.name = normalizedName;
  }

  const normalizedColor = normalizeDailyLookColor(garment.color);
  if (normalizedColor) {
    normalized.color = normalizedColor;
  }

  return normalized;
}

function normalizeDailyLookColor(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  return String(value || '').trim();
}

async function ensureResolvableGarmentImageUrlAsync(
  baseUrl: string,
  imageReference: string,
  garmentId: string,
): Promise<string> {
  const normalizedReference = String(imageReference || '').trim();
  if (!normalizedReference) return '';
  if (isRemoteHttpUrl(normalizedReference) || isDataUrl(normalizedReference)) {
    return normalizedReference;
  }

  const cached = uploadedDailyLookImageCache.get(normalizedReference);
  if (cached) return cached;

  const uploadedUrl = await uploadLocalGarmentReferenceAsync(baseUrl, normalizedReference, garmentId);
  if (uploadedUrl) {
    uploadedDailyLookImageCache.set(normalizedReference, uploadedUrl);
  }
  return uploadedUrl;
}

async function uploadLocalGarmentReferenceAsync(
  baseUrl: string,
  uri: string,
  garmentId: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', {
    uri,
    name: buildGarmentUploadFileName(uri, garmentId),
    type: resolveGarmentUploadMimeType(uri),
  } as unknown as Blob);

  const response = await fetch(`${baseUrl}/api/v1/upload`, {
    method: 'POST',
    body: formData,
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    return '';
  }

  return typeof payload?.url === 'string' ? payload.url.trim() : '';
}

export async function fetchDailyLookJobAsync(input: {
  accessToken: string;
  jobId: string;
}): Promise<DailyLookJobResponse> {
  const baseUrl = resolveNativeBackendBaseUrl({ preferProxy: false });
  const accessToken = String(input.accessToken || '').trim();
  const jobId = String(input.jobId || '').trim();
  if (!baseUrl) {
    throw new DailyLookApiError('Image pipeline URL is not configured.', 0);
  }
  if (!accessToken) {
    throw new DailyLookApiError('Authentication token is missing.', 401);
  }
  if (!jobId) {
    throw new DailyLookApiError('Daily look job id is missing.', 400);
  }

  const response = await fetch(`${baseUrl}/api/v1/daily-look/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw buildDailyLookApiError(response.status, payload);
  }

  return {
    id: String(payload?.id || jobId),
    userId: String(payload?.user_id || ''),
    status: normalizeDailyLookJobStatus(payload?.status),
    selectedGarmentIds: normalizeStringArray(payload?.selected_garment_ids),
    weatherContext: payload?.weather_context && typeof payload.weather_context === 'object'
      ? payload.weather_context as Record<string, unknown>
      : {},
    prompt: typeof payload?.prompt === 'string' ? payload.prompt : null,
    finalImageUrl: typeof payload?.final_image_url === 'string' ? payload.final_image_url : null,
    errorMessage: typeof payload?.error_message === 'string' ? payload.error_message : null,
    createdAt: typeof payload?.created_at === 'string' ? payload.created_at : '',
    completedAt: typeof payload?.completed_at === 'string' ? payload.completed_at : null,
  };
}

export function normalizeDailyLookJobStatus(value: unknown): DailyLookJobStatus {
  const normalized = String(value || '').trim().toLowerCase();
  switch (normalized) {
    case 'starting':
    case 'processing':
    case 'generating_base':
    case 'vton_iterating':
    case 'face_swap':
    case 'completed':
    case 'failed':
      return normalized;
    default:
      return 'idle';
  }
}

function isRemoteHttpUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('http://') || normalized.startsWith('https://');
}

function isDataUrl(value: string): boolean {
  return value.trim().toLowerCase().startsWith('data:');
}

function buildGarmentUploadFileName(uri: string, garmentId: string): string {
  const fromUri = uri.split('?')[0]?.split('/').pop() || '';
  const sanitized = fromUri.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (sanitized) return sanitized;
  const safeId = String(garmentId || 'garment').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `${safeId || 'garment'}.jpg`;
}

function resolveGarmentUploadMimeType(uri: string): string {
  const normalized = uri.trim().toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean)
    : [];
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

function buildDailyLookApiError(statusCode: number, payload: Record<string, unknown> | null): DailyLookApiError {
  const detail = payload?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return new DailyLookApiError(detail.trim(), statusCode);
  }
  if (Array.isArray(detail)) {
    const validationMessage = detail
      .map(item => formatDailyLookValidationError(item))
      .find(Boolean);
    return new DailyLookApiError(
      validationMessage || `Daily look request failed with status ${statusCode}.`,
      statusCode,
    );
  }
  if (detail && typeof detail === 'object') {
    const detailObject = detail as Record<string, unknown>;
    return new DailyLookApiError(
      String(detailObject.message || `Daily look request failed with status ${statusCode}.`),
      statusCode,
    );
  }

  return new DailyLookApiError(
    String(payload?.message || `Daily look request failed with status ${statusCode}.`),
    statusCode,
  );
}

function formatDailyLookValidationError(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return '';

  const detailObject = detail as Record<string, unknown>;
  const message = String(detailObject.msg || '').trim();
  const location = Array.isArray(detailObject.loc)
    ? detailObject.loc
      .map(item => String(item ?? '').trim())
      .filter(Boolean)
      .join('.')
    : '';

  if (!message) return '';
  if (!location) return `Daily look request is invalid: ${message}`;
  return `Daily look request is invalid at ${location}: ${message}`;
}
