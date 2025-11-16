import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import { Team } from '@/lib/db/schema';
import {
  getTeamByStripeCustomerId,
  getUser,
  updateTeamSubscription
} from '@/lib/db/queries';
import { executeWithResilience } from '@/lib/services/resilience';
import { getLogger } from '@/lib/logger';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil'
});

const stripeLogger = getLogger({ component: 'stripe' });

export async function createCheckoutSession({
  team,
  priceId
}: {
  team: Team | null;
  priceId: string;
}) {
  const user = await getUser();

  if (!team || !user) {
    redirect(`/sign-up?redirect=checkout&priceId=${priceId}`);
  }

  const session = await executeWithResilience(
    'stripe_checkout_session_create',
    () =>
      stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        mode: 'subscription',
        success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.BASE_URL}/pricing`,
        customer: team.stripeCustomerId || undefined,
        client_reference_id: user.id.toString(),
        allow_promotion_codes: true,
        subscription_data: {
          trial_period_days: 14
        }
      }),
    {
      breakerKey: 'stripe:checkout',
      timeoutMs: 15000,
      retries: 2,
      baseDelayMs: 500
    }
  );

  redirect(session.url!);
}

export async function createCustomerPortalSession(team: Team) {
  if (!team.stripeCustomerId || !team.stripeProductId) {
    redirect('/pricing');
  }

  let configuration: Stripe.BillingPortal.Configuration;
  const configurations = await executeWithResilience(
    'stripe_portal_config_list',
    () => stripe.billingPortal.configurations.list(),
    { breakerKey: 'stripe:portal-list', timeoutMs: 10000, retries: 2, baseDelayMs: 400 }
  );

  if (configurations.data.length > 0) {
    configuration = configurations.data[0];
  } else {
    const product = await executeWithResilience(
      'stripe_product_retrieve',
      () => stripe.products.retrieve(team.stripeProductId!),
      { breakerKey: `stripe:product:${team.stripeProductId}`, timeoutMs: 10000, retries: 2 }
    );
    if (!product.active) {
      throw new Error("Team's product is not active in Stripe");
    }

    const prices = await executeWithResilience(
      'stripe_price_list',
      () =>
        stripe.prices.list({
          product: product.id,
          active: true
        }),
      { breakerKey: `stripe:prices:${product.id}`, timeoutMs: 10000, retries: 2 }
    );
    if (prices.data.length === 0) {
      throw new Error("No active prices found for the team's product");
    }

    configuration = await executeWithResilience(
      'stripe_portal_config_create',
      () =>
        stripe.billingPortal.configurations.create({
          business_profile: {
            headline: 'Manage your subscription'
          },
          features: {
            subscription_update: {
              enabled: true,
              default_allowed_updates: ['price', 'quantity', 'promotion_code'],
              proration_behavior: 'create_prorations',
              products: [
                {
                  product: product.id,
                  prices: prices.data.map((price) => price.id)
                }
              ]
            },
            subscription_cancel: {
              enabled: true,
              mode: 'at_period_end',
              cancellation_reason: {
                enabled: true,
                options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other']
              }
            },
            payment_method_update: {
              enabled: true
            }
          }
        }),
      { breakerKey: 'stripe:portal-create', timeoutMs: 10000, retries: 2 }
    );
  }

  return executeWithResilience(
    'stripe_portal_session_create',
    () =>
      stripe.billingPortal.sessions.create({
        customer: team.stripeCustomerId!,
        return_url: `${process.env.BASE_URL}/dashboard`,
        configuration: configuration.id
      }),
    { breakerKey: 'stripe:portal-session', timeoutMs: 10000, retries: 2 }
  );
}

export async function handleSubscriptionChange(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  const team = await getTeamByStripeCustomerId(customerId);

  if (!team) {
    console.error('Team not found for Stripe customer:', customerId);
    return;
  }

  if (status === 'active' || status === 'trialing') {
    const plan = subscription.items.data[0]?.plan;
    await updateTeamSubscription(team.id, {
      stripeSubscriptionId: subscriptionId,
      stripeProductId: plan?.product as string,
      planName: (plan?.product as Stripe.Product).name,
      subscriptionStatus: status
    });
  } else if (status === 'canceled' || status === 'unpaid') {
    await updateTeamSubscription(team.id, {
      stripeSubscriptionId: null,
      stripeProductId: null,
      planName: null,
      subscriptionStatus: status
    });
  }
}

export async function getStripePrices() {
  const prices = await executeWithResilience(
    'stripe_price_list_active',
    () =>
      stripe.prices.list({
        expand: ['data.product'],
        active: true,
        type: 'recurring'
      }),
    { breakerKey: 'stripe:prices-active', timeoutMs: 10000, retries: 2 }
  );

  return prices.data.map((price) => ({
    id: price.id,
    productId:
      typeof price.product === 'string' ? price.product : price.product.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
    trialPeriodDays: price.recurring?.trial_period_days
  }));
}

export async function getStripeProducts() {
  const products = await executeWithResilience(
    'stripe_product_list',
    () =>
      stripe.products.list({
        active: true,
        expand: ['data.default_price']
      }),
    { breakerKey: 'stripe:products', timeoutMs: 10000, retries: 2 }
  );

  return products.data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    defaultPriceId:
      typeof product.default_price === 'string'
        ? product.default_price
        : product.default_price?.id
  }));
}
