
-- Add project type column (music_video or long_to_shorts)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'music_video';

-- Create project_clips table for Long to Shorts feature
CREATE TABLE public.project_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  clip_index integer NOT NULL,
  start_time double precision NOT NULL,
  end_time double precision NOT NULL,
  score double precision DEFAULT 0,
  label text,
  status text DEFAULT 'pending',
  mux_asset_id text,
  mux_playback_id text,
  download_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.project_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their clips" ON public.project_clips
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
