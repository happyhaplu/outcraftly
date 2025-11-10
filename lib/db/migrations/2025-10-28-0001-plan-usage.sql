CREATE TABLE team_usage_limits (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  month_start DATE NOT NULL,
  prospects_used INTEGER NOT NULL DEFAULT 0,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT team_usage_limits_team_month_unique UNIQUE (team_id, month_start)
);

CREATE INDEX team_usage_limits_team_idx ON team_usage_limits(team_id);
