-- Phase 2: per-clip sync metadata, edit manifests, director chats

-- Bug A: store per-clip cross-correlation results from /sync-clips
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS sync_offset_samples INTEGER;
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS sync_confidence NUMERIC;

-- Edit manifest versions (AI-generated edit decisions as JSON)
CREATE TABLE IF NOT EXISTS edit_manifests (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  style_label TEXT NOT NULL CHECK (style_label IN ('high_energy', 'cinematic', 'slow_mood', 'custom')),
  manifest JSONB NOT NULL,
  parent_id UUID REFERENCES edit_manifests(id),
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edit_manifests_project_id ON edit_manifests(project_id);
CREATE INDEX IF NOT EXISTS idx_edit_manifests_style ON edit_manifests(style_label);

-- Director chat history (one conversation per project)
CREATE TABLE IF NOT EXISTS director_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  gemini_cache_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_director_chats_project_id ON director_chats(project_id);

-- RLS
ALTER TABLE edit_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE director_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own manifests" ON edit_manifests
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own chats" ON director_chats
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
