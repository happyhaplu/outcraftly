CREATE INDEX IF NOT EXISTS contacts_tags_gin_idx ON contacts USING GIN (tags);
