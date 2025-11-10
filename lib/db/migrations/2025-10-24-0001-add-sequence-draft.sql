-- Migration: Add 'draft' to sequence_status enum
-- NOTE: Dropping enum values in Postgres is non-trivial. The down migration below is intentionally a no-op because removing an enum value that may be in use would be destructive.

BEGIN;

-- Add the new enum value. If your Postgres version supports IF NOT EXISTS for ALTER TYPE you can adjust accordingly.
ALTER TYPE sequence_status ADD VALUE 'draft';

COMMIT;

-- Down: no-op (manual intervention required to remove enum values safely)
-- To roll back, you must ensure no rows reference the value and recreate the enum without it (complex and environment-specific).