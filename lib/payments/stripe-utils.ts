import Stripe from 'stripe';

/**
 * Shared Stripe API version constant with type assertion to avoid TS2322 errors
 * when the installed @stripe/stripe-node types have a different literal union.
 */
export const STRIPE_API_VERSION = ('2024-06-20' as unknown) as Stripe.StripeConfig['apiVersion'];

/**
 * Environment variable helper that throws if the key is missing.
 */
export function ensureEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    const message = `${name} is required but not set in environment`;
    console.error(`[stripe] ${message}`);
    throw new Error(message);
  }
  return value;
}

/**
 * Create a Stripe client instance at runtime.
 * This ensures Stripe is not initialized during build time.
 */
export function createStripeClient(): Stripe {
  return new Stripe(ensureEnv('STRIPE_SECRET_KEY'), {
    apiVersion: STRIPE_API_VERSION
  });
}

/**
 * Get the base URL for constructing redirect URLs.
 * Falls back to localhost:3000 if BASE_URL is not set.
 */
export function getBaseUrl(): string {
  return process.env.BASE_URL || 'http://localhost:3000';
}
