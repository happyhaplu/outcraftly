import { createStripeClient } from '../payments/stripe-utils';
import { db } from './drizzle';
import { users, teams, teamMembers, senders, contacts, plans } from './schema';
import { hashPassword } from '@/lib/auth/session';
import { eq, and, sql } from 'drizzle-orm';
import { DEFAULT_PLAN_DEFINITIONS } from '@/lib/config/plans';

async function ensurePlansTable() {
  console.log('Ensuring plans table exists...');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS plans (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      max_emails_per_month INTEGER NOT NULL,
      max_prospects INTEGER NOT NULL,
      max_credits INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_trial BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS plans_name_idx ON plans(name)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS plans_active_idx ON plans(is_active)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS plans_trial_idx ON plans(is_trial)`);
}

async function ensureTeamPaymentStatusColumn() {
  console.log('Ensuring team payment status column exists...');

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'payment_status'
      ) THEN
        CREATE TYPE payment_status AS ENUM ('trial', 'unpaid', 'paid');
      END IF;
    END;
    $$;
  `);

  await db.execute(sql`
    ALTER TABLE IF EXISTS teams
    ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'unpaid'
  `);
}

async function ensureSenderMailColumns() {
  console.log('Ensuring sender SMTP and inbound columns exist...');

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sender_security') THEN
        CREATE TYPE sender_security AS ENUM ('SSL/TLS', 'STARTTLS', 'None');
      END IF;
    END;
    $$;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbound_protocol') THEN
        CREATE TYPE inbound_protocol AS ENUM ('IMAP', 'POP3');
      END IF;
    END;
    $$;
  `);

  await db.execute(sql`
    ALTER TABLE IF EXISTS senders
      ADD COLUMN IF NOT EXISTS smtp_security sender_security,
      ADD COLUMN IF NOT EXISTS inbound_host varchar(255),
      ADD COLUMN IF NOT EXISTS inbound_port integer,
      ADD COLUMN IF NOT EXISTS inbound_security sender_security,
      ADD COLUMN IF NOT EXISTS inbound_protocol inbound_protocol;
  `);

  await db.execute(sql`
    UPDATE senders
    SET smtp_security = 'SSL/TLS'
    WHERE smtp_security IS NULL;
  `);

  await db.execute(sql`
    ALTER TABLE senders
      ALTER COLUMN smtp_security SET DEFAULT 'SSL/TLS',
      ALTER COLUMN smtp_security SET NOT NULL;
  `);
}

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  const stripe = createStripeClient();

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
  await ensureTeamPaymentStatusColumn();
  await ensurePlansTable();
  await ensureSenderMailColumns();
  console.log('Ensuring default plans...');
  for (const definition of DEFAULT_PLAN_DEFINITIONS) {
    await db
      .insert(plans)
      .values({
        name: definition.name,
        maxEmailsPerMonth: definition.limits.emailsPerMonth,
        maxProspects: definition.limits.prospects,
        maxCredits: definition.limits.credits,
        isActive: definition.isActive ?? true,
        isTrial: definition.isTrial ?? false,
        sortOrder: definition.sortOrder
      })
      .onConflictDoUpdate({
        target: plans.name,
        set: {
          maxEmailsPerMonth: definition.limits.emailsPerMonth,
          maxProspects: definition.limits.prospects,
          maxCredits: definition.limits.credits,
          isActive: definition.isActive ?? true,
          isTrial: definition.isTrial ?? false,
          sortOrder: definition.sortOrder,
          updatedAt: new Date()
        }
      });
  }

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
        role: 'user',
        signupDate: new Date(),
        trialExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        plan: 'Starter',
        status: 'active',
      })
      .returning()
      .then((rows) => rows[0]));

  if (!existingUser[0]) {
    console.log('Initial user created.');
  } else {
    console.log('Seed user already exists. Skipping creation.');
  }

  const adminEmail = 'happy.outcraftly@zohomail.in';
  const adminPassword = 'System@123321';

  const existingAdmin = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  if (!existingAdmin[0]) {
    const adminPasswordHash = await hashPassword(adminPassword);
    await db.insert(users).values({
      name: 'Outcraftly Admin',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: 'admin',
      signupDate: new Date(),
      trialExpiresAt: null,
      plan: 'Scale Plus',
      status: 'active',
    });
    console.log('Default admin account created.');
  } else {
    if (existingAdmin[0].role !== 'admin') {
      await db
        .update(users)
        .set({
          role: 'admin',
          plan: 'Scale Plus',
          status: 'active',
          signupDate: existingAdmin[0].signupDate ?? new Date(),
        })
        .where(eq(users.id, existingAdmin[0].id));
      console.log('Existing admin user role updated to admin.');
    } else {
      await db
        .update(users)
        .set({
          plan: 'Scale Plus',
          status: 'active',
          signupDate: existingAdmin[0].signupDate ?? new Date(),
        })
        .where(eq(users.id, existingAdmin[0].id));
      console.log('Default admin account already present.');
    }
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
        paymentStatus: 'paid'
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
        smtpSecurity: 'SSL/TLS',
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
        smtpSecurity: 'SSL/TLS',
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
