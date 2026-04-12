import os
import json
import uuid
import subprocess
import tempfile
import threading
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
MUX_TOKEN_ID = os.environ["MUX_TOKEN_ID"]
MUX_TOKEN_SECRET = os.environ["MUX_TOKEN_SECRET"]
RENDER_SECRET = os.environ["RENDER_SECRET"]

PROXY_URL = f"{SUPABASE_URL}/functions/v1/render-db-proxy"

# Limit concurrent FFmpeg renders to 1 to prevent OOM on Railway.
# Multiple formats (9:16 + 16:9) each spawn a do_render thread; without
# this semaphore both run simultaneously and Railway SIGKILLs with exit -9.
_render_semaphore = threading.Semaphore(1)

LUT_DIR = "/app/luts"

# Color grades that have a corresponding .cube LUT file
VALID_GRADES = {
    "film_kodak", "film_fuji", "film_portra", "film_expired",
    "cinematic_teal_orange", "cinematic_cool", "cinematic_warm",
    "golden_hour", "midnight_blue", "muted_earth",
    "bw_clean", "bw_contrast", "bw_film_grain", "bw_faded",
}


def get_lut_path(color_grade: str) -> str | None:
    """Return path to .cube LUT file, or None if grade is 'none' or not found."""
    if not color_grade or color_grade == "none":
        return None
    if color_grade not in VALID_GRADES:
        print(f"Warning: Unknown color grade '{color_grade}', skipping.")
        return None
    path = os.path.join(LUT_DIR, f"{color_grade}.cube")
    if not os.path.exists(path):
        print(f"Warning: LUT file not found at {path}, skipping.")
        return None
    return path


def _f(k, key, default=0.0):
    """Extract a scalar float from a keyframe value that may be a list."""
    v = k.get(key, default)
    if isinstance(v, (list, tuple)):
        return float(v[0]) if v else default
    return float(v) if v is not None else default


def get_face_position_at_time(keyframes: list, target_time: float) -> float:
    """Interpolate face X position at a specific timestamp from keyframe data."""
    if not keyframes:
        return 0.5
    valid = [k for k in keyframes if isinstance(k, dict)]
    if not valid:
        return 0.5

    def _kf_t(k):
        return _f(k, "t", None) if "t" in k else _f(k, "timestamp", 0.0)

    before = after = None
    for kf in valid:
        t = _kf_t(kf)
        if t is None:
            continue
        if t <= target_time:
            before = kf
        if t >= target_time and after is None:
            after = kf
            break

    if before is None:
        before = valid[0]
    if after is None:
        after = valid[-1]

    t_b = _kf_t(before) or 0.0
    t_a = _kf_t(after) or 0.0
    if t_a == t_b:
        return _f(before, "x", 0.5)
    ratio = max(0.0, min(1.0, (target_time - t_b) / (t_a - t_b)))
    return _f(before, "x", 0.5) + (_f(after, "x", 0.5) - _f(before, "x", 0.5)) * ratio


def resolve_media_ref(
    media_ref: str,
    media_files: dict,
    clip_index: int,
) -> str | None:
    """
    Resolve a manifest media_ref to an actual media file ID.
    Tries: direct ID match → filename match → type cycling fallback.
    """
    # 1. Direct ID match
    if media_ref in media_files:
        return media_ref

    # 2. Filename match (case-insensitive)
    ref_lower = media_ref.lower()
    for fid, fdata in media_files.items():
        if fdata.get("file_name", "").lower() == ref_lower:
            return fid
        if fdata.get("file_name", "").lower().startswith(ref_lower):
            return fid

    # 3. Type cycling — "perf_N" or "broll_N" patterns
    if media_ref.startswith("perf"):
        perf_clips = [fid for fid, f in media_files.items()
                      if f.get("file_type") in ("performance_clip",) or
                         f.get("clip_classification") == "performance"]
        if perf_clips:
            return perf_clips[clip_index % len(perf_clips)]
    elif media_ref.startswith("broll"):
        broll_clips = [fid for fid, f in media_files.items()
                       if f.get("file_type") in ("broll_clip",) or
                          f.get("clip_classification") == "broll"]
        if broll_clips:
            return broll_clips[clip_index % len(broll_clips)]

    # 4. Fallback: cycle through all video clips
    video_clips = [fid for fid, f in media_files.items()
                   if f.get("file_type") not in ("song", "export")]
    if video_clips:
        return video_clips[clip_index % len(video_clips)]

    return None


