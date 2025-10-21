ALTER TYPE "sequence_delivery_status" ADD VALUE IF NOT EXISTS 'failed';

ALTER TABLE "contact_sequence_status"
  ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "delivery_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid NOT NULL REFERENCES "contacts" ("id") ON DELETE CASCADE,
  "sequence_id" uuid NOT NULL REFERENCES "sequences" ("id") ON DELETE CASCADE,
  "step_id" uuid NOT NULL REFERENCES "sequence_steps" ("id") ON DELETE CASCADE,
  "status" varchar(20) NOT NULL,
  "message_id" text,
  "error" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "delivery_logs_contact_idx" ON "delivery_logs" ("contact_id");
CREATE INDEX IF NOT EXISTS "delivery_logs_sequence_idx" ON "delivery_logs" ("sequence_id");
