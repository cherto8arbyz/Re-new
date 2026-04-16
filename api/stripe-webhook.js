// @ts-check

import { verifyStripeWebhook } from '../src/server/stripe-webhook.js';

/**
 * @returns {string}
 */
function resolveWebhookSecret() {
  return String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function GET(request) {
  if (!(request instanceof Request)) {
    return Response.redirect('https://re-new-tan.vercel.app/', 302);
  }
  const url = new URL(request.url);
  if (url.searchParams.get('inspect') === '1' || url.searchParams.get('format') === 'json') {
    const configured = Boolean(resolveWebhookSecret());
    return Response.json(
      {
        ok: true,
        configured,
        endpoint: '/api/stripe-webhook',
      },
      { status: 200 },
    );
  }

  return Response.redirect(new URL('/', request.url), 302);
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function POST(request) {
  const webhookSecret = resolveWebhookSecret();
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('stripe-signature');
  const result = await verifyStripeWebhook({
    rawBody,
    signatureHeader,
    webhookSecret,
  });

  if (result.ok === false) {
    return Response.json(
      {
        ok: false,
        configured: Boolean(webhookSecret),
        error: result.error,
      },
      { status: result.status },
    );
  }

  console.info('stripe_webhook_received', JSON.stringify(result.summary));
  return Response.json(
    {
      ok: true,
      received: true,
      configured: true,
      ...result.summary,
    },
    { status: 200 },
  );
}
