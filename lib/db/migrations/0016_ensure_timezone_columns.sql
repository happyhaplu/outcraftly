-- Ensure timezone columns exist for contacts and users

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS timezone varchar(100);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone varchar(100);