def build_manifest_effects_filters(effects: list, duration: float) -> list[str]:
    """
    Build FFmpeg filter strings for manifest effects.
    Returns a list of filter expressions to insert into the filter chain.
    """
    filters = []
    for eff in effects:
        etype = eff.get("type", "")
        intensity = float(eff.get("intensity", 0.5))
        params = eff.get("params", {})

        if etype == "grain":
            # Film grain noise
            noise_val = int(min(40, intensity * 40))
            filters.append(f"noise=alls={noise_val}:allf=t+u")

        elif etype == "vignette":
            # FFmpeg vignette filter
            angle = 3.14159 / (3 + intensity * 2)  # PI/5 to PI/3
            filters.append(f"vignette=a={angle:.4f}")

        elif etype == "letterbox":
            # Draw black bars (top and bottom)
            bar_pct = 0.04 + intensity * 0.08  # 4-12% of height per bar
            filters.append(
                f"drawbox=x=0:y=0:w=iw:h=trunc(ih*{bar_pct:.3f}):c=black:t=fill,"
                f"drawbox=x=0:y=ih-trunc(ih*{bar_pct:.3f}):w=iw:h=trunc(ih*{bar_pct:.3f}):c=black:t=fill"
            )

        elif etype == "shake":
            # Camera shake via small random crop
            jitter = max(2, int(intensity * 8))
            filters.append(
                f"crop=iw-{jitter*2}:ih-{jitter*2}:"
                f"{jitter}+{jitter}*random(1):{jitter}+{jitter}*random(1),"
                f"scale=iw+{jitter*2}:ih+{jitter*2}"
            )

        elif etype == "zoom":
            # Smooth zoom via zoompan with a fixed output size
            # zoompan needs a fixed `s` (size) parameter — we use 1080x1920
            # and rely on subsequent scale+pad to resize to final dimensions
            zoom_delta = 0.0005 * intensity
            zoom_max = 1.0 + intensity * 0.2
            frames = max(1, int(duration * 30))
            filters.append(
                f"zoompan=z='min(pzoom+{zoom_delta:.6f}\\,{zoom_max:.4f})':"
                f"d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
                f"fps=30:s=1080x1920"
            )

        elif etype == "speed":
            # Speed ramp — slow down then snap
            factor = float(params.get("factor", 0.5))
            if factor > 0 and factor != 1.0:
                filters.append(f"setpts={1/factor:.4f}*PTS")

    return filters


def build_transition_filters(transition_in: dict | None, transition_out: dict | None,
                              duration: float) -> list[str]:
    """
    Build FFmpeg filter strings for transitions.
    Returns filter expressions for fade in/out.
    """
    filters = []
    if transition_in:
        t_type = transition_in.get("type", "cut")
        t_dur = float(transition_in.get("duration", 0.3))
        if t_type in ("fade", "dissolve") and t_dur > 0:
            filters.append(f"fade=t=in:st=0:d={t_dur:.3f}")
        elif t_type == "flash" and t_dur > 0:
            # Flash: fade from white
            filters.append(f"fade=t=in:st=0:d={min(t_dur, 0.15):.3f}:c=white")

    if transition_out:
        t_type = transition_out.get("type", "cut")
        t_dur = float(transition_out.get("duration", 0.3))
        if t_type in ("fade", "dissolve") and t_dur > 0:
            fade_start = max(0, duration - t_dur)
            filters.append(f"fade=t=out:st={fade_start:.3f}:d={t_dur:.3f}")
        elif t_type == "flash" and t_dur > 0:
            fade_start = max(0, duration - min(t_dur, 0.15))
            filters.append(f"fade=t=out:st={fade_start:.3f}:d={min(t_dur, 0.15):.3f}:c=white")

    return filters


