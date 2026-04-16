import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { verifyStripeWebhook } from '../src/server/stripe-webhook.js';

/**
 * @param {string} secret
 * @param {string} rawBody
 * @param {number} timestamp
 * @returns {string}
 */
function buildStripeSignatureHeader(secret, rawBody, timestamp) {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

async function main() {
  const webhookSecret = 'whsec_demo_test_secret';
  const timestamp = 1735689600;
  const rawBody = JSON.stringify({
    id: 'evt_123',
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        object: 'checkout.session',
        id: 'cs_test_123',
        client_reference_id: 'renew_wr_user_demo',
        payment_status: 'paid',
        mode: 'payment',
        customer_details: {
          email: 'buyer@example.com',
        },
      },
    },
  });

  const verified = await verifyStripeWebhook({
    rawBody,
    signatureHeader: buildStripeSignatureHeader(webhookSecret, rawBody, timestamp),
    webhookSecret,
    nowMs: timestamp * 1000,
  });

  assert.equal(verified.ok, true);
  if (!verified.ok) {
    throw new Error(`Expected webhook verification success, got ${verified.error}`);
  }

  assert.deepEqual(verified.summary, {
    eventId: 'evt_123',
    eventType: 'checkout.session.completed',
    livemode: false,
    handled: true,
    objectType: 'checkout.session',
    checkoutSessionId: 'cs_test_123',
    clientReferenceId: 'renew_wr_user_demo',
    paymentStatus: 'paid',
    mode: 'payment',
    customerEmail: 'buyer@example.com',
  });

  const invalidSignature = await verifyStripeWebhook({
    rawBody,
    signatureHeader: `t=${timestamp},v1=deadbeef`,
    webhookSecret,
    nowMs: timestamp * 1000,
  });

  assert.equal(invalidSignature.ok, false);
  if (invalidSignature.ok) {
    throw new Error('Expected invalid signature to fail verification.');
  }
  assert.equal(invalidSignature.status, 400);
  assert.equal(invalidSignature.error, 'stripe_signature_verification_failed');

  const staleSignature = await verifyStripeWebhook({
    rawBody,
    signatureHeader: buildStripeSignatureHeader(webhookSecret, rawBody, timestamp),
    webhookSecret,
    nowMs: (timestamp + 301) * 1000,
  });

  assert.equal(staleSignature.ok, false);
  if (staleSignature.ok) {
    throw new Error('Expected stale signature to fail verification.');
  }
  assert.equal(staleSignature.status, 400);
  assert.equal(staleSignature.error, 'stripe_signature_too_old');

  console.log('stripe-webhook.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

