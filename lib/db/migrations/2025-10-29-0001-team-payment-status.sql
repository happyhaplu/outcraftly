DO $$
BEGIN
	CREATE TYPE payment_status AS ENUM ('trial', 'unpaid', 'paid');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'unpaid';
