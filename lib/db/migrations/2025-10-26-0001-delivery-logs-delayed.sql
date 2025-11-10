DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'delivery_status'
          AND e.enumlabel = 'delayed'
    ) THEN
        ALTER TYPE delivery_status ADD VALUE 'delayed';
    END IF;
END $$;
