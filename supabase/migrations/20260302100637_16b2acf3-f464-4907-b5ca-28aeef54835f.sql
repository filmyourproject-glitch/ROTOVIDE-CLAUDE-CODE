ALTER TABLE media_files
ADD COLUMN IF NOT EXISTS face_keyframes JSONB;