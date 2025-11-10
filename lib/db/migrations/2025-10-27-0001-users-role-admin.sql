-- Migration: Restrict users.role to administrator-aware enum values
-- Ensures all existing accounts default to the "user" role and introduces
-- the "admin" role for privileged access.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('user', 'admin');
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

UPDATE users
SET role = 'user'
WHERE role IS NULL OR role NOT IN ('admin');

ALTER TABLE users
ALTER COLUMN role TYPE user_role
USING (
    CASE
        WHEN role = 'admin' THEN 'admin'::user_role
        ELSE 'user'::user_role
    END
);

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE users ALTER COLUMN role SET NOT NULL;

COMMIT;

-- Down migration omitted to avoid removing the enum or role assignments.
