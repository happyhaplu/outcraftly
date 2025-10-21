-- Add indexes to speed up sequence status aggregation and filtering

CREATE INDEX IF NOT EXISTS idx_contact_sequence_status_sequence_id ON contact_sequence_status (sequence_id);
CREATE INDEX IF NOT EXISTS idx_contact_sequence_status_status ON contact_sequence_status (status);
CREATE INDEX IF NOT EXISTS idx_contact_sequence_status_sequence_status ON contact_sequence_status (sequence_id, status);
CREATE INDEX IF NOT EXISTS idx_contact_sequence_status_step_id ON contact_sequence_status (step_id);

-- Consider adding partial indexes for replied/bounced/skipped timestamps if needed in future