def build_ffmpeg_segment_cmd(
    src_path: str,
    seg_path: str,
    start: float,
    duration: float,
    width: int,
    height: int,
    export_format: str,
    face_keyframes: list,
    lut_path: str | None,
    intensity: float,
    manifest_effects: list | None = None,
    transition_in: dict | None = None,
    transition_out: dict | None = None,
) -> list[str]:
    """
    Build the FFmpeg command for a single segment.

    Handles:
    - Trim (ss/t)
    - 9:16 face-tracked crop (or center crop)
    - Manifest effects (grain, vignette, letterbox, shake, zoom, speed)
    - Transitions (fade in/out)
    - Scale + pad to target resolution
    - LUT-based color grading via lut3d filter
    - Intensity blending (uses filter_complex when intensity < 1.0)
    """
    # ── Build crop + scale filter chain ──────────────────────────────────────
    base_filters = []

    if export_format == "9:16":
        # Face-tracked crop — interpolate position at segment start time
        if face_keyframes:
            face_x = get_face_position_at_time(face_keyframes, start)
            crop = (
                f"crop=trunc(ih*9/16):ih:"
                f"max(0\\,min(iw-trunc(ih*9/16)\\,"
                f"trunc(iw*{face_x:.4f}-ih*9/32))):0"
            )
        else:
            crop = "crop=trunc(ih*9/16):ih:trunc((iw-trunc(ih*9/16))/2):0"

        base_filters.append(crop)

    # ── Phase 6: Insert manifest effect filters after crop, before scale ──
    if manifest_effects:
        effect_filters = build_manifest_effects_filters(manifest_effects, duration)
        base_filters.extend(effect_filters)

    if transition_in or transition_out:
        trans_filters = build_transition_filters(transition_in, transition_out, duration)
        base_filters.extend(trans_filters)

    base_filters.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease")
    base_filters.append(f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")

    # ── Build FFmpeg command ──────────────────────────────────────────────────
    ss_args = ["-ss", str(max(0, start)), "-i", src_path, "-t", str(duration)]
    out_args = ["-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", seg_path]

    if lut_path is None:
        # No color grade — simple -vf chain
        vf = ",".join(base_filters) if base_filters else "null"
        return ["ffmpeg", "-y"] + ss_args + ["-vf", vf] + out_args

    lut_filter = f"lut3d={lut_path}"

    if intensity >= 0.99:
        # Full intensity — add lut3d to the -vf chain directly
        all_filters = base_filters + [lut_filter]
        vf = ",".join(all_filters)
        return ["ffmpeg", "-y"] + ss_args + ["-vf", vf] + out_args

    # Partial intensity — must use filter_complex for blend
    # Build: [0:v] → base filters → split → grade one branch → blend back
    base_chain = ",".join(base_filters) if base_filters else "null"
    fc = (
        f"[0:v]{base_chain}[base];"
        f"[base]split=2[a][b];"
        f"[a]{lut_filter}[graded];"
        f"[graded][b]blend=all_expr='A*{intensity:.4f}+B*(1-{intensity:.4f})'[out]"
    )
    return ["ffmpeg", "-y"] + ss_args + ["-filter_complex", fc, "-map", "[out]"] + out_args


# ── Database proxy helpers ────────────────────────────────────────────────────

def proxy_request(payload: dict) -> dict:
    res = requests.post(
        PROXY_URL,
        headers={"Content-Type": "application/json", "X-Render-Secret": RENDER_SECRET},
        json=payload,
        timeout=30,
    )
    res.raise_for_status()
    return res.json()


def db_select(table, columns="*", filters=None, single=False):
    return proxy_request({
        "action": "select", "table": table, "columns": columns,
        "filters": filters or [], "single": single,
    })["data"]


def db_update(table, values, filters=None):
    return proxy_request({
        "action": "update", "table": table, "values": values,
        "filters": filters or [],
    })["data"]


def db_insert(table, values):
    return proxy_request({"action": "insert", "table": table, "values": values})["data"]


def get_signed_url(storage_path: str) -> str:
    return proxy_request({
        "action": "signed_url", "bucket": "media", "path": storage_path, "expires_in": 3600,
    })["signedUrl"]


def download_file(url: str, dest_path: str):
    r = requests.get(url, stream=True, timeout=120)
    r.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)


def update_progress(export_id: str, step: str, segments_done: int = 0,
                    segments_total: int = 0, started_at: str = None):
    """Report granular render progress to the DB for real-time UI updates."""
    import time
    eta = 0
    if started_at and segments_done > 0 and segments_total > 0:
        from datetime import datetime, timezone
        try:
            start = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            elapsed = (datetime.now(timezone.utc) - start).total_seconds()
            rate = elapsed / segments_done
            remaining = segments_total - segments_done
            eta = max(0, int(rate * remaining))
        except Exception:
            eta = 0

    percent = 0
    if step == "rendering_segments" and segments_total > 0:
        percent = int((segments_done / segments_total) * 80)
    elif step == "concatenating":
        percent = 82
    elif step == "mixing_audio":
        percent = 88
    elif step == "uploading":
        percent = 95

    progress = {
        "step": step,
        "segments_done": segments_done,
        "segments_total": segments_total,
        "percent": percent,
        "eta_seconds": eta,
        "started_at": started_at,
    }
    try:
        db_update("exports", {"progress": json.dumps(progress)},
                  [{"op": "eq", "column": "id", "value": export_id}])
    except Exception as e:
        print(f"Progress update failed (non-fatal): {e}", flush=True)


