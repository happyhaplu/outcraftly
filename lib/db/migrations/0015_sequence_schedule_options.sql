-- Add per-contact schedule settings for sequence deliveries

ALTER TABLE contact_sequence_status
  ADD COLUMN IF NOT EXISTS schedule_mode varchar(10),
  ADD COLUMN IF NOT EXISTS schedule_send_time varchar(5),
  ADD COLUMN IF NOT EXISTS schedule_window_start varchar(5),
  ADD COLUMN IF NOT EXISTS schedule_window_end varchar(5),
  ADD COLUMN IF NOT EXISTS schedule_respect_timezone boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS schedule_fallback_timezone varchar(100);
