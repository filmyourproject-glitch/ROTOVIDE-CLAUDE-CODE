-- Phase 4: Manifest-aware exports + granular progress tracking
--
-- manifest_id: traces which EditManifest was used for this export (NULL for legacy exports)
-- progress: JSONB with real-time render progress from Railway
--   { step, segments_done, segments_total, percent, eta_seconds, started_at }

ALTER TABLE public.exports
  ADD COLUMN IF NOT EXISTS manifest_id UUID REFERENCES edit_manifests(id),
  ADD COLUMN IF NOT EXISTS progress JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_exports_manifest_id ON exports(manifest_id);

COMMENT ON COLUMN exports.manifest_id IS 'EditManifest used for this export, NULL for legacy exports';
COMMENT ON COLUMN exports.progress IS 'Granular render progress: {step, segments_done, segments_total, percent, eta_seconds}';
