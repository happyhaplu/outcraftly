-- Link sequences to a specific sender account

ALTER TABLE sequences
  ADD COLUMN IF NOT EXISTS sender_id integer;

ALTER TABLE sequences
  ADD CONSTRAINT IF NOT EXISTS sequences_sender_id_fkey
  FOREIGN KEY (sender_id)
  REFERENCES senders(id)
  ON DELETE SET NULL;
