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
        console.log('[stripe:webhook] Checkout session completed:', event.data.object.id);
        // TODO: Add custom logic for checkout completion
        break;
      case 'customer.subscription.updated':
        console.log('[stripe:webhook] Subscription updated:', event.data.object.id);
        // TODO: Add custom logic for subscription updates
        break;
      case 'customer.subscription.deleted':
        console.log('[stripe:webhook] Subscription deleted:', event.data.object.id);
        // TODO: Add custom logic for subscription cancellation
        break;
      case 'invoice.payment_succeeded':
        console.log('[stripe:webhook] Payment succeeded:', event.data.object.id);
        // TODO: Add custom logic for successful payments
        break;
      case 'invoice.payment_failed':
        console.log('[stripe:webhook] Payment failed:', event.data.object.id);
        // TODO: Add custom logic for failed payments
        break;
      default:
        console.log('[stripe:webhook] Unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('[stripe:webhook] Handler failed', error);
    return NextResponse.json(
      { error: 'Failed to process webhook event.' },
      { status: 500 }
    );
  }
}
