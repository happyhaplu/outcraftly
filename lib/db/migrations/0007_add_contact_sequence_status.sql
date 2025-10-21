CREATE TYPE "sequence_delivery_status" AS ENUM ('pending', 'sent', 'replied', 'bounced');

CREATE TABLE "contact_sequence_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid NOT NULL,
  "sequence_id" uuid NOT NULL,
  "step_id" uuid,
  "status" "sequence_delivery_status" NOT NULL DEFAULT 'pending',
  "last_updated" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "contact_sequence_status_contact_id_contacts_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE,
  CONSTRAINT "contact_sequence_status_sequence_id_sequences_id_fk"
    FOREIGN KEY ("sequence_id") REFERENCES "sequences" ("id") ON DELETE CASCADE,
  CONSTRAINT "contact_sequence_status_step_id_sequence_steps_id_fk"
    FOREIGN KEY ("step_id") REFERENCES "sequence_steps" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "contact_sequence_status_contact_sequence_idx"
  ON "contact_sequence_status" ("contact_id", "sequence_id");

CREATE INDEX "contact_sequence_status_sequence_status_idx"
  ON "contact_sequence_status" ("sequence_id", "status");
