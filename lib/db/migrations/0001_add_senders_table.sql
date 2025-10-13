CREATE TABLE IF NOT EXISTS "senders" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer NOT NULL,
	"username" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "senders_team_email_idx" ON "senders" ("team_id","email");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "senders" ADD CONSTRAINT "senders_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
