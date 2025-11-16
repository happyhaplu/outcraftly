import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

// Use a runtime string for the API version and assert the type to satisfy Stripe's
// typed union. This avoids TS errors when the installed @stripe/stripe-node types
// include a different narrow set of version literals.
const STRIPE_API_VERSION = ('2024-06-20' as unknown) as Stripe.StripeConfig['apiVersion'];

function ensureEnv(name: 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET'): string {
  const value = process.env[name];
  if (!value) {
    const message = `${name} is required for the Stripe webhook handler`;
    // Log once and fail fast so we never silently swallow missed configuration
    console.error(`[stripe:webhook] ${message}`);
    throw new Error(message);
  }
  return value;
}

function createStripeClient(): Stripe {
  return new Stripe(ensureEnv('STRIPE_SECRET_KEY'), {
    apiVersion: STRIPE_API_VERSION
  });
}

export async function POST(request: Request) {
  const stripeSignature = request.headers.get('stripe-signature');

  if (!stripeSignature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature header.' },
      { status: 400 }
    );
  }

  let payload: string;
  try {
    // Stripe requires the raw request body for signature verification.
    payload = await request.text();
  } catch (error) {
    console.error('[stripe:webhook] Unable to read request body', error);
    return NextResponse.json(
      { error: 'Unable to read request body.' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    const stripe = createStripeClient();
    event = stripe.webhooks.constructEvent(
      payload,
      stripeSignature,
      ensureEnv('STRIPE_WEBHOOK_SECRET')
    );
  } catch (error) {
    console.error('[stripe:webhook] Signature verification failed', error);
    return NextResponse.json(
      { error: 'Invalid Stripe signature.' },
      { status: 400 }
    );
  }

  try {
    // TODO: Handle specific event types as needed.
    // switch (event.type) {
    //   case 'checkout.session.completed':
    //     break;
    //   default:
    //     break;
    // }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('[stripe:webhook] Handler failed', error);
    return NextResponse.json(
      { error: 'Failed to process webhook event.' },
      { status: 500 }
    );
  }
}
