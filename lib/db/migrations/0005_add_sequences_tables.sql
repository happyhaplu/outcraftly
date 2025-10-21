CREATE TABLE IF NOT EXISTS "sequences" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "team_id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "sequences_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE,
    CONSTRAINT "sequences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "sequence_steps" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "sequence_id" uuid NOT NULL,
    "order" integer NOT NULL,
    "subject" text NOT NULL,
    "body" text NOT NULL,
    "delay_hours" integer NOT NULL DEFAULT 0,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "sequence_steps_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "sequence_steps_sequence_order_idx" ON "sequence_steps" ("sequence_id", "order");
