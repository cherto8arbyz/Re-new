/**
 * Monetization settings shared between web and native clients.
 */

export const FREE_WARDROBE_LIMIT = 10;
export const EXPANDED_WARDROBE_LIMIT = 50;

export const FREE_AI_LOOK_LIMIT = 2;
export const EXPANDED_AI_LOOK_LIMIT = 20;

export const UPGRADE_PRICE_USD = 5;
export const WARDROBE_UPGRADE_PRICE_USD = UPGRADE_PRICE_USD;
export const AI_LOOK_UPGRADE_PRICE_USD = UPGRADE_PRICE_USD;

export const STRIPE_WARDROBE_UPGRADE_URL = 'https://buy.stripe.com/test_9B65kw1kzgrG8WB3Xu04800';
export const STRIPE_AI_LOOK_UPGRADE_URL = STRIPE_WARDROBE_UPGRADE_URL;

export const UPGRADE_CONTEXT_WARDROBE = 'wardrobe';
export const UPGRADE_CONTEXT_AI_LOOKS = 'ai_looks';
export const UPGRADE_PENDING_PAYMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const UPGRADE_STORAGE_VERSION = 'v3';

const UPGRADE_SUCCESS_PATH_MARKER = '/wardrobe-upgrade/success';

/**
 * @typedef {'wardrobe' | 'ai_looks'} UpgradeContext
 */

/**
 * @typedef {{
 *  context: UpgradeContext,
 *  referenceId: string,
 *  createdAt: number,
 *  customerEmail?: string,
 *  returnedToApp?: boolean,
 * }} PendingUpgradePayment
 */

/**
 * @param {string | null | undefined} userId
 * @returns {string}
 */
function normalizeUserId(userId) {
  return String(userId || 'anonymous').trim() || 'anonymous';
}

/**
 * @param {unknown} value
 * @returns {UpgradeContext | null}
 */
function normalizeUpgradeContext(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === UPGRADE_CONTEXT_WARDROBE) return UPGRADE_CONTEXT_WARDROBE;
  if (normalized === UPGRADE_CONTEXT_AI_LOOKS || normalized === 'ai' || normalized === 'ai-looks') {
    return UPGRADE_CONTEXT_AI_LOOKS;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeReferenceId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_\-./]/g, '')
    .slice(0, 180);
}

/**
 * @param {boolean} unlocked
 * @returns {number}
 */
export function getWardrobeLimit(unlocked) {
  return unlocked ? EXPANDED_WARDROBE_LIMIT : FREE_WARDROBE_LIMIT;
}

/**
 * @param {boolean} unlocked
 * @returns {number}
 */
export function getAiLookLimit(unlocked) {
  return unlocked ? EXPANDED_AI_LOOK_LIMIT : FREE_AI_LOOK_LIMIT;
}

/**
 * @param {string | null | undefined} userId
 * @returns {string}
 */
export function buildWardrobeUpgradeStorageKey(userId) {
  return `renew_${UPGRADE_STORAGE_VERSION}_wardrobe_upgrade_${normalizeUserId(userId)}`;
}

/**
 * @param {string | null | undefined} userId
 * @returns {string}
 */
export function buildAiLookUpgradeStorageKey(userId) {
  return `renew_${UPGRADE_STORAGE_VERSION}_ai_look_upgrade_${normalizeUserId(userId)}`;
}

/**
 * @param {string | null | undefined} userId
 * @returns {string}
 */
export function buildAiLookUsageStorageKey(userId) {
  return `renew_${UPGRADE_STORAGE_VERSION}_ai_look_usage_${normalizeUserId(userId)}`;
}

/**
 * @param {string | null | undefined} userId
 * @returns {string}
 */
export function buildUpgradePendingContextStorageKey(userId) {
  return `renew_${UPGRADE_STORAGE_VERSION}_upgrade_pending_${normalizeUserId(userId)}`;
}

/**
 * @param {string | null | undefined} userId
 * @returns {string}
 */
export function buildUpgradePendingPaymentStorageKey(userId) {
  return `renew_${UPGRADE_STORAGE_VERSION}_upgrade_pending_payment_${normalizeUserId(userId)}`;
}

/**
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} context
 * @returns {string}
 */
export function createUpgradeCheckoutReferenceId(userId, context) {
  const contextValue = normalizeUpgradeContext(context) || UPGRADE_CONTEXT_WARDROBE;
  const contextTag = contextValue === UPGRADE_CONTEXT_AI_LOOKS ? 'ai' : 'wr';
  const userTag = normalizeUserId(userId)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24) || 'anonymous';
  const timeTag = Date.now().toString(36);
  const randomTag = Math.random().toString(36).slice(2, 10);
  return sanitizeReferenceId(`renew_${contextTag}_${userTag}_${timeTag}_${randomTag}`);
}

