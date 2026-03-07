-- Create rosters table for cloud storage
CREATE TABLE IF NOT EXISTS rosters (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rosters_user_id ON rosters(user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_updated_at ON rosters(user_id, updated_at);

-- Row Level Security
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own rosters"
  ON rosters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rosters"
  ON rosters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rosters"
  ON rosters FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own rosters"
  ON rosters FOR DELETE
  USING (auth.uid() = user_id);
