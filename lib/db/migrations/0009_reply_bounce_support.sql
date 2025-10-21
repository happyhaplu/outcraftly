ALTER TYPE "sequence_delivery_status" ADD VALUE IF NOT EXISTS 'failed';

ALTER TABLE "contact_sequence_status"
  ADD COLUMN IF NOT EXISTS "reply_at" timestamp,
  ADD COLUMN IF NOT EXISTS "bounce_at" timestamp;

ALTER TABLE "delivery_logs"
  ADD COLUMN IF NOT EXISTS "type" varchar(20) NOT NULL DEFAULT 'send',
  ADD COLUMN IF NOT EXISTS "payload" jsonb,
  ALTER COLUMN "status" SET DEFAULT 'send';

CREATE INDEX IF NOT EXISTS "delivery_logs_message_idx" ON "delivery_logs" ("message_id");
