import { resolveNativeBackendBaseUrl } from './backend-url.js';

export type UpgradeContext = 'wardrobe' | 'ai_looks';

export interface VerifyStripeUpgradePaymentInput {
  context: UpgradeContext;
  referenceId: string;
  customerEmail?: string;
  createdAfter?: number;
}

export interface VerifyStripeUpgradePaymentResult {
  context: UpgradeContext;
  paid: boolean;
  configured: boolean;
  sessionId?: string;
  reason: string;
}

const DEFAULT_TIMEOUT_MS = 20000;

export async function verifyStripeUpgradePayment(
  input: VerifyStripeUpgradePaymentInput,
): Promise<VerifyStripeUpgradePaymentResult> {
  const baseUrl = resolveUpgradeApiBaseUrl();
  if (!baseUrl) {
    return {
      context: input.context,
      paid: false,
      configured: false,
      reason: 'upgrade_api_url_not_configured',
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS) : null;

  try {
    const response = await fetch(`${baseUrl}/api/payments/stripe/verify-upgrade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: input.context,
        reference_id: String(input.referenceId || '').trim(),
        customer_email: String(input.customerEmail || '').trim() || null,
        created_after: Number.isFinite(input.createdAfter)
          ? Math.max(0, Math.floor(Number(input.createdAfter)))
          : null,
      }),
      signal: controller?.signal,
    });
    const rawText = await response.text();
    const payload = safeParseJson(rawText);

    if (!response.ok) {
      return {
        context: input.context,
        paid: false,
        configured: false,
        reason: String(
          payload?.detail
            || payload?.error
            || `verify_request_failed_${response.status}`,
        ),
      };
    }

    const context = normalizeContext(payload?.context) || input.context;
    return {
      context,
      paid: Boolean(payload?.paid),
      configured: payload?.configured !== false,
      sessionId: typeof payload?.session_id === 'string' && payload.session_id.trim()
        ? payload.session_id.trim()
        : undefined,
      reason: String(payload?.reason || (payload?.paid ? 'paid' : 'paid_session_not_found')),
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return {
      context: input.context,
      paid: false,
      configured: false,
      reason: isTimeout
        ? `verify_request_timeout_${DEFAULT_TIMEOUT_MS}ms`
        : `verify_request_error:${error instanceof Error ? error.message : 'unknown_error'}`,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function resolveUpgradeApiBaseUrl(): string {
  return resolveNativeBackendBaseUrl({
    preferProxy: true,
    allowDevLocalFallback: true,
  });
}

function normalizeContext(value: unknown): UpgradeContext | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'wardrobe') return 'wardrobe';
  if (normalized === 'ai_looks' || normalized === 'ai-looks' || normalized === 'ai') return 'ai_looks';
  return null;
}

function safeParseJson(text: string): { [key: string]: any } | null {
  const normalized = String(text || '').trim();
  if (!normalized) return null;
  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === 'object'
      ? parsed as { [key: string]: any }
      : null;
  } catch {
    return null;
  }
}
