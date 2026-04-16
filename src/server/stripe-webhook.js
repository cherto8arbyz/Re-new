// @ts-check

const DEFAULT_TOLERANCE_SECONDS = 300;
const SUPPORTED_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);

/**
 * @typedef {{
 *   rawBody: string,
 *   signatureHeader: string | null | undefined,
 *   webhookSecret: string,
 *   toleranceSeconds?: number,
 *   nowMs?: number,
 * }} VerifyStripeWebhookInput
 */

/**
 * @typedef {{
 *   id: string,
 *   type: string,
 *   livemode: boolean,
 *   data: {
 *     object: Record<string, unknown> | null,
 *   },
 * }} StripeWebhookEvent
 */

/**
 * @typedef {{
 *   eventId: string,
 *   eventType: string,
 *   livemode: boolean,
 *   handled: boolean,
 *   objectType: string,
 *   checkoutSessionId: string,
 *   clientReferenceId: string,
 *   paymentStatus: string,
 *   mode: string,
 *   customerEmail: string,
 * }} StripeWebhookSummary
 */

/**
 * @typedef {{
 *   ok: true,
 *   event: StripeWebhookEvent,
 *   summary: StripeWebhookSummary,
 * }} VerifyStripeWebhookSuccess
 */

/**
 * @typedef {{
 *   ok: false,
 *   status: number,
 *   error: string,
 * }} VerifyStripeWebhookFailure
 */

/**
 * @typedef {VerifyStripeWebhookSuccess | VerifyStripeWebhookFailure} VerifyStripeWebhookResult
 */

const encoder = new TextEncoder();

/**
 * Validates the Stripe signature and returns a normalized event payload.
 *
 * @param {VerifyStripeWebhookInput} input
 * @returns {Promise<VerifyStripeWebhookResult>}
 */
export async function verifyStripeWebhook(input) {
  const rawBody = String(input.rawBody || '');
  const signatureHeader = String(input.signatureHeader || '').trim();
  const webhookSecret = String(input.webhookSecret || '').trim();
  const toleranceSeconds = Math.max(
    0,
    Number.isFinite(input.toleranceSeconds) ? Number(input.toleranceSeconds) : DEFAULT_TOLERANCE_SECONDS,
  );
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();

  if (!webhookSecret) {
    return {
      ok: false,
      status: 503,
      error: 'stripe_webhook_secret_not_configured',
    };
  }

  if (!rawBody) {
    return {
      ok: false,
      status: 400,
      error: 'empty_request_body',
    };
  }

  if (!signatureHeader) {
    return {
      ok: false,
      status: 400,
      error: 'missing_stripe_signature_header',
    };
  }

  const parsedSignature = parseStripeSignatureHeader(signatureHeader);
  if (!parsedSignature.timestamp || parsedSignature.signatures.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_stripe_signature_header',
    };
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  if (toleranceSeconds > 0 && Math.abs(nowSeconds - parsedSignature.timestamp) > toleranceSeconds) {
    return {
      ok: false,
      status: 400,
      error: 'stripe_signature_too_old',
    };
  }

  const signedPayload = `${parsedSignature.timestamp}.${rawBody}`;
  const expectedSignature = await computeHmacSha256Hex(webhookSecret, signedPayload);
  const matches = parsedSignature.signatures.some(signature => safeCompare(signature, expectedSignature));

  if (!matches) {
    return {
      ok: false,
      status: 400,
      error: 'stripe_signature_verification_failed',
    };
  }

  const event = parseStripeWebhookEvent(rawBody);
  if (!event) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_stripe_event_payload',
    };
  }

  return {
    ok: true,
    event,
    summary: summarizeStripeEvent(event),
  };
}

/**
 * @param {StripeWebhookEvent} event
 * @returns {StripeWebhookSummary}
 */
export function summarizeStripeEvent(event) {
  const object = isRecord(event.data.object) ? event.data.object : null;
  const customerDetails = object && isRecord(object['customer_details']) ? object['customer_details'] : null;

  return {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
    handled: SUPPORTED_EVENT_TYPES.has(event.type),
    objectType: objectString(object?.['object']),
    checkoutSessionId: objectString(object?.['id']),
    clientReferenceId: objectString(object?.['client_reference_id']),
    paymentStatus: objectString(object?.['payment_status']),
    mode: objectString(object?.['mode']),
    customerEmail: objectString(
      (customerDetails && customerDetails['email']) || object?.['customer_email'],
    ),
  };
}

/**
 * @param {string} rawBody
 * @returns {StripeWebhookEvent | null}
 */
function parseStripeWebhookEvent(rawBody) {
  try {
    const parsed = JSON.parse(rawBody);
    if (!isRecord(parsed) || !isRecord(parsed.data)) {
      return null;
    }

    return {
      id: objectString(parsed.id),
      type: objectString(parsed.type),
      livemode: Boolean(parsed.livemode),
      data: {
        object: isRecord(parsed.data.object) ? parsed.data.object : null,
      },
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} header
 * @returns {{ timestamp: number | null, signatures: string[] }}
 */
function parseStripeSignatureHeader(header) {
  /** @type {string[]} */
  const signatures = [];
  let timestamp = null;

  for (const chunk of header.split(',')) {
    const [rawKey, ...rawValueParts] = chunk.split('=');
    const key = String(rawKey || '').trim();
    const value = rawValueParts.join('=').trim();
    if (!key || !value) continue;

    if (key === 't') {
      const parsedTimestamp = Number.parseInt(value, 10);
      if (Number.isFinite(parsedTimestamp) && parsedTimestamp > 0) {
        timestamp = parsedTimestamp;
      }
      continue;
    }

    if (key === 'v1') {
      signatures.push(value.toLowerCase());
    }
  }

  return { timestamp, signatures };
}

/**
 * @param {string} secret
 * @param {string} payload
 * @returns {Promise<string>}
 */
async function computeHmacSha256Hex(secret, payload) {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) {
    throw new Error('web_crypto_subtle_unavailable');
  }

  const key = await webCrypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await webCrypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bytesToHex(new Uint8Array(signature));
}

/**
 * @param {Uint8Array} value
 * @returns {string}
 */
function bytesToHex(value) {
  let hex = '';
  for (const byte of value) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function safeCompare(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function objectString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
