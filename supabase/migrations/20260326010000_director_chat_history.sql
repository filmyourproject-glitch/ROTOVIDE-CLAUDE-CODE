-- Add director_chat_history column for persisting AI Director Chat messages
ALTER TABLE projects ADD COLUMN IF NOT EXISTS director_chat_history jsonb DEFAULT '[]'::jsonb;
