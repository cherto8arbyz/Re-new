import { resolveBackendBaseUrl } from '../../shared/backend-base-url.js';

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
  gender?: string;
}

export interface DailyLookGenerateResponse {
  jobId: string;
  status: DailyLookJobStatus;
  selectedGarmentIds: string[];
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

export async function createDailyLookJobAsync(input: DailyLookGenerateInput): Promise<DailyLookGenerateResponse> {
  const baseUrl = resolveBackendBaseUrl({ preferProxy: false });
  const accessToken = String(input.accessToken || '').trim();
  if (!baseUrl) {
    throw new DailyLookApiError('Image pipeline URL is not configured.', 0);
  }
  if (!accessToken) {
    throw new DailyLookApiError('Authentication token is missing.', 401);
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
      available_garments: input.availableGarments,
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

export async function fetchDailyLookJobAsync(input: {
  accessToken: string;
  jobId: string;
}): Promise<DailyLookJobResponse> {
  const baseUrl = resolveBackendBaseUrl({ preferProxy: false });
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
