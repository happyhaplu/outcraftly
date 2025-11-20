-- Add draft lifecycle status for sequences and update defaults

DO $$
BEGIN
  -- Ensure the enum exists before attempting to alter it. If the enum exists but
  -- the label 'draft' is missing, add it. Otherwise skip to avoid errors.
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sequence_status') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'sequence_status'
        AND e.enumlabel = 'draft'
    ) THEN
      ALTER TYPE sequence_status ADD VALUE 'draft';
    ELSE
      RAISE NOTICE 'sequence_status enum already has label ''draft''; skipping';
    END IF;
  ELSE
    RAISE NOTICE 'sequence_status enum not present; skipping add of ''draft''';
  END IF;
END
$$;

DO $$
BEGIN
  -- Only set default to 'draft' if the sequences table and status column exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'sequences' 
      AND column_name = 'status'
  ) THEN
    ALTER TABLE sequences ALTER COLUMN status SET DEFAULT 'draft';
  ELSE
    RAISE NOTICE 'sequences.status column does not exist; skipping SET DEFAULT';
  END IF;
END
$$;
