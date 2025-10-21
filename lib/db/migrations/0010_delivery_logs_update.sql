-- US16 Delivery Logs & Error Handling adjustments

BEGIN;

-- Normalise existing status values so they can be migrated to the enum type
UPDATE "delivery_logs"
SET "status" = 'sent'
WHERE "status" = 'send';

-- Create enum type for delivery status if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE "delivery_status" AS ENUM ('sent', 'failed', 'retrying');
  END IF;
END $$;

-- Ensure the error column uses the new naming convention before altering other attributes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'delivery_logs'
      AND column_name = 'error'
  ) THEN
    ALTER TABLE "delivery_logs" RENAME COLUMN "error" TO "error_message";
  END IF;
END $$;

-- Align column defaults and types
ALTER TABLE "delivery_logs"
  ALTER COLUMN "status" DROP DEFAULT;

-- Cast the status column to the new enum type
ALTER TABLE "delivery_logs"
  ALTER COLUMN "status" TYPE "delivery_status" USING "status"::"delivery_status";

-- Add attempts column when missing
ALTER TABLE "delivery_logs"
  ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;

-- Ensure error_message column is present even if it already existed under the new name
ALTER TABLE "delivery_logs"
  ALTER COLUMN "error_message" TYPE text;

COMMIT;
