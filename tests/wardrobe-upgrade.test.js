import { describe, it, expect } from './runner.js';
import {
  FREE_AI_LOOK_LIMIT,
  EXPANDED_AI_LOOK_LIMIT,
  FREE_WARDROBE_LIMIT,
  EXPANDED_WARDROBE_LIMIT,
  UPGRADE_CONTEXT_AI_LOOKS,
  UPGRADE_CONTEXT_WARDROBE,
  buildAiLookUpgradeStorageKey,
  buildAiLookUsageStorageKey,
  buildUpgradePendingContextStorageKey,
  buildUpgradePendingPaymentStorageKey,
  buildStripeCheckoutUrl,
  buildWardrobeUpgradeStorageKey,
  createPendingUpgradePaymentRecord,
  createUpgradeCheckoutReferenceId,
  extractUpgradeTargetFromUrl,
  getAiLookLimit,
  getWardrobeLimit,
  isPendingUpgradePaymentExpired,
  isUpgradeSuccessUrl,
  isWardrobeUpgradeStoredValue,
  parsePendingUpgradePayment,
  parseUsageCount,
} from '../src/shared/wardrobe-upgrade.js';

describe('Wardrobe upgrade config', () => {
  it('returns the free and expanded limits', () => {
    expect(getWardrobeLimit(false)).toBe(FREE_WARDROBE_LIMIT);
    expect(getWardrobeLimit(true)).toBe(EXPANDED_WARDROBE_LIMIT);
  });

  it('builds user-scoped storage key', () => {
    expect(buildWardrobeUpgradeStorageKey('user-1')).toBe('renew_v3_wardrobe_upgrade_user-1');
    expect(buildAiLookUpgradeStorageKey('user-1')).toBe('renew_v3_ai_look_upgrade_user-1');
    expect(buildAiLookUsageStorageKey('user-1')).toBe('renew_v3_ai_look_usage_user-1');
    expect(buildUpgradePendingContextStorageKey('user-1')).toBe('renew_v3_upgrade_pending_user-1');
    expect(buildUpgradePendingPaymentStorageKey('user-1')).toBe('renew_v3_upgrade_pending_payment_user-1');
  });

  it('returns the free and expanded AI limits', () => {
    expect(getAiLookLimit(false)).toBe(FREE_AI_LOOK_LIMIT);
    expect(getAiLookLimit(true)).toBe(EXPANDED_AI_LOOK_LIMIT);
  });

  it('accepts stored upgrade value variants', () => {
    expect(isWardrobeUpgradeStoredValue('expanded')).toBeTruthy();
    expect(isWardrobeUpgradeStoredValue('true')).toBeTruthy();
    expect(isWardrobeUpgradeStoredValue('1')).toBeTruthy();
    expect(isWardrobeUpgradeStoredValue('free')).toBeFalsy();
  });

  it('recognizes success markers in deep links', () => {
    expect(isUpgradeSuccessUrl('renew://wardrobe-upgrade/success')).toBeTruthy();
    expect(isUpgradeSuccessUrl('https://renew.app/pay-return?upgrade=success')).toBeTruthy();
    expect(isUpgradeSuccessUrl('https://renew.app/pay-return?status=failed')).toBeFalsy();
  });

  it('parses upgrade target from URL params', () => {
    expect(extractUpgradeTargetFromUrl('renew://wardrobe-upgrade/success?target=wardrobe')).toBe(UPGRADE_CONTEXT_WARDROBE);
    expect(extractUpgradeTargetFromUrl('renew://wardrobe-upgrade/success?context=ai')).toBe(UPGRADE_CONTEXT_AI_LOOKS);
    expect(extractUpgradeTargetFromUrl('renew://wardrobe-upgrade/success')).toBeNull();
  });

  it('parses persisted usage counters', () => {
    expect(parseUsageCount('4')).toBe(4);
    expect(parseUsageCount('-2')).toBe(0);
    expect(parseUsageCount('abc')).toBe(0);
  });

  it('builds a checkout URL with Stripe client reference id', () => {
    const checkoutUrl = buildStripeCheckoutUrl('https://buy.stripe.com/test_abc', {
      referenceId: 'renew_wr_123',
      customerEmail: 'user@example.com',
    });

    expect(checkoutUrl.includes('client_reference_id=renew_wr_123')).toBeTruthy();
    expect(checkoutUrl.includes('prefilled_email=user%40example.com')).toBeTruthy();
  });

  it('creates and parses pending payment payloads', () => {
    const pending = createPendingUpgradePaymentRecord({
      context: UPGRADE_CONTEXT_WARDROBE,
      referenceId: createUpgradeCheckoutReferenceId('user-1', UPGRADE_CONTEXT_WARDROBE),
      createdAt: Date.now(),
      customerEmail: 'user@example.com',
    });

    expect(pending).toBeNotNull();
    const raw = JSON.stringify(pending);
    const parsed = parsePendingUpgradePayment(raw);
    expect(parsed?.context).toBe(UPGRADE_CONTEXT_WARDROBE);
    expect(parsed?.referenceId?.startsWith('renew_')).toBeTruthy();
    expect(parsed?.customerEmail).toBe('user@example.com');
    expect(isPendingUpgradePaymentExpired(parsed, parsed.createdAt + 1000)).toBeFalsy();
  });
});
