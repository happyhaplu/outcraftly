-- Migration: Ensure senders table has SMTP security and inbound mail fields
-- Adds columns expected by the application schema and backfills defaults.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sender_security') THEN
        CREATE TYPE sender_security AS ENUM ('SSL/TLS', 'STARTTLS', 'None');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbound_protocol') THEN
        CREATE TYPE inbound_protocol AS ENUM ('IMAP', 'POP3');
    END IF;
END $$;

ALTER TABLE senders
    ADD COLUMN IF NOT EXISTS smtp_security sender_security,
    ADD COLUMN IF NOT EXISTS inbound_host varchar(255),
    ADD COLUMN IF NOT EXISTS inbound_port integer,
    ADD COLUMN IF NOT EXISTS inbound_security sender_security,
    ADD COLUMN IF NOT EXISTS inbound_protocol inbound_protocol;

UPDATE senders
SET smtp_security = 'SSL/TLS'
WHERE smtp_security IS NULL;

ALTER TABLE senders
    ALTER COLUMN smtp_security SET DEFAULT 'SSL/TLS',
    ALTER COLUMN smtp_security SET NOT NULL;

COMMIT;
