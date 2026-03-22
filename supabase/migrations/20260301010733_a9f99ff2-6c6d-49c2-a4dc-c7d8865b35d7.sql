
-- ============================================================
-- MUSICVID AI — COMPLETE SUPABASE SCHEMA
-- ============================================================

-- PROFILES
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  plan text default 'free' check (plan in ('free', 'pro')),
  trial_ends_at timestamptz,
  trial_used boolean default false,
  storage_used_bytes bigint default 0,
  notification_export_complete boolean default true,
  notification_storage_warning boolean default true,
  suspicious_activity boolean default false,
  suspicious_activity_reason text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users own their profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- PROJECTS
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade not null,
  name text not null,
  artist_name text,
  song_title text,
  bpm integer,
  detected_bpm float,
  status text default 'active' check (status in ('active', 'archived')),
  sync_status text default 'pending' check (sync_status in ('pending', 'processing', 'ready', 'failed')),
  format text default '9:16' check (format in ('9:16', '16:9', 'both')),
  style_preset text default 'raw_cut' check (style_preset in ('raw_cut', 'cinematic', 'hype', 'vibe')),
  color_grade text default 'none' check (color_grade in (
    'none',
    'cinematic_cool', 'cinematic_warm', 'golden_hour', 'midnight_blue', 'muted_earth',
    'film_kodak', 'film_fuji', 'film_portra', 'film_expired',
    'bw_clean', 'bw_contrast', 'bw_film_grain', 'bw_faded'
  )),
  color_grade_intensity float default 0.5 check (color_grade_intensity >= 0 and color_grade_intensity <= 1),
  trim_start float,
  trim_end float,
  analysis_data jsonb,
  timeline_data jsonb,
  raw_storage_bytes bigint default 0,
  export_storage_bytes bigint default 0,
  created_at timestamptz default now(),
  last_activity_at timestamptz default now()
);

alter table public.projects enable row level security;

create policy "Users own their projects"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.touch_project_activity()
returns trigger as $$
begin
  new.last_activity_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger on_project_updated
  before update on public.projects
  for each row execute procedure public.touch_project_activity();

-- MEDIA FILES
create table public.media_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade not null,
  project_id uuid references public.projects on delete cascade not null,
  file_type text not null check (file_type in ('song', 'performance_clip', 'broll_clip', 'export')),
  clip_classification text check (clip_classification in ('performance', 'broll', 'unclassified')),
  file_name text not null,
  storage_path text,
  mux_asset_id text,
  mux_playback_id text,
  mux_upload_id text,
  size_bytes bigint default 0,
  duration_seconds float,
  audio_similarity_score float,
  waveform_data jsonb,
  suggested_timeline_position float,
  classification_confidence float,
  created_at timestamptz default now(),
  expires_at timestamptz,
  deleted_at timestamptz
);

alter table public.media_files enable row level security;

create policy "Users own their media"
  on public.media_files for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- EXPORTS
create table public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade not null,
  project_id uuid references public.projects on delete cascade not null,
  format text check (format in ('9:16', '16:9')),
  mux_asset_id text,
  mux_playback_id text,
  status text default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  settings jsonb,
  size_bytes bigint,
  download_url text,
  created_at timestamptz default now(),
  expires_at timestamptz
);

alter table public.exports enable row level security;

create policy "Users own their exports"
  on public.exports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- TRIAL ATTEMPTS (abuse prevention — service role only, no client policy)
create table public.trial_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade,
  ip_address text,
  success boolean default false,
  created_at timestamptz default now()
);

alter table public.trial_attempts enable row level security;
comment on table public.trial_attempts is 'Abuse-prevention table. Intentionally no client RLS insert policy — writes are service-role only via Edge Functions. Do NOT add a permissive insert policy.';

-- WAITLIST (mobile app)
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text default 'landing_mobile_section',
  created_at timestamptz default now()
);

alter table public.waitlist enable row level security;

create policy "Anyone can join waitlist"
  on public.waitlist for insert
  with check (true);

-- STORAGE HELPER
create or replace function public.update_storage_used(p_user_id uuid)
returns void as $$
begin
  update public.profiles
  set storage_used_bytes = (
    select coalesce(sum(size_bytes), 0)
    from public.media_files
    where user_id = p_user_id
    and deleted_at is null
  )
  where id = p_user_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.trigger_update_storage()
returns trigger as $$
begin
  perform public.update_storage_used(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_media_files_change
  after insert or update or delete on public.media_files
  for each row execute procedure public.trigger_update_storage();

-- REALTIME
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.media_files;
alter publication supabase_realtime add table public.exports;
