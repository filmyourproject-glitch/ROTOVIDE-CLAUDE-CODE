import os
import json
import uuid
import subprocess
import tempfile
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# Railway only needs these — no SUPABASE_SERVICE_ROLE_KEY required
SUPABASE_URL = os.environ["SUPABASE_URL"]
MUX_TOKEN_ID = os.environ["MUX_TOKEN_ID"]
MUX_TOKEN_SECRET = os.environ["MUX_TOKEN_SECRET"]
RENDER_SECRET = os.environ["RENDER_SECRET"]

PROXY_URL = f"{SUPABASE_URL}/functions/v1/render-db-proxy"

# ── Color grade FFmpeg filter mappings ──
COLOR_GRADE_FILTERS = {
    "none":           "",
    "cinematic_cool": "eq=saturation=0.75:brightness=-0.03,hue=h=10",
    "cinematic_warm": "eq=saturation=0.85:brightness=0.02,hue=h=-5",
    "golden_hour":    "eq=saturation=1.1:brightness=0.05,hue=h=-5",
    "midnight_blue":  "eq=saturation=0.7:brightness=-0.1,hue=h=195",
    "muted_earth":    "eq=saturation=0.6:brightness=-0.02",
    "film_kodak":     "eq=saturation=1.05:contrast=1.05:brightness=0.02",
    "film_fuji":      "eq=saturation=0.9:contrast=1.02,hue=h=5",
    "film_portra":    "eq=saturation=0.85:brightness=0.04",
    "film_expired":   "eq=saturation=0.5:contrast=0.9:brightness=0.08",
    "bw_clean":       "hue=s=0,eq=brightness=0.02",
    "bw_contrast":    "hue=s=0,eq=contrast=1.3:brightness=-0.05",
    "bw_film_grain":  "hue=s=0,eq=contrast=1.1:brightness=-0.02",
    "bw_faded":       "hue=s=0,eq=contrast=0.85:brightness=0.1",
}


def proxy_request(payload: dict) -> dict:
    """Call the render-db-proxy edge function."""
    res = requests.post(
        PROXY_URL,
        headers={
            "Content-Type": "application/json",
            "X-Render-Secret": RENDER_SECRET,
        },
        json=payload,
        timeout=30,
    )
    res.raise_for_status()
    return res.json()


def db_select(table, columns="*", filters=None, single=False):
    return proxy_request({
        "action": "select",
        "table": table,
        "columns": columns,
        "filters": filters or [],
        "single": single,
    })["data"]


def db_update(table, values, filters=None):
    return proxy_request({
        "action": "update",
        "table": table,
        "values": values,
        "filters": filters or [],
    })["data"]


def db_insert(table, values):
    return proxy_request({
        "action": "insert",
        "table": table,
        "values": values,
    })["data"]


def get_signed_url(storage_path: str) -> str:
    return proxy_request({
        "action": "signed_url",
        "bucket": "media",
        "path": storage_path,
        "expires_in": 3600,
    })["signedUrl"]


def download_file(url: str, dest_path: str):
    r = requests.get(url, stream=True, timeout=120)
    r.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)


