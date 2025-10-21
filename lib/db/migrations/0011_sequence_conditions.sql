-- US11 Sequence Conditions adjustments

BEGIN;

-- Extend delivery status enum to support skipped state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'sequence_delivery_status'
      AND e.enumlabel = 'skipped'
  ) THEN
    ALTER TYPE "sequence_delivery_status" ADD VALUE 'skipped';
  END IF;
END $$;

-- Add skipped_at timestamp to contact sequence status records
ALTER TABLE "contact_sequence_status"
  ADD COLUMN IF NOT EXISTS "skipped_at" timestamp;

-- Backfill skipped_at for contacts that already replied or bounced
UPDATE "contact_sequence_status"
SET "skipped_at" = COALESCE("reply_at", "bounce_at")
WHERE "skipped_at" IS NULL AND ("reply_at" IS NOT NULL OR "bounce_at" IS NOT NULL);

COMMIT;
