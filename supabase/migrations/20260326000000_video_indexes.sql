-- Phase 5: Gemini Video Understanding — video_indexes table
-- Stores structured scene analysis per media_file from Gemini 2.5 Flash

CREATE TABLE IF NOT EXISTS public.video_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_file_id UUID NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Gemini analysis results
  scene_descriptions JSONB NOT NULL DEFAULT '[]',
  visual_summary TEXT,

  -- Processing metadata
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  error_message TEXT,
  gemini_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  token_count INTEGER,
  processing_time_ms INTEGER,

  -- Cache management
  indexed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One index per media file (idempotency)
  UNIQUE(media_file_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_video_indexes_project_id ON video_indexes(project_id);
CREATE INDEX IF NOT EXISTS idx_video_indexes_status ON video_indexes(status);

-- RLS: follows the exact pattern from edit_manifests
ALTER TABLE video_indexes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own video indexes" ON video_indexes
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add to realtime publication for status polling from frontend
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_indexes;
