-- Add skipped_at column for contact sequence status tracking

ALTER TABLE contact_sequence_status
  ADD COLUMN IF NOT EXISTS skipped_at timestamp;