def upload_to_mux(file_path: str) -> dict:
    res = requests.post(
        "https://api.mux.com/video/v1/uploads",
        auth=(MUX_TOKEN_ID, MUX_TOKEN_SECRET),
        json={"new_asset_settings": {"playback_policy": ["public"], "mp4_support": "standard", "normalize_audio": False}, "cors_origin": "*"},
        timeout=30,
    )
    res.raise_for_status()
    upload_data = res.json()["data"]
    with open(file_path, "rb") as f:
        put_res = requests.put(upload_data["url"], data=f, timeout=300)
        put_res.raise_for_status()
    return {"upload_id": upload_data["id"]}


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    lut_count = len([f for f in os.listdir(LUT_DIR) if f.endswith(".cube")]) if os.path.exists(LUT_DIR) else 0
    return jsonify({"status": "ok", "luts_loaded": lut_count})


def do_render(export_id: str, project_id: str, manifest_id: str | None = None):
    """Run the full render pipeline. Called in a background thread."""
    import traceback
    print(f"Render queued for semaphore: export_id={export_id}", flush=True)

    with _render_semaphore:
        print(f"Render started: export_id={export_id} project_id={project_id} manifest_id={manifest_id}", flush=True)
        _do_render_inner(export_id, project_id, manifest_id)


