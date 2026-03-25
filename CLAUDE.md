# CLAUDE.md — ROTOVIDE

## Project Overview

ROTOVIDE is a beat-synced music video editor for rap artists. Users upload footage and a track; the app auto-generates a cut-synced video with face-tracked 9:16 crop, color grading, and lyrics overlay. Exports are rendered server-side via FFmpeg on Railway and delivered through Mux.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React + TypeScript + Tailwind CSS + shadcn-ui |
| Auth & DB | Supabase (project `roggklvakydfxbymxdqp`) |
| Edge Functions | Supabase Edge Functions (Deno Deploy) |
| Realtime | Supabase Realtime `postgres_changes` subscriptions |
| Render Service | Python + Flask + FFmpeg on Railway |
| Video CDN | Mux (upload, stream, MP4 export) |
| Payments | Stripe + RevenueCat (future iOS) |
| AI | Claude Haiku via Anthropic API (ai-creative-director) |
| Video Understanding | Gemini 2.5 Flash via Google AI API (index-video) |

---

## Supabase Project

**Active project:** `roggklvakydfxbymxdqp`

> The `supabase/config.toml` must have `project_id = "roggklvakydfxbymxdqp"`. An old wrong ID (`dnhiukjqecxrldmthlkw`) caused all function deploys to go to the wrong project for an extended period — do not revert this.

Deploy edge functions with:
```bash
supabase functions deploy --project-ref roggklvakydfxbymxdqp
```

### Required Supabase Secrets (project `roggklvakydfxbymxdqp`)
```
RAILWAY_RENDER_URL   # https://rotovide-production.up.railway.app
RENDER_SECRET        # shared secret between Supabase ↔ Railway
STRIPE_SECRET_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY       # Google AI API key for Gemini 2.5 Flash video understanding
MUX_TOKEN_ID
MUX_TOKEN_SECRET
```

---

## Key Architecture Decisions

### Export Pipeline
```
ExportPanel.tsx
  → supabase.functions.invoke("trigger-render")
  → [Supabase Edge Function] trigger-render/index.ts
       await fetch(RAILWAY_RENDER_URL/render, { signal: AbortSignal.timeout(30_000) })
  → [Railway Flask] POST /render
       returns 202 immediately, spawns daemon thread
  → do_render() → _do_render_inner()
       downloads clips + song → FFmpeg segments → concat → audio mix → Mux upload
  → [Mux webhook] mux-webhook edge function
       sets export status = "completed", stores download_url
```

**Critical:** Supabase Deno Deploy kills unawaited promises when the `Response` is returned. **Never use fire-and-forget `fetch()` in edge functions** — always `await fetch(...)`.

**Railway must return 202 immediately** (background thread) — synchronous handlers time out the edge function's 30s abort signal.

### FFmpeg Render Service (`render-service/main.py`)

- **Semaphore:** `threading.Semaphore(1)` limits concurrent FFmpeg renders to 1. Multiple concurrent renders caused OOM / SIGKILL (exit -9) on Railway's memory-constrained instances. Do not remove this.
- **Segments:** Each timeline clip is rendered individually with face-tracked 9:16 crop + LUT color grade, then concatenated.
- **Face keyframes:** Values in DB may be stored as arrays (e.g., `confidence: [0.9]`). The `_f()` helper unwraps list → float. Do not remove it.
- **Clip validation:** Files < 50 KB after download are skipped (likely an HTML error page from Mux, not a real video).

### Mux Asset Creation
All Mux uploads must include `"mp4_support": "standard"` in `new_asset_settings` so MP4 downloads are available immediately on the exported asset.

### Credit System
- Free users: unlimited watermarked exports (0 credits required)
- Pro users: credits deducted per export, no watermark
- `shouldWatermark = !isPro` in ExportPanel.tsx

---

## Edge Functions (`supabase/functions/`)

| Function | Purpose |
|---|---|
| `trigger-render` | Accepts export request, forwards to Railway, returns 502 on failure |
| `mux-webhook` | Handles Mux asset-ready events, sets export `status = "completed"` |
| `render-db-proxy` | Allows Railway to read/write Supabase DB using service role (Railway can't hold service key directly) |
| `ai-creative-director` | Claude Haiku: beat-based clip placement + cinematic effect recommendations (injects Gemini scene data when available) |
| `index-video` | Gemini 2.5 Flash: analyzes video clips → structured scene descriptions (faces, clothing, locations, moods) stored in `video_indexes` |
| `parallel-edit-gen` | Generates 3 edit style variants (high_energy, cinematic, slow_mood) in parallel via Claude Haiku |
| `create-mux-upload` | Creates a Mux direct upload session |
| `check-subscription` | Validates Stripe subscription status |
| `stripe-webhook` | Handles Stripe events |
| `transcribe-lyrics` | Lyrics transcription |
| `generate-social-copy` | AI-generated TikTok/YouTube/Instagram captions |
| `youtube-ingest` | Import video from YouTube URL |

---

## Frontend Structure

```
src/
  components/
    editor/          # Timeline, VideoPreview, ExportPanel, DirectorChat
    credits/         # WatermarkNotice, CreditPill, TopupModal
    color-grade/     # Color grading panel
    onboarding/      # Onboarding flow
    projects/        # Project management UI
    layout/          # Nav, Sidebar
    ui/              # shadcn-ui base components
  pages/
    app/             # Editor, Dashboard, Projects, Billing, Settings, Storage
    auth/            # Signup, Login, VerifyEmail, ResetPassword
    admin/           # WaitlistPage
  hooks/
    useAuth.tsx      # isPro flag, user profile
    useCreditSystem.ts
  lib/
    beatSyncEngine.ts
    lyricsEngine.ts
    audioAnalyzer.ts
    storageLimits.ts
    editManifest.ts    # EditManifest types + utilities
    manifestInterpreter.ts  # EditManifest → TimelineClip[] converter
```

---

## Known Gotchas

1. **Wrong Supabase project ID** — was `dnhiukjqecxrldmthlkw`, now correctly `roggklvakydfxbymxdqp`. Always verify `config.toml`.
2. **Deno fire-and-forget** — unawaited `fetch()` in edge functions is silently killed on `Response` return.
3. **FFmpeg OOM** — concurrent renders SIGKILL Railway. The semaphore is load-bearing.
4. **Face keyframe arrays** — DB stores some numeric fields as `[value]` arrays. The `_f()` helper in `main.py` is required.
5. **Stale "queued" exports** — recovery in ExportPanel only restores `"processing"` status, not `"queued"`, to prevent stale records hiding the START EXPORT button.
6. **Mux MP4 support** — must pass `"mp4_support": "standard"` when creating the upload or the asset won't have a downloadable MP4.
7. **Gemini video indexing** — uses `low.mp4` (480p) from Mux to stay within Supabase edge function memory limits. Indexes are cached in `video_indexes` table with 30-day TTL and idempotent `UNIQUE(media_file_id)`. Pending rows created by `mux-webhook`; actual Gemini analysis triggered by Director Chat on open.

---

## Development Workflow

```bash
# Frontend
npm run dev

# Edge functions (deploy all)
supabase functions deploy --project-ref roggklvakydfxbymxdqp

# Deploy single function
supabase functions deploy trigger-render --project-ref roggklvakydfxbymxdqp

# Railway render service — push to GitHub, Railway auto-deploys main branch
git push origin main
```
