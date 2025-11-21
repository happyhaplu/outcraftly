import { Check } from 'lucide-react';
import { getStripePrices, getStripeProducts } from '@/lib/payments/stripe';
import { SubmitButton } from './submit-button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { checkoutAction } from '@/lib/payments/actions';

// Prices are fresh for one hour max
export const revalidate = 3600;

export default async function PricingPage() {
  const [prices, products] = await Promise.all([
    getStripePrices(),
    getStripeProducts(),
  ]);

  const basePlan = products.find((product) => product.name === 'Base');
  const plusPlan = products.find((product) => product.name === 'Plus');

  const basePrice = prices.find((price) => price.productId === basePlan?.id);
  const plusPrice = prices.find((price) => price.productId === plusPlan?.id);

  return (
    <main className="relative isolate">
      <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/20 via-transparent to-transparent" />
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm uppercase tracking-widest text-primary/80">
            Billing
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-foreground">
            Choose the plan that grows with you
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Simple pricing, predictable billing, and instant access to the
            features your team relies on.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <PricingCard
            name={basePlan?.name || 'Base'}
            price={basePrice?.unitAmount || 800}
            interval={basePrice?.interval || 'month'}
            trialDays={basePrice?.trialPeriodDays || 14}
            features={[
              'Unlimited usage',
              'Unlimited workspace members',
              'Email support'
            ]}
            priceId={basePrice?.id}
            highlight={false}
          />
          <PricingCard
            name={plusPlan?.name || 'Plus'}
            price={plusPrice?.unitAmount || 1200}
            interval={plusPrice?.interval || 'month'}
            trialDays={plusPrice?.trialPeriodDays || 14}
            features={[
              'Everything in Base',
              'Early access to new features',
              '24/7 support with shared Slack'
            ]}
            priceId={plusPrice?.id}
            highlight
          />
        </div>
      </div>
    </main>
  );
}

function PricingCard({
  name,
  price,
  interval,
  trialDays,
  features,
  priceId,
  highlight,
}: {
  name: string;
  price: number;
  interval: string;
  trialDays: number;
  features: string[];
  priceId?: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`relative overflow-hidden ${
        highlight ? 'border-primary/40 shadow-lg' : 'border-border shadow-md'
      }`}
    >
      {highlight && (
        <div className="absolute right-4 top-4 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          Most popular
        </div>
      )}
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl font-semibold">{name}</CardTitle>
        <CardDescription>Start with a {trialDays}-day free trial.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <span className="text-4xl font-semibold text-foreground">
            ${price / 100}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            per user / {interval}
          </span>
        </div>
        <ul className="space-y-3 text-sm text-foreground">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="mt-0.5 rounded-full bg-primary/10 p-1 text-primary">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <form action={checkoutAction} className="w-full">
          <input type="hidden" name="priceId" value={priceId} aria-label="Selected price plan" />
          <SubmitButton />
        </form>
      </CardFooter>
    </Card>
  );
}
