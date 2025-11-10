DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'delivery_status'
          AND e.enumlabel = 'skipped'
    ) THEN
        ALTER TYPE delivery_status ADD VALUE 'skipped';
    END IF;
END $$;

ALTER TABLE delivery_logs ADD COLUMN IF NOT EXISTS status_id uuid;
ALTER TABLE delivery_logs ADD COLUMN IF NOT EXISTS skip_reason text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'delivery_logs_status_id_fkey'
    ) THEN
        ALTER TABLE delivery_logs
            ADD CONSTRAINT delivery_logs_status_id_fkey
            FOREIGN KEY (status_id) REFERENCES contact_sequence_status(id) ON DELETE SET NULL;
    END IF;
END $$;
