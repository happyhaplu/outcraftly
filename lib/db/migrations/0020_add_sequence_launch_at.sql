-- Add `launch_at` and `launched_at` columns to sequences for scheduled activation
ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS launch_at timestamp,
  ADD COLUMN IF NOT EXISTS launched_at timestamp;

-- Make sure the enum includes 'draft' (migration may be applied after older deployments)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sequence_status') THEN
    RAISE NOTICE 'sequence_status enum not present; skipping enum check';
  END IF;
END$$;

-- Optional: backfill launched_at for any sequences that are already active and have no launched_at
UPDATE sequences SET launched_at = updated_at WHERE launched_at IS NULL AND status = 'active';
