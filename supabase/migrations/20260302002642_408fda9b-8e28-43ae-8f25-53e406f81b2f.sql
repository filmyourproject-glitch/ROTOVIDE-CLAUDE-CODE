
-- Add proxy_storage_path and status columns to media_files
ALTER TABLE public.media_files
ADD COLUMN IF NOT EXISTS proxy_storage_path text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'uploading';

-- Create media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can upload to their own folder
CREATE POLICY "Users can upload their own media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can read their own media
CREATE POLICY "Users can read their own media"
ON storage.objects FOR SELECT
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can update their own media
CREATE POLICY "Users can update their own media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own media
CREATE POLICY "Users can delete their own media"
ON storage.objects FOR DELETE
USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