def _do_render_inner(export_id: str, project_id: str, manifest_id: str | None = None):
    """Inner render logic — runs one at a time, gated by _render_semaphore."""
    import traceback
    from datetime import datetime, timezone
    try:
        db_update("exports", {"status": "processing"}, [{"op": "eq", "column": "id", "value": export_id}])
        render_start = datetime.now(timezone.utc).isoformat()

        project = db_select("projects", "*", [{"op": "eq", "column": "id", "value": project_id}], single=True)
        timeline_data = project["timeline_data"]
        color_grade = project.get("color_grade", "none")
        color_grade_intensity = float(project.get("color_grade_intensity", 1.0))
        output_format = project.get("format", "9:16")

        # ── Look up manifest for per-clip enrichment (Phase 4) ──
        manifest = None
        manifest_clip_map = {}
        if manifest_id:
            try:
                manifest_row = db_select("edit_manifests", "manifest",
                    [{"op": "eq", "column": "id", "value": manifest_id}], single=True)
                manifest = manifest_row.get("manifest") if manifest_row else None
                if manifest:
                    tracks = manifest.get("timeline", {}).get("tracks", [])
                    for track in tracks:
                        if track.get("kind") != "video":
                            continue
                        for mc in track.get("clips", []):
                            key = round(mc.get("timeline_position", -1), 3)
                            manifest_clip_map[key] = mc
                    print(f"Loaded manifest {manifest_id}: {len(manifest_clip_map)} clips indexed", flush=True)
            except Exception as me:
                print(f"Warning: Failed to load manifest {manifest_id}: {me}. Using timeline_data only.", flush=True)
                manifest = None
                manifest_clip_map = {}

        export_record = db_select("exports", "*", [{"op": "eq", "column": "id", "value": export_id}], single=True)
        settings = export_record.get("settings", {}) or {}
        resolution = settings.get("resolution", "1080p")
        watermarked = export_record.get("watermarked", False)
        export_format = settings.get("format", output_format)

        if resolution == "4k":
            width, height = (3840, 2160) if export_format == "16:9" else (2160, 3840)
        elif resolution == "1080p":
            width, height = (1920, 1080) if export_format == "16:9" else (1080, 1920)
        else:
            width, height = (1280, 720) if export_format == "16:9" else (720, 1280)

        lut_path = get_lut_path(color_grade)
        print(f"Color grade: {color_grade} | intensity: {color_grade_intensity} | LUT: {lut_path}", flush=True)

        media_list = db_select("media_files", "*", [
            {"op": "eq", "column": "project_id", "value": project_id},
            {"op": "is", "column": "deleted_at", "value": "null"},
        ])
        media_files = {f["id"]: f for f in media_list}

        song_file = next((f for f in media_list if f["file_type"] == "song"), None)
        if not song_file:
            raise Exception("No song file found for project")

        song_duration = timeline_data.get("duration", 204)

        # ── Phase 6: Manifest-first timeline resolution ──
        # When a manifest is present with clips, use it as the primary timeline
        # source instead of timeline_data.timeline. This ensures exports match
        # what the user sees in the preview.
        if manifest and manifest_clip_map:
            print(f"Using manifest-first timeline ({len(manifest_clip_map)} clips)", flush=True)
            timeline_clips = []
            for i, mc in enumerate(
                sorted(manifest_clip_map.values(), key=lambda c: c.get("timeline_position", 0))
            ):
                media_ref = mc.get("media_ref", "")
                resolved_id = resolve_media_ref(media_ref, media_files, i)
                if not resolved_id:
                    print(f"Warning: Could not resolve media_ref '{media_ref}', skipping", flush=True)
                    continue

                clip_duration = mc.get("source_range", {}).get("duration", 3.0)
                timeline_clips.append({
                    "clip_id": resolved_id,
                    "start": mc.get("timeline_position", 0),
                    "end": mc.get("timeline_position", 0) + clip_duration,
                    "source_offset": mc.get("source_range", {}).get("start", 0),
                    "_manifest_clip": mc,  # Carry manifest data for effect rendering
                })
        else:
            timeline_clips = timeline_data.get("timeline", [])

        with tempfile.TemporaryDirectory() as tmpdir:
            print(f"Downloading song: {song_file['file_name']}", flush=True)
            song_path = os.path.join(tmpdir, "song.mp3")
            download_file(get_signed_url(song_file["storage_path"]), song_path)
            print(f"Song downloaded: {os.path.getsize(song_path) // 1024} KB", flush=True)

            # Download unique clips
            downloaded_clips = {}
            unique_clip_ids = list(set(
                c["clip_id"] for c in timeline_clips
                if not c["clip_id"].startswith("mock_")
            ))

            for clip_id in unique_clip_ids:
                media = media_files.get(clip_id)
                if not media:
                    print(f"Warning: No media record for clip {clip_id}, skipping", flush=True)
                    continue
                if media.get("mux_playback_id"):
                    clip_url = f"https://stream.mux.com/{media['mux_playback_id']}/high.mp4"
                elif media.get("storage_path"):
                    clip_url = get_signed_url(media["storage_path"])
                else:
                    print(f"Warning: No download source for clip {clip_id}", flush=True)
                    continue
                clip_path = os.path.join(tmpdir, f"clip_{clip_id}.mp4")
                print(f"Downloading clip: {media['file_name']} from {clip_url}", flush=True)
                download_file(clip_url, clip_path)
                clip_size = os.path.getsize(clip_path)
                if clip_size < 50_000:
                    print(f"Warning: clip {clip_id} downloaded only {clip_size} bytes — not a valid video, skipping", flush=True)
                    continue
                print(f"Clip downloaded: {clip_id} — {clip_size // 1024} KB", flush=True)
                downloaded_clips[clip_id] = clip_path

            # Render each segment
            total_segments = len(timeline_clips)
            update_progress(export_id, "rendering_segments", 0, total_segments, render_start)

            segment_paths = []
            for i, tc in enumerate(timeline_clips):
                clip_id = tc["clip_id"]
                if clip_id not in downloaded_clips:
                    continue

                start = tc.get("source_offset", 0)
                duration = tc["end"] - tc["start"]
                if duration <= 0:
                    continue

                print(f"[segment {i}] clip_id={clip_id} source_offset={start:.2f}s duration={duration:.2f}s", flush=True)

                seg_path = os.path.join(tmpdir, f"seg_{i:04d}.mp4")
                media = media_files.get(clip_id, {})
                face_keyframes = media.get("face_keyframes", [])

                # ── Manifest enrichment (Phase 4 + Phase 6) ──
                clip_intensity = color_grade_intensity
                manifest_clip = tc.get("_manifest_clip") or manifest_clip_map.get(round(tc.get("start", 0), 3), {})
                manifest_effects = []
                transition_in = None
                transition_out = None

                if manifest_clip:
                    # Per-clip face keyframes from manifest
                    mf_face_crop = manifest_clip.get("face_crop", {})
                    if mf_face_crop.get("keyframes"):
                        face_keyframes = mf_face_crop["keyframes"]

                    # Per-clip effects from manifest
                    for eff in manifest_clip.get("effects", []):
                        if eff.get("type") == "color_grade":
                            clip_intensity = float(eff.get("intensity", color_grade_intensity))
                        else:
                            manifest_effects.append(eff)

                    # Transitions
                    transition_in = manifest_clip.get("transition_in")
                    transition_out = manifest_clip.get("transition_out")

                cmd = build_ffmpeg_segment_cmd(
                    src_path=downloaded_clips[clip_id],
                    seg_path=seg_path,
                    start=start,
                    duration=duration,
                    width=width,
                    height=height,
                    export_format=export_format,
                    face_keyframes=face_keyframes,
                    lut_path=lut_path,
                    intensity=clip_intensity,
                    manifest_effects=manifest_effects if manifest_effects else None,
                    transition_in=transition_in,
                    transition_out=transition_out,
                )

                print(f"[FFmpeg] segment {i}: {' '.join(cmd)}", flush=True)
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    print(f"[FFmpeg] FAILED segment {i} (exit {result.returncode}):\n{result.stderr}", flush=True)
                    continue
                segment_paths.append(seg_path)
                update_progress(export_id, "rendering_segments", i + 1, total_segments, render_start)

            if not segment_paths:
                raise Exception("No segments rendered successfully")

            # Concatenate segments
            update_progress(export_id, "concatenating", total_segments, total_segments, render_start)
            print(f"[Concat] Concatenating {len(segment_paths)} segments...", flush=True)
            concat_list_path = os.path.join(tmpdir, "concat.txt")
            with open(concat_list_path, "w") as f:
                for seg in segment_paths:
                    f.write(f"file '{seg}'\n")
            print(f"[Concat] concat.txt written:\n" + "\n".join(f"  {s}" for s in segment_paths), flush=True)

            concat_path = os.path.join(tmpdir, "concat_video.mp4")
            concat_cmd = [
                "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                "-i", concat_list_path, "-c", "copy", concat_path,
            ]
            print(f"[Concat] cmd: {' '.join(concat_cmd)}", flush=True)
            result = subprocess.run(concat_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"Concat failed (exit {result.returncode}):\n{result.stderr}")
            print(f"[Concat] done — {os.path.getsize(concat_path) // 1024} KB", flush=True)

            # Mix audio
            update_progress(export_id, "mixing_audio", total_segments, total_segments, render_start)
            final_path = os.path.join(tmpdir, "final.mp4")

            # Watermark filter if needed
            vf_watermark = (
                "drawtext=text='ROTOVIDE.COM':fontcolor=white@0.4:fontsize=24"
                ":x=w-tw-20:y=h-th-20:font=Arial"
                if watermarked else None
            )

            audio_cmd = [
                "ffmpeg", "-y",
                "-i", concat_path,
                "-i", song_path,
                "-map", "0:v:0",
                "-map", "1:a:0",
            ]
            if vf_watermark:
                audio_cmd += ["-vf", vf_watermark]
            audio_cmd += [
                "-c:v", "libx264" if vf_watermark else "copy",
                "-preset", "fast",
                "-c:a", "aac", "-b:a", "320k",
                "-shortest", "-t", str(song_duration),
                final_path,
            ]

            print(f"[AudioMix] cmd: {' '.join(audio_cmd)}", flush=True)
            result = subprocess.run(audio_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"Audio mix failed (exit {result.returncode}):\n{result.stderr}")
            print(f"[AudioMix] done — {os.path.getsize(final_path) // 1024} KB", flush=True)

            update_progress(export_id, "uploading", total_segments, total_segments, render_start)
            print("Uploading final video to Mux...", flush=True)
            mux_result = upload_to_mux(final_path)
            upload_id = mux_result["upload_id"]

            db_update("exports", {
                "status": "processing",
                "settings": {**settings, "mux_upload_id": upload_id},
            }, [{"op": "eq", "column": "id", "value": export_id}])

            print(f"Render complete. Mux upload_id: {upload_id}", flush=True)

    except Exception as e:
        print(f"Render failed: {e}", flush=True)
        print(traceback.format_exc(), flush=True)
        db_update("exports", {"status": "failed"}, [{"op": "eq", "column": "id", "value": export_id}])


