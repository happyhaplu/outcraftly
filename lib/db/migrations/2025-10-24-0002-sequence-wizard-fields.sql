-- Migration: Add tracking, scheduling, and stop condition fields for sequence wizard
-- Adds boolean flags and schedule metadata required by the new multi-step creation flow.

BEGIN;

ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS track_opens boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS track_clicks boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_unsubscribe boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stop_condition varchar(32) NOT NULL DEFAULT 'on_reply',
  ADD COLUMN IF NOT EXISTS stop_on_bounce boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_mode varchar(16),
  ADD COLUMN IF NOT EXISTS schedule_send_time varchar(5),
  ADD COLUMN IF NOT EXISTS schedule_window_start varchar(5),
  ADD COLUMN IF NOT EXISTS schedule_window_end varchar(5),
  ADD COLUMN IF NOT EXISTS schedule_respect_timezone boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS schedule_fallback_timezone varchar(100);

COMMIT;

-- Down migration intentionally omitted: removing columns risks data loss.
