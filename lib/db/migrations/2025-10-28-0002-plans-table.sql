DO $$
BEGIN
  ALTER TYPE "user_plan" ADD VALUE IF NOT EXISTS 'Trial';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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
);

CREATE UNIQUE INDEX IF NOT EXISTS plans_name_idx ON plans(name);
CREATE INDEX IF NOT EXISTS plans_active_idx ON plans(is_active);
CREATE INDEX IF NOT EXISTS plans_trial_idx ON plans(is_trial);

INSERT INTO plans (name, max_emails_per_month, max_prospects, max_credits, is_active, is_trial, sort_order)
VALUES
  ('Trial', 100, 50, 25, TRUE, TRUE, 0),
  ('Starter', 2000, 500, 100, TRUE, FALSE, 1),
  ('Pro', 10000, 2500, 500, TRUE, FALSE, 2),
  ('Scale', 50000, 10000, 2000, TRUE, FALSE, 3),
  ('Scale Plus', 150000, 30000, 5000, TRUE, FALSE, 4)
ON CONFLICT (name) DO UPDATE
SET
  max_emails_per_month = EXCLUDED.max_emails_per_month,
  max_prospects = EXCLUDED.max_prospects,
  max_credits = EXCLUDED.max_credits,
  is_active = EXCLUDED.is_active,
  is_trial = EXCLUDED.is_trial,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
