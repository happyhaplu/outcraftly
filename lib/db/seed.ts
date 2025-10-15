import { stripe } from '../payments/stripe';
import { db } from './drizzle';
import { users, teams, teamMembers, senders, contacts } from './schema';
import { hashPassword } from '@/lib/auth/session';
import { eq, and } from 'drizzle-orm';

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  const baseProduct = await stripe.products.create({
    name: 'Base',
    description: 'Base subscription plan',
  });

  await stripe.prices.create({
    product: baseProduct.id,
    unit_amount: 800, // $8 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  const plusProduct = await stripe.products.create({
    name: 'Plus',
    description: 'Plus subscription plan',
  });

  await stripe.prices.create({
    product: plusProduct.id,
    unit_amount: 1200, // $12 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  console.log('Stripe products and prices created successfully.');
}

async function seed() {
  const email = 'test@test.com';
  const password = 'admin123';
  const passwordHash = await hashPassword(password);

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user =
    existingUser[0] ??
    (await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role: 'owner',
      })
      .returning()
      .then((rows) => rows[0]));

  if (!existingUser[0]) {
    console.log('Initial user created.');
  } else {
    console.log('Seed user already exists. Skipping creation.');
  }

  const existingTeam = await db
    .select()
    .from(teams)
    .where(eq(teams.name, 'Test Team'))
    .limit(1);

  const team =
    existingTeam[0] ??
    (await db
      .insert(teams)
      .values({
        name: 'Test Team',
      })
      .returning()
      .then((rows) => rows[0]));

  const existingMember = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, user.id)))
    .limit(1);

  if (!existingMember[0]) {
    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: user.id,
      role: 'owner',
    });
  }

  await db
    .insert(senders)
    .values([
      {
        teamId: team.id,
        name: 'Sales Team',
        email: 'sales@example.com',
        host: 'smtp.sales.example.com',
        port: 587,
        username: 'sales-user',
        password: 'placeholder-secret',
        status: 'verified',
        bounceRate: 1.4,
        quotaUsed: 420,
        quotaLimit: 1000,
      },
      {
        teamId: team.id,
        name: 'Marketing',
        email: 'marketing@example.com',
        host: 'smtp.marketing.example.com',
        port: 465,
        username: 'marketing-user',
        password: 'placeholder-secret',
        status: 'active',
        bounceRate: 3.1,
        quotaUsed: 680,
        quotaLimit: 1200,
      },
    ])
    .onConflictDoNothing({ target: [senders.teamId, senders.email] });

  await db
    .insert(contacts)
    .values([
      {
        teamId: team.id,
        firstName: 'Avery',
        lastName: 'Stone',
        email: 'avery.stone@example.com',
        company: 'Stone & Co.',
        tags: ['prospect', 'north america'],
      },
      {
        teamId: team.id,
        firstName: 'Jordan',
        lastName: 'Lee',
        email: 'jordan.lee@example.com',
        company: 'Lee Ventures',
        tags: ['warm lead'],
      },
    ])
    .onConflictDoNothing({ target: [contacts.teamId, contacts.email] });

  await createStripeProducts();
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
