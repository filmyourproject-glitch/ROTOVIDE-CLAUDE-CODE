-- Phase 13: UX Polish — Editor Tour + Export Progress Tracking

-- Add has_seen_editor_tour to profiles for guided onboarding
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS has_seen_editor_tour BOOLEAN DEFAULT FALSE;

-- Add progress tracking columns to exports table
ALTER TABLE exports
ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS eta_seconds INTEGER,
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Index for fetching processing exports by project
CREATE INDEX IF NOT EXISTS idx_exports_project_status
ON exports (project_id, status)
WHERE status = 'processing';
