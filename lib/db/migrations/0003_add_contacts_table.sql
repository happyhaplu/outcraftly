CREATE TABLE "contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" integer NOT NULL,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "email" varchar(255) NOT NULL,
  "company" varchar(255) NOT NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_team_id_teams_id_fk"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade;

CREATE UNIQUE INDEX "contacts_team_email_idx" ON "contacts" ("team_id", "email");
