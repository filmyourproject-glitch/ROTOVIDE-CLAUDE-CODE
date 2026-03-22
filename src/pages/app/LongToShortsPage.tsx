import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowLeft, Upload, Link as LinkIcon, Scissors, Loader2, Check, Zap, ScanFace, AudioWaveform, Timer, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCreditSystem } from "@/hooks/useCreditSystem";
import { ExportConfirmModal } from "@/components/credits/ExportConfirmModal";
import { TopupModal } from "@/components/credits/TopupModal";
import { uploadToMux } from "@/lib/muxUploader";
import { extractFaceKeyframes, smoothKeyframes } from "@/lib/faceTracking";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";

/** Get video duration reliably using a <video> element (works for MP4/MOV) */
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const dur = isFinite(video.duration) ? video.duration : 180;
      URL.revokeObjectURL(video.src);
      resolve(dur);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(180); // final fallback
    };
    video.src = URL.createObjectURL(file);
  });
}

type Step = "input" | "uploading" | "downloading" | "detecting" | "preview" | "exporting" | "done";
type SourceType = "upload" | "youtube";

interface DetectedClip {
  id: number;
  startTime: number;
  endTime: number;
  energy: number;
  label: string;
}

export default function LongToShortsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { totalAvailable, canExport, deductCredit } = useCreditSystem();

  // Accept YouTube URL passed from dashboard upload card
  const incomingYoutubeUrl = (location.state as any)?.youtubeUrl || "";

  const [step, setStep] = useState<Step>("input");
  const [sourceType, setSourceType] = useState<SourceType>(incomingYoutubeUrl ? "youtube" : "upload");
  const [youtubeUrl, setYoutubeUrl] = useState(incomingYoutubeUrl);
  const [clipCount, setClipCount] = useState(12);
  const [clipDuration, setClipDuration] = useState(30);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [detectedClips, setDetectedClips] = useState<DetectedClip[]>([]);
  const [selectedClips, setSelectedClips] = useState<Set<number>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [muxAssetId, setMuxAssetId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [faceTrackingProgress, setFaceTrackingProgress] = useState<number | null>(null);
  const [stepStartTime, setStepStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track elapsed time for loading states
  useEffect(() => {
    if (step !== "downloading" && step !== "detecting") {
      setStepStartTime(null);
      setElapsed(0);
      return;
    }
    const now = Date.now();
    setStepStartTime(now);
    setElapsed(0);
  }, [step]);

  useEffect(() => {
    if (!stepStartTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - stepStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [stepStartTime]);

  const resetToInput = () => {
    setStep("input");
    setDetectedClips([]);
    setSelectedClips(new Set());
    setUploadProgress(0);
    setMuxAssetId(null);
    setProjectId(null);
    setYoutubeUrl("");
  };

  /** Run face tracking in background on a media file (non-blocking) */
  const runFaceTrackingInBackground = useCallback(async (mediaFileId: string, muxPlaybackId: string) => {
    try {
      setFaceTrackingProgress(0);
      
      // Fetch the video via Mux HLS to get a playable URL for face extraction
      // We need to create a blob from the Mux stream for face tracking
      const videoUrl = `https://stream.mux.com/${muxPlaybackId}.m3u8`;
      
      // Create a temporary video element to capture frames from HLS
      // Face tracking works on a File object, so we fetch the MP4 rendition
      const mp4Url = `https://stream.mux.com/${muxPlaybackId}/high.mp4`;
      
      const response = await fetch(mp4Url);
      if (!response.ok) {
        console.warn("Could not fetch MP4 for face tracking, skipping");
        setFaceTrackingProgress(null);
        return;
      }
      
      const blob = await response.blob();
      const file = new File([blob], "youtube-import.mp4", { type: "video/mp4" });
      
      const keyframes = await extractFaceKeyframes(file, (pct) => {
        setFaceTrackingProgress(pct);
      });
      
      const smoothed = smoothKeyframes(keyframes);
      
      // Save to database
      await supabase
        .from("media_files")
        .update({ face_keyframes: smoothed as any })
        .eq("id", mediaFileId);
      
      setFaceTrackingProgress(null);
      toast.success("Face tracking complete — 9:16 crops will follow the subject");
    } catch (err) {
      console.error("Face tracking failed (non-blocking):", err);
      setFaceTrackingProgress(null);
    }
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!user) return;
    setStep("uploading");

    try {
      // Create project
      const { data: project, error: projErr } = await supabase.from("projects").insert({
        user_id: user.id,
        name: file.name.replace(/\.[^.]+$/, ""),
        type: "long_to_shorts",
        status: "active",
        sync_status: "pending",
      } as any).select("id").single();

      if (projErr || !project) throw new Error("Failed to create project");
      setProjectId(project.id);

      // Get Mux upload URL
      const { data: muxData, error: muxErr } = await supabase.functions.invoke("create-mux-upload", {
        body: {
          projectId: project.id,
          fileName: file.name,
          fileType: "performance_clip",
          fileSize: file.size,
        },
      });

      if (muxErr || !muxData?.uploadUrl) throw new Error("Failed to get upload URL");

      // Upload to Mux
      await uploadToMux(file, muxData.uploadUrl, (p) => {
        setUploadProgress(p.percent);
      });

      setStep("detecting");
      setMuxAssetId(muxData.assetId || null);

      // Real audio energy analysis
      await analyzeVideoEnergy(file);
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error("Upload failed. Try again.");
      setStep("input");
    }
  };

  /**
   * Real energy analysis. Tries Web Audio API first, then falls back to
   * a <video> element for duration (MP4/MOV often fail decodeAudioData).
   */
  const analyzeVideoEnergy = async (file: File) => {
    try {
      let duration = 180;
      let energyCurve: number[] = [];

      // Try Web Audio decode first
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new OfflineAudioContext(1, 1, 44100);
        const buffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        duration = buffer.duration;
        const samples = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;

        const hopSamples = Math.floor(sampleRate / 10);
        for (let i = 0; i + hopSamples <= samples.length; i += hopSamples) {
          let sum = 0;
          for (let j = 0; j < hopSamples; j++) {
            sum += samples[i + j] * samples[i + j];
          }
          energyCurve.push(Math.sqrt(sum / hopSamples));
        }
        const maxE = Math.max(...energyCurve, 0.001);
        energyCurve = energyCurve.map(v => v / maxE);
      } catch {
        // MP4/MOV fallback: get real duration from <video> element
        // Energy analysis not available — clips will be evenly distributed
        console.warn("Audio decode failed for video container — using <video> element for duration");
        duration = await getVideoDuration(file);
        // energyCurve stays empty → triggers even-distribution path below
      }

      // Find top-N high-energy windows for clip placement
      const clips: DetectedClip[] = [];
      const clipDurSec = clipDuration;
      const windowSize = Math.floor(clipDurSec * 10); // energy values per clip window

      if (energyCurve.length > windowSize) {
        // Score each possible window by average energy
        const windows: { start: number; avgEnergy: number }[] = [];
        const stepSize = Math.max(1, Math.floor(windowSize / 2)); // 50% overlap

        for (let i = 0; i + windowSize <= energyCurve.length; i += stepSize) {
          let sum = 0;
          for (let j = 0; j < windowSize; j++) {
            sum += energyCurve[i + j];
          }
          windows.push({ start: i / 10, avgEnergy: sum / windowSize });
        }

        // Sort by energy descending
        windows.sort((a, b) => b.avgEnergy - a.avgEnergy);

        // Pick top clips, ensuring minimum gap
        const minGap = clipDurSec * 0.8;
        for (const w of windows) {
          if (clips.length >= clipCount) break;
          const overlaps = clips.some(c =>
            Math.abs(c.startTime - w.start) < minGap
          );
          if (!overlaps) {
            const startTime = Math.max(0, w.start);
            const endTime = Math.min(duration, startTime + clipDurSec);
            clips.push({
              id: clips.length,
              startTime: parseFloat(startTime.toFixed(1)),
              endTime: parseFloat(endTime.toFixed(1)),
              energy: w.avgEnergy,
              label: w.avgEnergy > 0.7 ? "Drop" : w.avgEnergy > 0.5 ? "Chorus" : "Beat",
            });
          }
        }

        // Sort by timeline order
        clips.sort((a, b) => a.startTime - b.startTime);
        // Re-index
        clips.forEach((c, i) => { c.id = i; });
      } else {
        // Fallback: evenly distribute clips across duration
        // (energy analysis unavailable for this format)
        const interval = duration / (clipCount + 1);
        for (let i = 0; i < clipCount; i++) {
          const startTime = Math.max(0, interval * (i + 1) - clipDurSec / 2);
          const endTime = Math.min(duration, startTime + clipDurSec);
          clips.push({
            id: i,
            startTime: parseFloat(startTime.toFixed(1)),
            endTime: parseFloat(endTime.toFixed(1)),
            energy: 0.5,
            label: "Segment",
          });
        }
      }

      setDetectedClips(clips);
      setSelectedClips(new Set(clips.map(c => c.id)));
      setStep("preview");
    } catch (err) {
      console.error("Energy analysis failed:", err);
      toast.error("Analysis failed. Try again.");
      setStep("input");
    }
  };

  const handleYoutubeImport = async () => {
    if (!youtubeUrl.trim() || !user) return;

    // Validate URL
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;
    if (!ytRegex.test(youtubeUrl)) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    setStep("downloading");

    try {
      // Create project first
      const { data: project, error: projErr } = await supabase.from("projects").insert({
        user_id: user.id,
        name: `YouTube Import — ${youtubeUrl.match(/(?:v=|youtu\.be\/)([\w-]{11})/)?.[1] || "video"}`,
        type: "long_to_shorts",
        status: "active",
        sync_status: "pending",
      } as any).select("id").single();

      if (projErr || !project) throw new Error("Failed to create project");
      setProjectId(project.id);

      // Call youtube-ingest edge function
      const { data, error } = await supabase.functions.invoke("youtube-ingest", {
        body: {
          youtubeUrl,
          project_id: project.id,
          user_id: user.id,
          file_type: "performance_clip",
        },
      });

      if (error) throw new Error(error.message || "Import failed");

      if (!data?.success) {
        // Service not configured — show helpful message
        if (data?.message) {
          toast.error(data.message);
        } else {
          toast.error("Import failed — try downloading and uploading instead");
        }
        setStep("input");
        return;
      }

      // Railway returned success with media file info
      const mediaFileId = data.media_file_id;
      const muxAssetIdResult = data.mux_asset_id;

      if (muxAssetIdResult) {
        setMuxAssetId(muxAssetIdResult);
      }

      toast.success("Video imported! Ready to create shorts.");

      // Now we need to wait for Mux to be ready, then do energy analysis
      // Poll for media file to have mux_playback_id
      setStep("detecting");

      let playbackId: string | null = null;
      let mediaRecord: any = null;
      const maxAttempts = 60; // 5 minutes max

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(r => setTimeout(r, 2000));

        const { data: mf } = await supabase
          .from("media_files")
          .select("*")
          .eq("id", mediaFileId)
          .single();

        if (mf?.mux_playback_id) {
          playbackId = mf.mux_playback_id;
          mediaRecord = mf;
          break;
        }
      }

      if (!playbackId || !mediaRecord) {
        toast.error("Video processing timed out. Check your projects page.");
        setStep("input");
        return;
      }

      // Kick off face tracking in background (non-blocking)
      runFaceTrackingInBackground(mediaFileId, playbackId);

      // Use duration from media record or fallback
      const duration = mediaRecord.duration_seconds || 180;

      // Generate evenly distributed clips (no local audio analysis possible for YouTube imports)
      const clips: DetectedClip[] = [];
      const clipDurSec = clipDuration;
      const interval = duration / (clipCount + 1);

      for (let i = 0; i < clipCount; i++) {
        const startTime = Math.max(0, interval * (i + 1) - clipDurSec / 2);
        const endTime = Math.min(duration, startTime + clipDurSec);
        clips.push({
          id: i,
          startTime: parseFloat(startTime.toFixed(1)),
          endTime: parseFloat(endTime.toFixed(1)),
          energy: 0.5,
          label: "Segment",
        });
      }

      setDetectedClips(clips);
      setSelectedClips(new Set(clips.map(c => c.id)));
      setStep("preview");
    } catch (err) {
      console.error("YouTube import failed:", err);
      toast.error("Import failed — try downloading and uploading instead");
      setStep("input");
    }
  };

  const toggleClipSelection = (id: number) => {
    setSelectedClips(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportRequest = () => {
    if (isExporting) return; // double-click guard
    const { allowed } = canExport(selectedClips.size);
    if (!allowed) {
      setShowTopupModal(true);
      return;
    }
    setShowExportModal(true);
  };

  const handleConfirmExport = useCallback(async () => {
    if (isExporting) return; // double-click guard
    setShowExportModal(false);
    setIsExporting(true);
    setStep("exporting");

    try {
      const clipsToExport = detectedClips.filter(c => selectedClips.has(c.id));

      if (!muxAssetId || !projectId || !user) {
        throw new Error("Missing project data for export");
      }

      // Generate clips via Mux edge function
      const { data, error } = await supabase.functions.invoke("mux-generate-clips", {
        body: {
          sourceAssetId: muxAssetId,
          projectId,
          userId: user.id,
          clips: clipsToExport.map((c, i) => ({
            index: i,
            startTime: c.startTime,
            endTime: c.endTime,
            energy: c.energy,
            label: c.label,
          })),
        },
      });

      if (error) throw error;

      // Deduct all credits in a single atomic call — all-or-nothing
      const bulkExportId = crypto.randomUUID();
      const totalCost = clipsToExport.length;
      const result = await deductCredit(bulkExportId, totalCost);

      if (!result?.success && result?.error === "insufficient_credits") {
        toast.error(`Need ${totalCost} credits but you don't have enough. Top up to continue.`);
        setStep("preview");
        setIsExporting(false);
        return;
      }
      if (!result?.success) {
        toast.error(result?.error === "unauthorized" ? "Please log in again." : "Credit check failed.");
        setStep("preview");
        setIsExporting(false);
        return;
      }

      setStep("done");
      toast.success(`${clipsToExport.length} clips are being processed!`);
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Export failed. Try again.");
      setStep("preview");
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, detectedClips, selectedClips, muxAssetId, projectId, user, deductCredit]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/dashboard")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-display text-foreground tracking-wider">LONG → SHORTS</h1>
          <p className="text-sm text-muted-foreground">Drop your official video. AI finds the best moments.</p>
        </div>
      </div>

      {/* Step: Input */}
      {step === "input" && (
        <div className="space-y-6">
          {/* Source toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSourceType("upload")}
              className={cn(
                "flex-1 py-3 rounded-xl border text-sm font-mono transition-all",
                sourceType === "upload"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              <Upload className="w-4 h-4 inline mr-2" />Upload File
            </button>
            <button
              onClick={() => setSourceType("youtube")}
              className={cn(
                "flex-1 py-3 rounded-xl border text-sm font-mono transition-all",
                sourceType === "youtube"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              <LinkIcon className="w-4 h-4 inline mr-2" />YouTube Link
            </button>
          </div>

          {/* Upload zone or YouTube input */}
          {sourceType === "upload" ? (
            <div
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-foreground font-medium">Drop your music video here</p>
              <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM · Max 20 minutes</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                placeholder="https://youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="bg-background"
              />
              <Button onClick={handleYoutubeImport} disabled={!youtubeUrl.trim()} className="w-full">
                Import Video
              </Button>
            </div>
          )}

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground tracking-wider">CLIPS</label>
              <Input
                type="number"
                min={4}
                max={24}
                value={clipCount}
                onChange={(e) => setClipCount(Math.min(24, Math.max(4, +e.target.value || 4)))}
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground tracking-wider">DURATION (s)</label>
              <Input
                type="number"
                min={15}
                max={60}
                value={clipDuration}
                onChange={(e) => setClipDuration(Math.min(60, Math.max(15, +e.target.value || 15)))}
                className="bg-background"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground tracking-wider">ASPECT RATIO</label>
            <div className="flex gap-2">
              {(["9:16", "1:1", "16:9"] as const).map(ar => (
                <button
                  key={ar}
                  onClick={() => setAspectRatio(ar)}
                  className={cn(
                    "flex-1 py-2.5 text-xs font-mono rounded-lg border transition-colors",
                    aspectRatio === ar
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step: Uploading */}
      {step === "uploading" && (
        <div className="text-center py-16 space-y-4">
          <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" />
          <p className="text-foreground font-medium">Uploading video...</p>
          <div className="w-48 mx-auto bg-muted rounded-full h-2">
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground font-mono">{uploadProgress}%</p>
        </div>
      )}

      {/* Step: Downloading (YouTube) */}
      {step === "downloading" && (
        <div className="text-center py-12 space-y-6 animate-fade-in">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <Scissors className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
          </div>

          <div className="space-y-2">
            <p className="text-foreground font-display text-lg tracking-wider">DOWNLOADING VIDEO</p>
            <p className="text-sm text-muted-foreground">
              We're downloading your video from YouTube and uploading it to our servers
            </p>
          </div>

          {/* Indeterminate progress bar */}
          <div className="w-64 mx-auto h-1.5 bg-muted rounded-full overflow-hidden relative">
            <div className="absolute h-full bg-primary rounded-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite]" />
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono">
            <Timer className="w-3 h-3" />
            <span>Usually takes 1–3 minutes depending on video length</span>
          </div>

          {elapsed > 180 && (
            <div className="flex items-start gap-3 text-left max-w-sm mx-auto p-3 rounded-xl border border-destructive/30 bg-destructive/5">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">
                Taking longer than expected… your video may still be processing. Check back in a few minutes or try a shorter video.
              </p>
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={resetToInput} className="text-muted-foreground hover:text-foreground">
            Cancel & try a different video
          </Button>
        </div>
      )}

      {/* Step: Detecting */}
      {step === "detecting" && (
        <div className="text-center py-12 space-y-6 animate-fade-in">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <AudioWaveform className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
          </div>

          <div className="space-y-2">
            <p className="text-foreground font-display text-lg tracking-wider">FINDING THE BEST MOMENTS</p>
            <p className="text-sm text-muted-foreground">
              Analyzing audio energy, beat drops, and high-activity moments
            </p>
          </div>

          {/* Indeterminate progress bar */}
          <div className="w-64 mx-auto h-1.5 bg-muted rounded-full overflow-hidden relative">
            <div className="absolute h-full bg-primary rounded-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite]" />
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono">
            <Timer className="w-3 h-3" />
            <span>Almost there — usually under 30 seconds</span>
          </div>

          {elapsed > 180 && (
            <div className="flex items-start gap-3 text-left max-w-sm mx-auto p-3 rounded-xl border border-destructive/30 bg-destructive/5">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">
                Taking longer than expected… your video may still be processing. Check back in a few minutes or try a shorter video.
              </p>
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={resetToInput} className="text-muted-foreground hover:text-foreground">
            Try a different video
          </Button>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* Face tracking progress (non-blocking) */}
          {faceTrackingProgress !== null && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5">
              <ScanFace className="w-4 h-4 text-primary animate-pulse shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-mono text-primary">Analyzing faces... {faceTrackingProgress}%</p>
                <div className="w-full bg-muted rounded-full h-1 mt-1">
                  <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${faceTrackingProgress}%` }} />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display text-foreground tracking-wider">
              {detectedClips.length} CLIPS FOUND
            </h2>
            <p className="text-xs text-muted-foreground font-mono">
              {selectedClips.size} selected = {selectedClips.size} credit{selectedClips.size !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="grid gap-2">
            {detectedClips.map(clip => (
              <button
                key={clip.id}
                onClick={() => toggleClipSelection(clip.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left",
                  selectedClips.has(clip.id)
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/20"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                  selectedClips.has(clip.id) ? "border-primary bg-primary" : "border-muted-foreground/30"
                )}>
                  {selectedClips.has(clip.id) && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-mono text-foreground">
                    {formatTime(clip.startTime)} — {formatTime(clip.endTime)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">{clipDuration}s clip</span>
                </div>
                <span className={cn(
                  "text-[10px] font-mono px-2 py-0.5 rounded-full",
                  clip.label === "Drop" ? "bg-primary/20 text-primary" :
                  clip.label === "Chorus" ? "bg-warning/20 text-warning" :
                  "bg-muted text-muted-foreground"
                )}>
                  {clip.label}
                </span>
                <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${clip.energy * 100}%` }} />
                </div>
              </button>
            ))}
          </div>

          <Button
            onClick={handleExportRequest}
            disabled={selectedClips.size === 0 || isExporting}
            className="w-full py-6 text-base"
          >
            <Zap className="w-4 h-4 mr-2" />
            Export {selectedClips.size} Clips — {selectedClips.size} Credits
          </Button>
        </div>
      )}

      {/* Step: Exporting */}
      {step === "exporting" && (
        <div className="text-center py-16 space-y-4">
          <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" />
          <p className="text-foreground font-medium">Generating your clips...</p>
          <p className="text-xs text-muted-foreground">This may take a few minutes</p>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-display text-foreground tracking-wider">CLIPS READY!</h2>
          <p className="text-sm text-muted-foreground">
            Your {selectedClips.size} clips are processing. They'll appear in your project when ready.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => navigate("/app/projects")}>
              View Projects
            </Button>
            <Button onClick={resetToInput}>
              Cut Another Video
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ExportConfirmModal
        open={showExportModal}
        creditCost={selectedClips.size}
        creditsRemaining={totalAvailable}
        plan={canExport(1).watermarked ? "free" : "pro"}
        onConfirm={handleConfirmExport}
        onCancel={() => setShowExportModal(false)}
      />
      <TopupModal open={showTopupModal} onClose={() => setShowTopupModal(false)} />
    </div>
  );
}
