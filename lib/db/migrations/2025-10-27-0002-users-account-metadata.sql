-- Migration: Add plan/status metadata to users for admin management
-- Introduces signup date tracking, trial expiration, plan selection, and account status.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_plan') THEN
        CREATE TYPE user_plan AS ENUM ('Starter', 'Pro', 'Scale', 'Scale Plus');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
        CREATE TYPE user_status AS ENUM ('active', 'inactive');
    END IF;
END $$;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS signup_date timestamp DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS trial_expires_at timestamp,
    ADD COLUMN IF NOT EXISTS plan user_plan DEFAULT 'Starter',
    ADD COLUMN IF NOT EXISTS status user_status DEFAULT 'active';

UPDATE users
SET signup_date = COALESCE(signup_date, created_at)
WHERE signup_date IS NULL;

ALTER TABLE users
    ALTER COLUMN signup_date SET NOT NULL,
    ALTER COLUMN plan SET NOT NULL,
    ALTER COLUMN status SET NOT NULL;

COMMIT;

-- Down migration omitted to avoid data loss and enum removal complexity.
