ALTER TABLE "senders" ADD COLUMN "bounce_rate" real DEFAULT 0 NOT NULL;
ALTER TABLE "senders" ADD COLUMN "quota_used" integer DEFAULT 0 NOT NULL;
ALTER TABLE "senders" ADD COLUMN "quota_limit" integer DEFAULT 1000 NOT NULL;