@app.route("/render", methods=["POST"])
def render():
    secret = request.headers.get("X-Render-Secret")
    if secret != RENDER_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    body = request.get_json()
    export_id = body.get("export_id")
    project_id = body.get("project_id")
    manifest_id = body.get("manifest_id")  # optional, Phase 4
    if not export_id or not project_id:
        return jsonify({"error": "Missing export_id or project_id"}), 400

    # Respond 202 immediately so the Supabase edge function doesn't time out.
    # The actual render runs in a daemon thread — if the service restarts mid-render
    # the export status will be stuck in "processing" and needs a manual reset.
    thread = threading.Thread(target=do_render, args=(export_id, project_id, manifest_id), daemon=True)
    thread.start()
    print(f"Render thread started: export_id={export_id} manifest_id={manifest_id}", flush=True)
    return jsonify({"success": True, "message": "Render started"}), 202


@app.route("/download-youtube", methods=["POST"])
def download_youtube():
    secret = request.headers.get("X-Render-Secret")
    if secret != RENDER_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    body = request.get_json()
    youtube_url = body.get("url")
    project_id = body.get("project_id")
    user_id = body.get("user_id")
    file_type = body.get("file_type", "performance_clip")
    media_file_id = body.get("media_file_id")

    if not youtube_url or not project_id or not user_id:
        return jsonify({"error": "Missing required fields"}), 400

    print(f"download-youtube: url={youtube_url} project={project_id} media_file_id={media_file_id}", flush=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = os.path.join(tmpdir, "%(title)s.%(ext)s")
        cmd = [
            "yt-dlp",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "-o", output_path,
            youtube_url,
        ]
        print(f"Running yt-dlp...", flush=True)
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=tmpdir, timeout=120)
        if result.returncode != 0:
            print(f"yt-dlp failed: {result.stderr[-500:]}", flush=True)
            # Mark the media_file as failed so frontend stops polling
            if media_file_id:
                db_update("media_files", {"status": "failed"}, [{"op": "eq", "column": "id", "value": media_file_id}])
            return jsonify({"error": "Download failed", "detail": result.stderr[-300:]}), 500

        files = [f for f in os.listdir(tmpdir) if f.endswith(".mp4")]
        if not files:
            if media_file_id:
                db_update("media_files", {"status": "failed"}, [{"op": "eq", "column": "id", "value": media_file_id}])
            return jsonify({"error": "No MP4 file found after download"}), 500

        downloaded_file = os.path.join(tmpdir, files[0])
        file_name = files[0]
        file_size = os.path.getsize(downloaded_file)
        print(f"Downloaded: {file_name} ({file_size} bytes)", flush=True)

        # Upload to Mux via create-mux-upload edge function
        upload_res = requests.post(
            f"{SUPABASE_URL}/functions/v1/create-mux-upload",
            headers={
                "Content-Type": "application/json",
                "X-Render-Secret": RENDER_SECRET,
            },
            json={
                "projectId": project_id,
                "fileName": file_name,
                "fileType": file_type,
                "fileSize": file_size,
            },
        )
        if upload_res.status_code != 200:
            print(f"create-mux-upload failed: {upload_res.text}", flush=True)
            if media_file_id:
                db_update("media_files", {"status": "failed"}, [{"op": "eq", "column": "id", "value": media_file_id}])
            return jsonify({"error": "Failed to create Mux upload"}), 500

        upload_data = upload_res.json()
        mux_upload_url = upload_data["uploadUrl"]
        mux_upload_id = upload_data.get("uploadId")
        mux_asset_id = upload_data.get("assetId")
        print(f"Uploading to Mux... upload_id={mux_upload_id}", flush=True)

        with open(downloaded_file, "rb") as f:
            requests.put(mux_upload_url, data=f, timeout=300).raise_for_status()

        print(f"Mux upload complete", flush=True)

        # Update the EXISTING media_files record (created by edge function)
        # instead of inserting a duplicate
        if media_file_id:
            db_update("media_files", {
                "file_name": file_name,
                "size_bytes": file_size,
                "mux_upload_id": mux_upload_id,
                "mux_asset_id": mux_asset_id,
                "status": "processing",
            }, [{"op": "eq", "column": "id", "value": media_file_id}])
        else:
            # Fallback: insert new record if no media_file_id provided
            db_insert("media_files", {
                "project_id": project_id, "user_id": user_id,
                "file_type": file_type, "file_name": file_name,
                "size_bytes": file_size, "mux_upload_id": mux_upload_id,
                "status": "processing",
            })

        return jsonify({"success": True, "file_name": file_name, "media_file_id": media_file_id})