def upload_to_mux(file_path: str) -> dict:
    res = requests.post(
        "https://api.mux.com/video/v1/uploads",
        auth=(MUX_TOKEN_ID, MUX_TOKEN_SECRET),
        json={
            "new_asset_settings": {
                "playback_policy": ["public"],
                "normalize_audio": False,
            },
            "cors_origin": "*",
        },
        timeout=30,
    )
    res.raise_for_status()
    upload_data = res.json()["data"]
    upload_url = upload_data["url"]
    upload_id = upload_data["id"]

    with open(file_path, "rb") as f:
        put_res = requests.put(upload_url, data=f, timeout=300)
        put_res.raise_for_status()

    return {"upload_id": upload_id}


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/render", methods=["POST"])
def render():
    secret = request.headers.get("X-Render-Secret")
    if secret != RENDER_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    body = request.get_json()
    export_id = body.get("export_id")
    project_id = body.get("project_id")

    if not export_id or not project_id:
        return jsonify({"error": "Missing export_id or project_id"}), 400

    print(f"Render started: export_id={export_id} project_id={project_id}", flush=True)
    db_update("exports", {"status": "processing"}, [{"op": "eq", "column": "id", "value": export_id}])

    try:
        project = db_select("projects", "*", [{"op": "eq", "column": "id", "value": project_id}], single=True)
        timeline_data = project["timeline_data"]
        color_grade = project.get("color_grade", "none")
        color_grade_intensity = project.get("color_grade_intensity", 1.0)
        output_format = project.get("format", "9:16")

        export_record = db_select("exports", "*", [{"op": "eq", "column": "id", "value": export_id}], single=True)
        settings = export_record.get("settings", {}) or {}
        resolution = settings.get("resolution", "1080p")
        watermarked = export_record.get("watermarked", False)
        export_format = settings.get("format", output_format)

        media_list = db_select("media_files", "*", [
            {"op": "eq", "column": "project_id", "value": project_id},
            {"op": "is", "column": "deleted_at", "value": "null"},
        ])
        media_files = {f["id"]: f for f in media_list}

        song_file = next((f for f in media_list if f["file_type"] == "song"), None)
        if not song_file:
            raise Exception("No song file found for project")

        timeline_clips = timeline_data.get("timeline", [])
        song_duration = timeline_data.get("duration", 204)

        if resolution == "4k":
            width, height = (3840, 2160) if export_format == "16:9" else (2160, 3840)
        elif resolution == "1080p":
            width, height = (1920, 1080) if export_format == "16:9" else (1080, 1920)
        else:
            width, height = (1280, 720) if export_format == "16:9" else (720, 1280)

        with tempfile.TemporaryDirectory() as tmpdir:
            print(f"Downloading song: {song_file['file_name']}")
            song_path = os.path.join(tmpdir, "song.mp3")
            song_url = get_signed_url(song_file["storage_path"])
            download_file(song_url, song_path)

            downloaded_clips = {}
            unique_clip_ids = list(set(c["clip_id"] for c in timeline_clips if not c["clip_id"].startswith("mock_")))

            for clip_id in unique_clip_ids:
                media = media_files.get(clip_id)
                if not media:
                    print(f"Warning: No media record for clip {clip_id}, skipping")
                    continue

                if media.get("mux_playback_id"):
                    clip_url = f"https://stream.mux.com/{media['mux_playback_id']}/high.mp4"
                    print(f"Downloading clip {clip_id} from Mux: {clip_url}")
                elif media.get("storage_path"):
                    clip_url = get_signed_url(media["storage_path"])
                    print(f"Downloading clip {clip_id} from Supabase storage")
                else:
                    print(f"Warning: No download source for clip {clip_id}, skipping")
                    continue

                print(f"Downloading clip: {media['file_name']}")
                clip_path = os.path.join(tmpdir, f"clip_{clip_id}.mp4")
                download_file(clip_url, clip_path)
                downloaded_clips[clip_id] = clip_path

            segment_paths = []

            for i, tc in enumerate(timeline_clips):
                clip_id = tc["clip_id"]
                if clip_id not in downloaded_clips:
                    continue

                src_path = downloaded_clips[clip_id]
                seg_path = os.path.join(tmpdir, f"seg_{i:04d}.mp4")

                start = tc.get("source_offset", 0)
                duration = tc["end"] - tc["start"]
                if duration <= 0:
                    continue

                filters = []

                if export_format == "9:16":
                    media = media_files.get(clip_id, {})
                    face_keyframes = media.get("face_keyframes", [])

                    clip_start_time = tc.get("source_offset", 0)
                    clip_end_time = clip_start_time + duration

                    if face_keyframes:
                        # Filter to only valid dict keyframes
                        valid_kfs = [k for k in face_keyframes if isinstance(k, dict)]

                        segment_kfs = [
                            k for k in valid_kfs
                            if clip_start_time <= k.get("t", 0) <= clip_end_time
                        ]

                        if not segment_kfs and valid_kfs:
                            closest = min(valid_kfs, key=lambda k: abs(k.get("t", 0) - clip_start_time))
                            segment_kfs = [closest]

                        if segment_kfs:
                            total_weight = sum(k.get("confidence", 0.5) for k in segment_kfs)
                            if total_weight == 0:
                                total_weight = len(segment_kfs)

                            face_x = sum(k.get("x", 0.5) * k.get("confidence", 0.5) for k in segment_kfs) / total_weight
                            face_x = max(0.0, min(1.0, face_x))

                            crop_expr = (
                                f"crop=trunc(ih*9/16):ih:"
                                f"max(0\\,min(iw-trunc(ih*9/16)\\,"
                                f"trunc(iw*{face_x:.4f}-ih*9/32))):0"
                            )
                            filters.append(crop_expr)
                        else:
                            filters.append("crop=trunc(ih*9/16):ih:trunc((iw-trunc(ih*9/16))/2):0")
                    else:
                        filters.append("crop=trunc(ih*9/16):ih:trunc((iw-trunc(ih*9/16))/2):0")

                filters.append(f"scale={width}:{height}:force_original_aspect_ratio=decrease")
                filters.append(f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2")

                grade_filter = COLOR_GRADE_FILTERS.get(color_grade, "")
                if grade_filter and color_grade != "none":
                    intensity = float(color_grade_intensity)
                    if intensity < 1.0:
                        filters.append(f"[base]split=2[a][b];[a]{grade_filter}[graded];[graded][b]blend=all_expr='A*{intensity}+B*(1-{intensity})'")
                    else:
                        filters.append(grade_filter)

                vf = ",".join(filters) if filters else "null"

                cmd = [
                    "ffmpeg", "-y",
                    "-ss", str(max(0, start)),
                    "-i", src_path,
                    "-t", str(duration),
                    "-vf", vf,
                    "-an",
                    "-c:v", "libx264",
                    "-preset", "fast",
                    "-crf", "18",
                    "-pix_fmt", "yuv420p",
                    seg_path
                ]

                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    print(f"FFmpeg error on segment {i}: {result.stderr[-500:]}")
                    continue

                segment_paths.append(seg_path)

            if not segment_paths:
                raise Exception("No segments rendered successfully")

            concat_list_path = os.path.join(tmpdir, "concat.txt")
            with open(concat_list_path, "w") as f:
                for seg in segment_paths:
                    f.write(f"file '{seg}'\n")

            concat_path = os.path.join(tmpdir, "concat_video.mp4")
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_list_path,
                "-c", "copy",
                concat_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"Concat failed: {result.stderr[-500:]}")

            final_path = os.path.join(tmpdir, "final.mp4")
            cmd = [
                "ffmpeg", "-y",
                "-i", concat_path,
                "-i", song_path,
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "320k",
                "-shortest",
                "-t", str(song_duration),
                final_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise Exception(f"Audio mix failed: {result.stderr[-500:]}")

            print("Uploading final video to Mux...")
            mux_result = upload_to_mux(final_path)
            upload_id = mux_result["upload_id"]

            db_update("exports", {
                "status": "processing",
                "settings": {
                    **settings,
                    "mux_upload_id": upload_id,
                }
            }, [{"op": "eq", "column": "id", "value": export_id}])

            print(f"Render complete. Mux upload_id: {upload_id}")
            return jsonify({"success": True, "upload_id": upload_id})

    except Exception as e:
        import traceback
        print(f"Render failed: {e}", flush=True)
        print(traceback.format_exc(), flush=True)
        db_update("exports", {"status": "failed"}, [{"op": "eq", "column": "id", "value": export_id}])
        return jsonify({"error": str(e)}), 500


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

    if not youtube_url or not project_id or not user_id:
        return jsonify({"error": "Missing required fields"}), 400

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = os.path.join(tmpdir, "%(title)s.%(ext)s")

        cmd = [
            "yt-dlp",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "-o", output_path,
            youtube_url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=tmpdir)
        if result.returncode != 0:
            return jsonify({"error": "Download failed", "detail": result.stderr[-300:]}), 500

        files = [f for f in os.listdir(tmpdir) if f.endswith(".mp4")]
        if not files:
            return jsonify({"error": "No MP4 file found after download"}), 500

        downloaded_file = os.path.join(tmpdir, files[0])
        file_name = files[0]
        file_size = os.path.getsize(downloaded_file)

        upload_res = requests.post(
            f"{SUPABASE_URL}/functions/v1/create-mux-upload",
            headers={
                "Content-Type": "application/json",
                "X-Render-Secret": RENDER_SECRET,
            },
            json={"fileName": file_name},
        )
        upload_data = upload_res.json()
        mux_upload_url = upload_data["uploadUrl"]
        mux_upload_id = upload_data["uploadId"]

        with open(downloaded_file, "rb") as f:
            put_res = requests.put(mux_upload_url, data=f, timeout=300)
            put_res.raise_for_status()

        db_insert("media_files", {
            "project_id": project_id,
            "user_id": user_id,
            "file_type": file_type,
            "file_name": file_name,
            "size_bytes": file_size,
            "mux_upload_id": mux_upload_id,
            "status": "processing",
        })

        return jsonify({"success": True, "file_name": file_name})


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

    print(f"sync-clips called: project_id={project_id}, clips={len(clips)}, song_path={song_storage_path}", flush=True)

    try:
        import numpy as np
        from scipy import signal as scipy_signal
        import wave

        results = []

        with tempfile.TemporaryDirectory() as tmpdir:
            # Download and decode song to mono WAV at 4kHz
            song_url = get_signed_url(song_storage_path)
            print(f"Got signed URL for song: {song_url[:50]}...", flush=True)
            song_raw_path = os.path.join(tmpdir, "song_raw")
            download_file(song_url, song_raw_path)
            print(f"Song downloaded to {song_raw_path}", flush=True)

            song_wav_path = os.path.join(tmpdir, "song.wav")
            cmd = [
                "ffmpeg", "-y", "-i", song_raw_path,
                "-ac", "1", "-ar", "4000", "-f", "wav",
                song_wav_path
            ]
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                return jsonify({"error": "Failed to decode song"}), 500

            with wave.open(song_wav_path, "rb") as wf:
                frames = wf.readframes(wf.getnframes())
                song_samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32)
                song_sr = wf.getframerate()

            print(f"Song decoded: {len(song_samples)} samples at {song_sr}Hz", flush=True)

            song_max = np.max(np.abs(song_samples))
            if song_max > 0:
                song_samples = song_samples / song_max

            for clip in clips:
                clip_id = clip.get("id")
                mux_playback_id = clip.get("mux_playback_id")

                if not clip_id or not mux_playback_id:
                    continue

                try:
                    print(f"Processing clip {clip_id} with playback {mux_playback_id}", flush=True)

                    # Download full clip audio from Mux low.mp4
                    clip_url = f"https://stream.mux.com/{mux_playback_id}/low.mp4"
                    clip_raw_path = os.path.join(tmpdir, f"clip_{clip_id}.mp4")

                    r = requests.get(clip_url, timeout=180)
                    r.raise_for_status()
                    with open(clip_raw_path, "wb") as f:
                        f.write(r.content)

                    clip_file_size = os.path.getsize(clip_raw_path)
                    print(f"Clip {clip_id} downloaded: {clip_file_size} bytes", flush=True)
                    if clip_file_size < 10000:
                        print(f"Clip {clip_id} file too small, skipping", flush=True)
                        continue

                    # Extract audio to mono WAV at 4kHz
                    clip_wav_path = os.path.join(tmpdir, f"clip_{clip_id}.wav")
                    cmd = [
                        "ffmpeg", "-y", "-i", clip_raw_path,
                        "-ac", "1", "-ar", "4000", "-f", "wav",
                        clip_wav_path
                    ]
                    result = subprocess.run(cmd, capture_output=True)
                    if result.returncode != 0:
                        print(f"Failed to decode clip {clip_id}", flush=True)
                        continue

                    with wave.open(clip_wav_path, "rb") as wf:
                        frames = wf.readframes(wf.getnframes())
                        clip_samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32)

                    clip_max = np.max(np.abs(clip_samples))
                    if clip_max > 0:
                        clip_samples = clip_samples / clip_max

                    print(f"Clip {clip_id} decoded: {len(clip_samples)} samples at {song_sr}Hz ({len(clip_samples)/song_sr:.1f}s)", flush=True)

                    # Full cross-correlation to find pre-roll
                    print(f"Running correlation: clip={len(clip_samples)} samples ({len(clip_samples)/song_sr:.1f}s) vs song={len(song_samples)} samples ({len(song_samples)/song_sr:.1f}s)", flush=True)

                    if len(clip_samples) > len(song_samples):
                        # Normal case: clip longer than song
                        # Slide song template along clip to find pre-roll
                        correlation = scipy_signal.correlate(clip_samples, song_samples, mode="valid")
                        best_lag = int(np.argmax(correlation))
                        norm_factor = float(np.sqrt(
                            np.sum(song_samples ** 2) *
                            np.sum(clip_samples[best_lag:best_lag + len(song_samples)] ** 2)
                        ))
                        confidence = min(1.0, float(correlation[best_lag]) / norm_factor) if norm_factor > 0 else 0.0
                        pre_roll = best_lag / song_sr
                    else:
                        # Clip is same length or shorter than song
                        # Use full correlation to find best alignment
                        correlation = scipy_signal.correlate(song_samples, clip_samples, mode="valid")
                        best_lag = int(np.argmax(np.abs(correlation)))
                        norm_factor = float(np.sqrt(
                            np.sum(clip_samples ** 2) *
                            np.sum(song_samples[best_lag:best_lag + len(clip_samples)] ** 2)
                        ))
                        confidence = min(1.0, abs(float(correlation[best_lag])) / norm_factor) if norm_factor > 0 else 0.0
                        # Negative pre_roll means clip started AFTER song — pad with negative offset
                        pre_roll = -(best_lag / song_sr)

                    print(f"Clip {clip_id}: preRoll={pre_roll:.3f}s confidence={confidence:.3f}", flush=True)

                    # Store result in database via proxy
                    db_update("media_files", {
                        "suggested_timeline_position": pre_roll,
                        "audio_similarity_score": confidence,
                    }, [{"op": "eq", "column": "id", "value": clip_id}])

                    results.append({
                        "clip_id": clip_id,
                        "pre_roll": pre_roll,
                        "confidence": confidence,
                    })

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
