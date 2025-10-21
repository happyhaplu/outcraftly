-- Add lifecycle status to sequences for pause/resume support

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sequence_status') THEN
    CREATE TYPE sequence_status AS ENUM ('active', 'paused');
  END IF;
END
$$;

ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS status sequence_status NOT NULL DEFAULT 'active';

UPDATE sequences
  SET status = 'active'
  WHERE status IS NULL;

ALTER TABLE sequences
  ALTER COLUMN status SET DEFAULT 'active';
