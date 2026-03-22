ALTER TABLE media_files
ADD COLUMN IF NOT EXISTS face_crop_x float,
ADD COLUMN IF NOT EXISTS face_crop_y float,
ADD COLUMN IF NOT EXISTS face_confidence float;