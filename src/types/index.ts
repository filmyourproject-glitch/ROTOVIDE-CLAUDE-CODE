export type Plan = 'free' | 'pro'
export type ProjectStatus = 'active' | 'archived'
export type SyncStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type VideoFormat = '9:16' | '16:9' | 'both'
export type StylePreset = 'raw_cut' | 'cinematic' | 'hype' | 'vibe'
export type ColorGrade =
  | 'none'
  | 'cinematic_cool' | 'cinematic_warm' | 'golden_hour' | 'midnight_blue' | 'muted_earth'
  | 'film_kodak' | 'film_fuji' | 'film_portra' | 'film_expired'
  | 'bw_clean' | 'bw_contrast' | 'bw_film_grain' | 'bw_faded'
export type FileType = 'song' | 'performance_clip' | 'broll_clip' | 'export'
export type ClipClassification = 'performance' | 'broll' | 'unclassified'
export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type SectionType = 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro'

export interface Profile {
  id: string
  full_name: string
  plan: Plan
  trial_ends_at: string | null
  trial_used: boolean
  storage_used_bytes: number
  notification_export_complete: boolean
  notification_storage_warning: boolean
  created_at: string
}

// Helper: returns true if user is on Pro plan OR within active trial window
export function isProAccess(profile: Profile): boolean {
  if (profile.plan === 'pro') return true
  if (profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date()) return true
  return false
}

// Helper: returns days remaining in trial (0 if expired or no trial)
export function trialDaysRemaining(profile: Profile): number {
  if (!profile.trial_ends_at) return 0
  const diff = new Date(profile.trial_ends_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export interface Project {
  id: string
  user_id: string
  name: string
  artist_name: string
  song_title: string
  bpm: number | null
  detected_bpm: number | null
  status: ProjectStatus
  sync_status: SyncStatus
  format: VideoFormat
  style_preset: StylePreset
  color_grade: ColorGrade
  color_grade_intensity: number  // 0.0 to 1.0
  trim_start: number | null
  trim_end: number | null
  analysis_data: AnalysisData | null
  timeline_data: TimelineData | null
  raw_storage_bytes: number
  export_storage_bytes: number
  created_at: string
  last_activity_at: string
}

export interface AnalysisData {
  bpm: number
  beats: number[]
  energy_curve: number[]
  sections: Section[]
  duration: number
}

export interface Section {
  type: SectionType
  start: number
  end: number
  energy_avg: number
}

export interface TimelineData {
  duration: number
  format: VideoFormat
  style: StylePreset
  bpm: number
  beats: number[]
  sections: Section[]
  timeline: TimelineClip[]
  effects: Effect[]
  vertical?: TimelineData
  horizontal?: TimelineData
}

export interface TimelineClip {
  id: string
  clip_id: string
  type: 'performance' | 'broll'
  start: number
  end: number
  source_offset: number
  mute_original_audio: boolean
  beat_aligned: boolean
  placement_reason: string
  crop: CropSettings | null
  effects: Effect[]
}

export interface CropSettings {
  strategy: 'smart_center' | 'none'
  width_pct: number
}

export interface Effect {
  type: 'hard_cut' | 'camera_shake' | 'whip_transition' | 'film_burn' | 'zoom_in' |
        'speed_ramp' | 'film_grain' | 'vhs_overlay' | 'slow_dissolve' | 'warm_film_burn'
  at_seconds: number
  duration_seconds?: number
  params: Record<string, unknown>
}

export interface MediaFile {
  id: string
  user_id: string
  project_id: string
  file_type: FileType
  clip_classification: ClipClassification | null
  file_name: string
  storage_path: string | null
  mux_asset_id: string | null
  mux_playback_id: string | null
  mux_upload_id: string | null
  size_bytes: number
  duration_seconds: number | null
  audio_similarity_score: number | null
  waveform_data: number[] | null
  suggested_timeline_position: number | null
  classification_confidence: number | null
  created_at: string
  expires_at: string | null
  deleted_at: string | null
}

export interface Export {
  id: string
  user_id: string
  project_id: string
  format: '9:16' | '16:9'
  mux_asset_id: string | null
  mux_playback_id: string | null
  status: ExportStatus
  settings: ExportSettings
  size_bytes: number | null
  download_url: string | null
  created_at: string
  expires_at: string | null
}

export interface ExportSettings {
  aspect_ratio: '9:16' | '16:9' | '1:1'
  resolution: '720p' | '1080p' | '4k'
  fps: 'source' | 24 | 30 | 60
  codec: 'h264' | 'h265'
  watermark: boolean
  loudness_normalize: boolean
}

export interface PlanLimits {
  max_projects: number
  storage_bytes: number
  export_retention_days: number
  raw_retention_days: number
  watermark: boolean
  styles: boolean
  ai_features: boolean
  resolution_4k: boolean
  codec_h265: boolean
  both_formats: boolean
  priority_render: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    max_projects: 1,
    storage_bytes: 5 * 1024 * 1024 * 1024,            // 5GB
    export_retention_days: 7,
    raw_retention_days: 7,
    watermark: true,
    styles: false,
    ai_features: false,
    resolution_4k: false,
    codec_h265: false,
    both_formats: false,
    priority_render: false,
  },
  pro: {
    max_projects: 50,
    storage_bytes: 1024 * 1024 * 1024 * 1024,          // 1TB
    export_retention_days: 30,
    raw_retention_days: 7,
    watermark: false,
    styles: true,
    ai_features: true,
    resolution_4k: true,
    codec_h265: true,
    both_formats: true,
    priority_render: true,
  },
}

// Trial plan limits — same as Pro during active trial
export const TRIAL_LIMITS = PLAN_LIMITS.pro
