import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createStripeClient, ensureEnv } from '@/lib/payments/stripe-utils';

export const dynamic = 'force-dynamic';

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
    // Handle specific event types
    switch (event.type) {
      case 'checkout.session.completed':
        logger.info({ id: event.data.object.id }, '[stripe:webhook] Checkout session completed:');
        // TODO: Add custom logic for checkout completion
        break;
      case 'customer.subscription.updated':
        logger.info({ id: event.data.object.id }, '[stripe:webhook] Subscription updated:');
        // TODO: Add custom logic for subscription updates
        break;
      case 'customer.subscription.deleted':
        logger.info({ id: event.data.object.id }, '[stripe:webhook] Subscription deleted:');
        // TODO: Add custom logic for subscription cancellation
        break;
      case 'invoice.payment_succeeded':
        logger.info({ id: event.data.object.id }, '[stripe:webhook] Payment succeeded:');
        // TODO: Add custom logic for successful payments
        break;
      case 'invoice.payment_failed':
        logger.info({ id: event.data.object.id }, '[stripe:webhook] Payment failed:');
        // TODO: Add custom logic for failed payments
        break;
      default:
        logger.info({ type: event.type }, '[stripe:webhook] Unhandled event type:');
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.error({ error }, '[stripe:webhook] Handler failed');
    return NextResponse.json(
      { error: 'Failed to process webhook event.' },
      { status: 500 }
    );
  }
}
