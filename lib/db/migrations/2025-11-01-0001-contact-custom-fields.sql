-- Migration: Introduce custom field definitions and values for contacts
-- Adds enum and tables to manage team-scoped custom metadata on contacts.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_custom_field_type') THEN
        CREATE TYPE contact_custom_field_type AS ENUM ('text', 'number', 'date');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS contact_custom_field_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name varchar(120) NOT NULL,
    key varchar(120) NOT NULL,
    type contact_custom_field_type NOT NULL,
    description text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_custom_field_definitions_team_key_idx
    ON contact_custom_field_definitions(team_id, key);

CREATE INDEX IF NOT EXISTS contact_custom_field_definitions_team_idx
    ON contact_custom_field_definitions(team_id);

CREATE TABLE IF NOT EXISTS contact_custom_field_values (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    field_id uuid NOT NULL REFERENCES contact_custom_field_definitions(id) ON DELETE CASCADE,
    text_value text,
    number_value real,
    date_value date,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_custom_field_values_unique
    ON contact_custom_field_values(contact_id, field_id);

CREATE INDEX IF NOT EXISTS contact_custom_field_values_contact_idx
    ON contact_custom_field_values(contact_id);

CREATE INDEX IF NOT EXISTS contact_custom_field_values_field_idx
    ON contact_custom_field_values(field_id);

COMMIT;
