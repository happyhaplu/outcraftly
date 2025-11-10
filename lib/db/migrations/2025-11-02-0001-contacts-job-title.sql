-- Migration: Ensure contacts.job_title column exists for job title support
-- Adds the job_title column if it has not already been created (legacy databases may be missing it).

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS job_title varchar(150);