/**
 * @param {{
 *  context: string,
 *  referenceId: string,
 *  createdAt?: number,
 *  customerEmail?: string | null,
 *  returnedToApp?: boolean,
 * } | null | undefined} input
 * @returns {PendingUpgradePayment | null}
 */
export function createPendingUpgradePaymentRecord(input) {
  const context = normalizeUpgradeContext(input?.context);
  const referenceId = sanitizeReferenceId(input?.referenceId);
  if (!context || !referenceId) return null;

  const createdAtRaw = Number(input?.createdAt || 0);
  let createdAt = Number.isFinite(createdAtRaw) && createdAtRaw > 0
    ? Math.round(createdAtRaw)
    : Date.now();
  if (createdAt < 100000000000) createdAt *= 1000;

  const customerEmail = String(input?.customerEmail || '').trim().slice(0, 180);
  const returnedToApp = Boolean(input?.returnedToApp);
  const base = returnedToApp
    ? { context, referenceId, createdAt, returnedToApp: true }
    : { context, referenceId, createdAt };
  if (customerEmail) {
    return { ...base, customerEmail };
  }
  return base;
}

/**
 * @param {string | null | undefined} value
 * @returns {PendingUpgradePayment | null}
 */
export function parsePendingUpgradePayment(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const payload = /** @type {{ [key: string]: unknown }} */ (parsed);
    return createPendingUpgradePaymentRecord({
      context: String(payload.context || ''),
      referenceId: String(payload.referenceId || payload.reference_id || ''),
      createdAt: Number(payload.createdAt || payload.created_at || 0),
      customerEmail: String(payload.customerEmail || payload.customer_email || ''),
      returnedToApp: Boolean(payload.returnedToApp || payload.returned_to_app),
    });
  } catch {
    return null;
  }
}

/**
 * @param {PendingUpgradePayment | null | undefined} payment
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isPendingUpgradePaymentExpired(payment, nowMs = Date.now()) {
  const createdAt = Number(payment?.createdAt || 0);
  const nowValue = Number(nowMs || 0);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return true;
  if (!Number.isFinite(nowValue) || nowValue <= 0) return true;
  return nowValue - createdAt > UPGRADE_PENDING_PAYMENT_MAX_AGE_MS;
}

/**
 * @param {string | null | undefined} checkoutUrl
 * @param {{
 *  referenceId?: string | null,
 *  customerEmail?: string | null,
 * } | null | undefined} options
 * @returns {string}
 */
export function buildStripeCheckoutUrl(checkoutUrl, options) {
  const baseUrl = String(checkoutUrl || '').trim();
  if (!baseUrl) return '';

  const referenceId = sanitizeReferenceId(options?.referenceId || '');
  const customerEmail = String(options?.customerEmail || '').trim().slice(0, 180);

  try {
    const parsed = new URL(baseUrl);
    if (referenceId) parsed.searchParams.set('client_reference_id', referenceId);
    if (customerEmail) parsed.searchParams.set('prefilled_email', customerEmail);
    return parsed.toString();
  } catch {
    return baseUrl;
  }
}

/**
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
export function isWardrobeUpgradeStoredValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'expanded';
}

/**
 * @param {string | null | undefined} value
 * @returns {number}
 */
export function parseUsageCount(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

/**
 * Accepts deep links like:
 * - renew://wardrobe-upgrade/success
 * - https://app.example.com/?wardrobeUpgrade=success
 *
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export function isUpgradeSuccessUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    const pathname = `${parsed.pathname || ''}`.toLowerCase();
    const hostPathname = `/${parsed.host || ''}${pathname}`.toLowerCase();
    const statusParam = (
      parsed.searchParams.get('wardrobeUpgrade')
      || parsed.searchParams.get('upgrade')
      || parsed.searchParams.get('payment')
      || parsed.searchParams.get('status')
      || ''
    )
      .trim()
      .toLowerCase();

    if (
      statusParam === 'success'
      || statusParam === 'paid'
      || statusParam === 'succeeded'
      || statusParam === '1'
      || statusParam === 'true'
    ) {
      return true;
    }

    return pathname.includes(UPGRADE_SUCCESS_PATH_MARKER) || hostPathname.includes(UPGRADE_SUCCESS_PATH_MARKER);
  } catch {
    return /wardrobe[-_/]?upgrade[-_/]?success/i.test(raw);
  }
}

/**
 * Backward-compatible alias.
 *
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export function isWardrobeUpgradeSuccessUrl(url) {
  return isUpgradeSuccessUrl(url);
}

/**
 * Reads the upgrade target from a success URL if present.
 *
 * @param {string | null | undefined} url
 * @returns {'wardrobe' | 'ai_looks' | null}
 */
export function extractUpgradeTargetFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const candidate = (
      parsed.searchParams.get('upgradeTarget')
      || parsed.searchParams.get('target')
      || parsed.searchParams.get('context')
      || ''
    )
      .trim()
      .toLowerCase();

    return normalizeUpgradeContext(candidate);
  } catch {
    return null;
  }
}
