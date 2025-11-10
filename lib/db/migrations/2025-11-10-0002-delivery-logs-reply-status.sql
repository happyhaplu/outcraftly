-- Ensure reply-related states are available for delivery log entries.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'delivery_status'
          AND e.enumlabel = 'replied'
    ) THEN
        ALTER TYPE delivery_status ADD VALUE 'replied';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'delivery_status'
          AND e.enumlabel = 'manual_send'
    ) THEN
        ALTER TYPE delivery_status ADD VALUE 'manual_send';
    END IF;
END $$;
