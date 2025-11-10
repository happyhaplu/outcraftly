-- Migration: Add timezone, day selection, and multiple window support for sequences
-- Adds schedule metadata columns to sequences and contact_sequence_status to support
-- advanced timezone-aware delivery windows.

BEGIN;

ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS schedule_timezone varchar(100),
  ADD COLUMN IF NOT EXISTS schedule_send_days jsonb,
  ADD COLUMN IF NOT EXISTS schedule_send_windows jsonb;

ALTER TABLE contact_sequence_status
  ADD COLUMN IF NOT EXISTS schedule_timezone varchar(100),
  ADD COLUMN IF NOT EXISTS schedule_send_days jsonb,
  ADD COLUMN IF NOT EXISTS schedule_send_windows jsonb;

COMMIT;

-- Down migration intentionally omitted: removing columns risks data loss.
