ALTER TABLE "sequence_steps"
  ADD COLUMN "skip_if_replied" boolean NOT NULL DEFAULT false,
  ADD COLUMN "skip_if_bounced" boolean NOT NULL DEFAULT false,
  ADD COLUMN "delay_if_replied" integer;
