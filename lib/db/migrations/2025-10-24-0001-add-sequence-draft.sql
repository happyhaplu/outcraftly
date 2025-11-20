-- Migration: Add 'draft' to sequence_status enum
-- Make this migration idempotent and safe when the enum or value is already missing/present.

DO $$
BEGIN
	-- Only attempt to add the value if the enum exists and the label doesn't already exist
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

-- Down: no-op (manual intervention required to remove enum values safely)
-- To roll back, you must ensure no rows reference the value and recreate the enum without it (complex and environment-specific).