@app.route("/sync-clips", methods=["POST"])
def sync_clips():
    secret = request.headers.get("X-Render-Secret")
    if secret != RENDER_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    body = request.get_json()
    project_id = body.get("project_id")
    song_storage_path = body.get("song_storage_path")
    clips = body.get("clips", [])

    if not project_id or not song_storage_path or not clips:
        return jsonify({"error": "Missing required fields"}), 400

    print(f"sync-clips: project_id={project_id} clips={len(clips)}", flush=True)

    try:
        import numpy as np
        from scipy import signal as scipy_signal
        import wave

        results = []

        with tempfile.TemporaryDirectory() as tmpdir:
            song_url = get_signed_url(song_storage_path)
            song_raw_path = os.path.join(tmpdir, "song_raw")
            download_file(song_url, song_raw_path)

            song_wav_path = os.path.join(tmpdir, "song.wav")
            subprocess.run([
                "ffmpeg", "-y", "-i", song_raw_path,
                "-ac", "1", "-ar", "4000", "-f", "wav", song_wav_path,
            ], capture_output=True, check=True)

            with wave.open(song_wav_path, "rb") as wf:
                frames = wf.readframes(wf.getnframes())
                song_samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32)
                song_sr = wf.getframerate()

            song_max = np.max(np.abs(song_samples))
            if song_max > 0:
                song_samples /= song_max

            for clip in clips:
                clip_id = clip.get("id")
                mux_playback_id = clip.get("mux_playback_id")
                if not clip_id or not mux_playback_id:
                    continue

                try:
                    clip_url = f"https://stream.mux.com/{mux_playback_id}/low.mp4"
                    clip_raw_path = os.path.join(tmpdir, f"clip_{clip_id}.mp4")
                    r = requests.get(clip_url, timeout=180)
                    r.raise_for_status()
                    with open(clip_raw_path, "wb") as f:
                        f.write(r.content)

                    if os.path.getsize(clip_raw_path) < 10000:
                        print(f"Clip {clip_id} too small, skipping", flush=True)
                        continue

                    clip_wav_path = os.path.join(tmpdir, f"clip_{clip_id}.wav")
                    subprocess.run([
                        "ffmpeg", "-y", "-i", clip_raw_path,
                        "-ac", "1", "-ar", "4000", "-f", "wav", clip_wav_path,
                    ], capture_output=True, check=True)

                    with wave.open(clip_wav_path, "rb") as wf:
                        frames = wf.readframes(wf.getnframes())
                        clip_samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32)

                    clip_max = np.max(np.abs(clip_samples))
                    if clip_max > 0:
                        clip_samples /= clip_max

                    if len(clip_samples) > len(song_samples):
                        correlation = scipy_signal.correlate(clip_samples, song_samples, mode="valid")
                        best_lag = int(np.argmax(correlation))
                        norm_factor = float(np.sqrt(
                            np.sum(song_samples ** 2) *
                            np.sum(clip_samples[best_lag:best_lag + len(song_samples)] ** 2)
                        ))
                        confidence = min(1.0, float(correlation[best_lag]) / norm_factor) if norm_factor > 0 else 0.0
                        pre_roll = best_lag / song_sr
                    else:
                        correlation = scipy_signal.correlate(song_samples, clip_samples, mode="valid")
                        best_lag = int(np.argmax(np.abs(correlation)))
                        norm_factor = float(np.sqrt(
                            np.sum(clip_samples ** 2) *
                            np.sum(song_samples[best_lag:best_lag + len(clip_samples)] ** 2)
                        ))
                        confidence = min(1.0, abs(float(correlation[best_lag])) / norm_factor) if norm_factor > 0 else 0.0
                        pre_roll = -(best_lag / song_sr)

                    db_update("media_files", {
                        "suggested_timeline_position": pre_roll,
                        "audio_similarity_score": confidence,
                        "sync_offset_samples": int(best_lag),
                        "sync_confidence": confidence,
                    }, [{"op": "eq", "column": "id", "value": clip_id}])

                    results.append({"clip_id": clip_id, "pre_roll": pre_roll, "confidence": confidence})
                    print(f"Clip {clip_id}: preRoll={pre_roll:.3f}s confidence={confidence:.3f}", flush=True)

                except Exception as e:
                    print(f"Sync failed for clip {clip_id}: {e}", flush=True)
                    results.append({"clip_id": clip_id, "error": str(e)})

        return jsonify({"success": True, "results": results})

    except Exception as e:
        import traceback
        print(f"sync-clips error: {e}", flush=True)
        print(traceback.format_exc(), flush=True)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
