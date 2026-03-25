import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, Smartphone, Monitor, Layers, Scissors, Clapperboard, Zap, Sparkles, Music, Upload, CheckCircle2, Lock, Palette, X, Plus, Loader2, AlertCircle } from "lucide-react";
import { getPendingFile, clearPendingFile } from "@/lib/pendingFileStore";
import { runBeatSync } from "@/lib/beatSyncEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBackgroundUploads } from "@/contexts/BackgroundUploadContext";
import { extractPreviewFrame, estimateUploadTime } from "@/lib/proxyGenerator";
import { uploadToMux } from "@/lib/muxUploader";
// faceTracking imported dynamically at call site to avoid bundling TensorFlow
import { COLOR_GRADE_MAP, getColorGradeFilter } from "@/lib/colorGrades";
import { ColorGradeSwatches } from "@/components/color-grade/ColorGradeSwatches";
import { ColorGradeIntensitySlider } from "@/components/color-grade/ColorGradeIntensitySlider";
import { BeforeAfterToggle } from "@/components/color-grade/BeforeAfterToggle";
import type { VideoFormat, StylePreset, ColorGrade } from "@/types";

const steps = ["Details", "Style", "Song", "Clips", "Color"];

type UploadStatus = "extracting" | "uploading" | "complete" | "error";

interface UploadedFile {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
  savedToDb?: boolean;
  label?: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

let fileIdCounter = 0;

/* ────── Wizard Color Step (Step 5 — last) ────── */
function WizardColorStep({ colorGrade, colorIntensity, projectId, onGradeChange, onIntensityChange, onSkip }: {
  colorGrade: ColorGrade;
  colorIntensity: number;
  projectId: string | null;
  onGradeChange: (g: ColorGrade) => void;
  onIntensityChange: (v: number) => void;
  onSkip: () => void;
}) {
  const [showBefore, setShowBefore] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const gradeLabel = colorGrade === "none" ? "No Grade" : COLOR_GRADE_MAP[colorGrade].label;
  const intensityLabel = colorGrade === "none" ? "Natural Color" : `${colorIntensity}%`;
  const filter = getColorGradeFilter(colorGrade);
  const topOpacity = showBefore ? 0 : colorIntensity / 100;

  useEffect(() => {
    if (!projectId) { setLoadingPreview(false); return; }
    (async () => {
      setLoadingPreview(true);
      const { data: clips } = await supabase
        .from("media_files")
        .select("preview_image_path")
        .eq("project_id", projectId)
        .eq("file_type", "performance_clip")
        .not("preview_image_path", "is", null)
        .limit(1);

      if (clips?.[0]?.preview_image_path) {
        const { data: signed } = await supabase.storage
          .from("media")
          .createSignedUrl(clips[0].preview_image_path, 3600);
        if (signed?.signedUrl) {
          setPreviewImageUrl(signed.signedUrl);
        }
      }
      setLoadingPreview(false);
    })();
  }, [projectId]);

  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden box-border space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Last step — pick your look</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This is how your footage will be graded. Hit Build My Video and the sync starts automatically.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* LEFT: Preview */}
        <div className="md:sticky md:top-4 space-y-3 self-start w-full max-w-full">
          <div className="relative overflow-hidden rounded-lg border border-border bg-[#0A0A0A]" style={{ aspectRatio: "16/9" }}>
            {loadingPreview ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              </div>
            ) : previewImageUrl ? (
              <>
                {/* Base image layer */}
                <img
                  src={previewImageUrl}
                  alt="Color grade preview"
                  className="absolute inset-0 w-full h-full object-cover"
                  draggable={false}
                />
                {/* Filtered overlay */}
                {colorGrade !== "none" && (
                  <img
                    src={previewImageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ filter, opacity: topOpacity, transition: "opacity 150ms ease" }}
                    draggable={false}
                  />
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ background: "linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 30%, #0a0a0a 100%)" }}>
                <span className="text-xs text-muted-foreground">No footage uploaded yet</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">
              {gradeLabel} · {intensityLabel}
            </span>
            <BeforeAfterToggle showBefore={showBefore} onChange={setShowBefore} />
          </div>
        </div>

        {/* RIGHT: Grade Selection */}
        <div className="space-y-5 w-full max-w-full overflow-x-hidden">
          <ColorGradeSwatches selected={colorGrade} onSelect={onGradeChange} compact />
          {colorGrade !== "none" && (
            <div className="w-full box-border">
              <ColorGradeIntensitySlider intensity={colorIntensity} onChange={onIntensityChange} compact />
            </div>
          )}
          <div className="text-right">
            <button onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground transition-default">
              Skip — No Color Grade →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────── File Size Warning Banner ────── */
function FileSizeWarning({ files }: { files: File[] }) {
  if (files.length === 0) return null;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  if (totalBytes < 10 * 1024 * 1024) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.06] p-3 mb-4">
      <p className="text-foreground text-[13px]">
        <strong className="text-primary">{formatBytes(totalBytes)} selected.</strong>{" "}
        Estimated upload time: <strong>{estimateUploadTime(totalBytes)}</strong> on a typical connection.
      </p>
      <p className="text-muted-foreground text-xs mt-1">
        ROTOVIDE extracts a fast preview frame first so you can continue in seconds. Your original 4K files upload in the background.
      </p>
    </div>
  );
}

/* ────── Clip Row Component ────── */
function ClipRow({ clip, onRemove, type }: { clip: UploadedFile; onRemove: () => void; type: "perf" | "broll" }) {
  const isRealError = clip.status === "error";
  const isExtracting = clip.status === "extracting";
  const barColor = isRealError ? "bg-destructive" : clip.status === "complete" ? "bg-success" : "bg-primary";
  return (
    <div className="surface-card p-3 flex items-center gap-3">
      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
        <Upload className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs font-medium text-foreground truncate">{clip.file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(clip.file.size)}
          {isExtracting && " · Processing…"}
          {clip.status === "uploading" && ` · Uploading… ${clip.progress}%`}
        </p>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          {isExtracting ? (
            <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" style={{ animation: "pulse 1.2s ease-in-out infinite" }} />
          ) : (
            <div className={cn("h-full rounded-full transition-all duration-300", barColor)} style={{ width: `${clip.progress}%` }} />
          )}
        </div>
        {clip.status === "complete" && (
          <p className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Ready ✓</p>
        )}
        {isRealError && (
          <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Upload failed</p>
        )}
      </div>
      <button onClick={onRemove} className="text-muted-foreground hover:text-foreground shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function NewProjectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const _bgUploads = useBackgroundUploads(); // kept for song upload context
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [artist, setArtist] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [bpm, setBpm] = useState("");
  const [format, setFormat] = useState<VideoFormat>("9:16");
  const [style, setStyle] = useState<StylePreset>("raw_cut");
  const [colorGrade, setColorGrade] = useState<ColorGrade>("none");
  const [colorIntensity, setColorIntensity] = useState(50);
  const [creating, setCreating] = useState(false);

  const [projectId, setProjectId] = useState<string | null>(null);

  // File uploads
  const [songFile, setSongFile] = useState<UploadedFile | null>(null);
  const [perfClips, setPerfClips] = useState<UploadedFile[]>([]);
  const [brollClips, setBrollClips] = useState<UploadedFile[]>([]);
  const [isDraggingSong, setIsDraggingSong] = useState(false);
  const [isDraggingPerf, setIsDraggingPerf] = useState(false);
  const [isDraggingBroll, setIsDraggingBroll] = useState(false);
  const songInputRef = useRef<HTMLInputElement>(null);
  const perfInputRef = useRef<HTMLInputElement>(null);
  const brollInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  // Auto-load file from Dashboard handoff via IndexedDB
  // Store in component state first; processing is triggered later via normal clip pathway
  const pendingFileLoaded = useRef(false);
  const [pendingPerfFiles, setPendingPerfFiles] = useState<File[]>([]);
  const [pendingSongFile, setPendingSongFile] = useState<File | null>(null);
  const [pendingBrollFiles, setPendingBrollFiles] = useState<File[]>([]);
  const pendingBrollLoaded = useRef(false);
  const isFromDashboard = !!(location.state?.fromDashboard);

  useEffect(() => {
    if (pendingFileLoaded.current) return;
    const hasAnyPending = location.state?.hasPendingFile ||
      location.state?.hasPendingSong ||
      location.state?.pendingPerfCount > 0 ||
      location.state?.pendingBrollCount > 0;
    if (!hasAnyPending) return;
    pendingFileLoaded.current = true;
    navigate(location.pathname, { replace: true });

    (async () => {
      const loadedPerf: File[] = [];
      const loadedBroll: File[] = [];

      try {
        // Load song
        if (location.state?.hasPendingSong) {
          const songRaw = await getPendingFile("newProjectSong");
          await clearPendingFile("newProjectSong");
          if (songRaw) {
            setPendingSongFile(songRaw);
          }
        }

        // Load perf clips (indexed keys from dashboard)
        const perfCount = location.state?.pendingPerfCount ?? 0;
        for (let i = 0; i < perfCount; i++) {
          const key = `newProjectPerf_${i}`;
          const f = await getPendingFile(key);
          await clearPendingFile(key);
          if (f) loadedPerf.push(f);
        }

        // Legacy: load single perf clip from old dashboard flow
        if (location.state?.hasPendingFile && perfCount === 0) {
          const f = await getPendingFile("newProjectFile");
          await clearPendingFile("newProjectFile");
          if (f) {
            loadedPerf.push(f);
            const baseName = f.name.replace(/\.[^.]+$/, "");
            setName(baseName);
          }
        }

        if (loadedPerf.length > 0) {
          setPendingPerfFiles(loadedPerf);
        }

        // Load broll clips (indexed keys from dashboard)
        const brollCount = location.state?.pendingBrollCount ?? 0;
        for (let i = 0; i < brollCount; i++) {
          const key = `newProjectBroll_${i}`;
          const f = await getPendingFile(key);
          await clearPendingFile(key);
          if (f) loadedBroll.push(f);
        }

        if (loadedBroll.length > 0) {
          setPendingBrollFiles(loadedBroll);
        }

        if (loadedPerf.length > 0 || loadedBroll.length > 0) {
          toast.success(`${loadedPerf.length + loadedBroll.length} clip${loadedPerf.length + loadedBroll.length !== 1 ? 's' : ''} queued — name your project to start uploading.`);
        }

      } catch (err) {
        console.warn("Could not load pending files:", err);
        toast.error("Couldn't load your files. Please upload them manually.");
      }
    })();
  }, [location.state]);

  // Process pending perf files once project exists
  useEffect(() => {
    if (pendingPerfFiles.length === 0 || !projectId) return;
    try {
      processClipFiles(pendingPerfFiles, "perf");
    } catch (err) {
      console.error("Auto-processing pending files failed:", err);
      toast.error("Couldn't auto-process your clip. Try adding it manually.");
    }
    setPendingPerfFiles([]);
  }, [pendingPerfFiles, projectId]);

  // Fire song upload once projectId is available
  useEffect(() => {
    if (!pendingSongFile || !projectId) return;
    processSongFile(pendingSongFile);
    setPendingSongFile(null);
  }, [pendingSongFile, projectId]);

  // Fire broll uploads once projectId is available
  useEffect(() => {
    if (pendingBrollFiles.length === 0 || !projectId) return;
    try {
      processClipFiles(pendingBrollFiles, "broll");
    } catch (err) {
      console.error("Auto-processing pending broll failed:", err);
      toast.error("Couldn't auto-process your B-roll. Try adding it manually.");
    }
    setPendingBrollFiles([]);
  }, [pendingBrollFiles, projectId]);

  const canContinue = step === 0 ? name.length > 0 : true;

  // At least one performance clip is ready & none still extracting => can continue
  const hasProxyReady = perfClips.some(c => c.status === "complete");
  const anyExtracting = perfClips.some(c => c.status === "extracting");

  // Save a file record to media_files immediately
  const saveFileToDb = async (file: File, fileType: string, previewPath?: string): Promise<string | null> => {
    if (!user || !projectId) return null;
    try {
      const { data, error } = await supabase.from("media_files").insert({
        user_id: user.id,
        project_id: projectId,
        file_type: fileType,
        file_name: file.name,
        size_bytes: file.size,
        preview_image_path: previewPath || null,
        proxy_storage_path: null,
        status: previewPath ? "proxy_ready" : "uploading",
      } as any).select("id").single();
      if (error) {
        console.error("Supabase insert error:", error);
        toast.error(`Failed to save ${file.name}. Try again.`);
        return null;
      }
      return data?.id || null;
    } catch (err) {
      console.error("Failed to save file record:", err);
      return null;
    }
  };

  const processSongFile = (file: File) => {
    const id = `song-${++fileIdCounter}`;
    setSongFile({ id, file, progress: 0, status: "uploading" });

    if (!user || !projectId) {
      let prog = 0;
      const interval = setInterval(() => {
        prog += Math.random() * 30;
        if (prog >= 100) { prog = 100; clearInterval(interval); }
        setSongFile(prev => prev ? { ...prev, progress: Math.min(prog, 100), status: prog >= 100 ? "complete" : "uploading" } : null);
      }, 300);
      return;
    }

    const storagePath = `${user.id}/${projectId}/original/${file.name}`;
    (async () => {
      try {
        const { error } = await supabase.storage.from("media").upload(storagePath, file, { upsert: true });
        if (error) throw error;
        await saveFileToDb(file, "song");
        await supabase.from("media_files").update({ storage_path: storagePath, status: "ready" } as any)
          .eq("project_id", projectId).eq("file_name", file.name).eq("user_id", user.id);
        setSongFile(prev => prev ? { ...prev, progress: 100, status: "complete", savedToDb: true } : null);
      } catch (err) {
        console.error("Song upload error:", err);
        setSongFile(prev => prev ? { ...prev, status: "error", error: "Upload failed" } : null);
      }
    })();

    let prog = 0;
    const interval = setInterval(() => {
      prog += Math.random() * 15;
      if (prog >= 90) { clearInterval(interval); return; }
      setSongFile(prev => prev && prev.status === "uploading" ? { ...prev, progress: Math.min(prog, 90) } : prev);
    }, 400);
  };

  const handleSongSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSongFile(file);
  };

  // Process clip files SERIALLY — one at a time to prevent memory crash
  const processClipFiles = (files: File[], type: "perf" | "broll") => {
    const setter = type === "perf" ? setPerfClips : setBrollClips;
    const fileType = type === "perf" ? "performance_clip" : "broll_clip";

    // Add all files to the list immediately with "extracting" status
    const newFiles: UploadedFile[] = files.map((file) => ({
      id: `clip-${++fileIdCounter}`,
      file,
      progress: 0,
      status: "extracting" as UploadStatus,
      label: "Extracting preview…",
    }));
    setter(prev => [...prev, ...newFiles]);

    if (!user || !projectId) return;

    // Process serially
    (async () => {
      for (const entry of newFiles) {
        const { id, file } = entry;
        try {
          // Step 1: Extract JPEG preview frame (max 15s timeout — skip if slow)
          setter(prev => prev.map(c => c.id === id ? { ...c, status: "extracting" as UploadStatus, progress: 0, label: "Processing…" } : c));
          let frameBlob: Blob | null = null;
          try {
            frameBlob = await Promise.race([
              extractPreviewFrame(file),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15_000)),
            ]);
          } catch {
            console.warn(`Preview extraction skipped for ${file.name} (timed out or failed)`);
          }

          // Step 2: Upload JPEG preview to storage (skip if no frame)
          let previewPath: string | undefined;
          let previewErr: any = null;
          if (frameBlob) {
            setter(prev => prev.map(c => c.id === id ? { ...c, status: "uploading" as UploadStatus, progress: 20, label: "Uploading… 0%" } : c));
            previewPath = `${user.id}/${projectId}/preview/${file.name}.jpg`;
            const result = await supabase.storage.from("media").upload(previewPath, frameBlob, {
              contentType: "image/jpeg",
              upsert: true,
            });
            previewErr = result.error;
            if (previewErr) console.error("Preview upload error:", previewErr);
          } else {
            // No frame — go straight to upload
            setter(prev => prev.map(c => c.id === id ? { ...c, status: "uploading" as UploadStatus, progress: 20, label: "Uploading… 0%" } : c));
          }

          // Step 3: Get Mux Direct Upload URL from edge function
          setter(prev => prev.map(c => c.id === id ? { ...c, status: "uploading" as UploadStatus, progress: 25, label: "Uploading… 0%" } : c));
          
          const { data: muxData, error: muxErr } = await supabase.functions.invoke("create-mux-upload", {
            body: {
              projectId,
              fileName: file.name,
              fileType,
              fileSize: file.size,
            },
          });

          if (muxErr || !muxData?.uploadUrl) {
            throw new Error(muxErr?.message || "Failed to get upload URL");
          }

          // Update media_files row with preview image path
          if (!previewErr && previewPath && muxData.mediaFileId) {
            await supabase.from("media_files").update({
              preview_image_path: previewPath,
            } as any).eq("id", muxData.mediaFileId);
          }

          // Step 4: Upload directly to Mux with real progress
          setter(prev => prev.map(c => c.id === id ? { ...c, status: "uploading" as UploadStatus, progress: 30, label: "Uploading to Mux…" } : c));

          await uploadToMux(file, muxData.uploadUrl, (p) => {
            const pct = 30 + Math.round(p.percent * 0.65); // 30-95%
            setter(prev => prev.map(c => c.id === id && c.status === "uploading"
              ? { ...c, progress: Math.min(pct, 95), label: `Uploading… ${p.percent}%` }
              : c));
          });

          // Step 5: Run face keyframe extraction for performance clips
          if (fileType === "performance_clip" && muxData.mediaFileId) {
            setter(prev => prev.map(c => c.id === id ? { ...c, status: "complete" as UploadStatus, progress: 96, label: "Tracking faces…" } : c));
            try {
              const { extractFaceKeyframes, smoothKeyframes } = await import("@/lib/faceTracking");
              const rawKeyframes = await extractFaceKeyframes(file, (pct) => {
                setter(prev => prev.map(c => c.id === id
                  ? { ...c, label: `Tracking faces… ${pct}%` }
                  : c));
              });
              const smoothed = smoothKeyframes(rawKeyframes);
              await supabase.from("media_files").update({
                face_keyframes: smoothed as any,
              } as any).eq("id", muxData.mediaFileId);
            } catch (err) {
              console.warn("Face tracking failed (non-fatal):", err);
            }
          }

          setter(prev => prev.map(c => c.id === id ? { ...c, status: "complete" as UploadStatus, progress: 100, savedToDb: true, label: "Ready" } : c));

          // Brief pause between files
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err) {
          console.error(`Processing failed for ${file.name}:`, err);
          setter(prev => prev.map(c => c.id === id ? { ...c, status: "error" as UploadStatus, error: "Upload failed", label: "Failed" } : c));
        }
      }
    })();
  };

  // Drag helpers
  const makeDragHandlers = (setDragging: (v: boolean) => void, onDrop: (files: File[]) => void) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragging(true); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragging(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onDrop(files);
    },
  });

  const songDragHandlers = makeDragHandlers(setIsDraggingSong, (files) => {
    if (files.length > 1) toast.info("Only one song per project. We used the first file.");
    processSongFile(files[0]);
  });

  const validateAndFilterClips = (files: File[]): File[] => {
    const valid: File[] = [];
    const acceptedTypes = ["video/mp4", "video/quicktime", "video/x-m4v"];
    const acceptedExtensions = [".mp4", ".mov", ".m4v"];
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB

    files.forEach(f => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      const validType = acceptedTypes.includes(f.type) || acceptedExtensions.includes(ext);

      if (!validType) {
        toast.error(`${f.name} is not supported. Please upload MP4, MOV, or M4V files only.`);
      } else if (f.size > maxSize) {
        toast.error(`${f.name} is too large. Maximum file size is 2GB. ROTOVIDE is optimized for phone footage.`);
      } else {
        valid.push(f);
      }
    });
    return valid;
  };

  const perfDragHandlers = makeDragHandlers(setIsDraggingPerf, (files) => {
    const valid = validateAndFilterClips(files);
    if (valid.length > 0) processClipFiles(valid, "perf");
  });
  const brollDragHandlers = makeDragHandlers(setIsDraggingBroll, (files) => {
    const valid = validateAndFilterClips(files);
    if (valid.length > 0) processClipFiles(valid, "broll");
  });

  const handleClipSelect = (e: React.ChangeEvent<HTMLInputElement>, type: "perf" | "broll") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const valid = validateAndFilterClips(Array.from(files));
    if (valid.length > 0) processClipFiles(valid, type);
    e.target.value = "";
  };

  const removeClip = (type: "perf" | "broll", index: number) => {
    const setter = type === "perf" ? setPerfClips : setBrollClips;
    setter(prev => prev.filter((_, i) => i !== index));
  };

  const createProjectIfNeeded = async (): Promise<boolean> => {
    if (projectId) return true;
    if (!user) { toast.error("You must be logged in to create a project."); return false; }
    try {
      const { data, error } = await supabase.from("projects").insert({
        user_id: user.id, name, artist_name: artist || null, song_title: songTitle || null,
        bpm: bpm ? Number(bpm) : null, format: format === "both" ? "both" : format,
        style_preset: style, color_grade: "none", color_grade_intensity: 0.5,
        status: "active", sync_status: "pending",
      }).select("id").single();
      if (error) { console.error("Project creation error:", error); toast.error("Something went wrong creating your project. Try again."); return false; }
      setProjectId(data.id);
      return true;
    } catch (err) { console.error("Unexpected error:", err); toast.error("Something went wrong creating your project. Try again."); return false; }
  };

  const handleFinishProject = async () => {
    if (!projectId) return;
    setCreating(true);
    try {
      // 1. Save color grade selection
      await supabase.from("projects").update({
        style_preset: style,
        color_grade: colorGrade,
        color_grade_intensity: colorIntensity / 100,
        sync_status: "processing",
      }).eq("id", projectId);

      // 2. Navigate immediately — don't wait for sync
      navigate(`/app/projects/${projectId}`);

      // 3. Fire beat sync in the background after navigation
      runBeatSync(projectId).then((result) => {
        if (!result.success) {
          console.error("Auto-sync failed:", result.error);
        }
      }).catch((err) => {
        console.error("Auto-sync error:", err);
      });

    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("Something went wrong. Try again.");
      setCreating(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setTimeout(() => { document.body.style.display = 'none'; void document.body.offsetHeight; document.body.style.display = ''; }, 50);
  };

  const handleContinue = async () => {
    if (step === 0) {
      const ok = await createProjectIfNeeded();
      if (!ok) return;
      // Skip the Style step when coming from dashboard with pre-loaded files
      if (isFromDashboard) {
        setStep(2); // jump to Song step
        scrollToTop();
        return;
      }
    }
    setStep(step + 1);
    scrollToTop();
  };

  const allClipFiles = [...perfClips.map(c => c.file), ...brollClips.map(c => c.file)];

  return (
    <div className="max-w-3xl mx-auto space-y-8 px-4 sm:px-0 overflow-x-hidden">
      {/* Back */}
      <button onClick={() => navigate("/app/projects")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-default">
        <ArrowLeft className="w-4 h-4" /> Back to Projects
      </button>

      {/* Step indicator */}
      <div className="flex items-center gap-2 justify-center">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-default", i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={cn("text-sm hidden sm:inline", i <= step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < steps.length - 1 && <div className={cn("w-8 h-px", i < step ? "bg-primary" : "bg-border")} />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="surface-card shadow-card p-6 md:p-8">
        {/* Step 0: Details */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Project Details</h2>
              <p className="text-sm text-muted-foreground mt-1">Set up your music video project</p>
            </div>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Project Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My First Video" className="bg-background" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Artist Name</Label>
                  <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Your artist name" className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label>Song Title</Label>
                  <Input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Track name" className="bg-background" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>BPM <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={bpm} onChange={(e) => setBpm(e.target.value)} placeholder="We'll detect it automatically" className="bg-background" type="number" />
              </div>
            </div>
            {/* Format Selection */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Output Format</h3>
              <div className="grid sm:grid-cols-3 gap-3">
                {([
                  { value: "9:16" as VideoFormat, icon: Smartphone, label: "Vertical 9:16", desc: "TikTok · Reels · Shorts", sub: "Best for daily content" },
                  { value: "16:9" as VideoFormat, icon: Monitor, label: "Horizontal 16:9", desc: "YouTube · Full Music Video", sub: "Traditional format" },
                  { value: "both" as VideoFormat, icon: Layers, label: "Both Formats", desc: "Maximum Reach", sub: "One shoot, two videos" },
                ]).map(({ value, icon: Icon, label, desc, sub }) => (
                  <button key={value} onClick={() => setFormat(value)} className={cn("relative surface-card p-4 text-left transition-default rounded-xl", format === value ? "glow-primary border-primary" : "hover:border-primary/30")}>
                    {value === "both" && <span className="absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary flex items-center gap-1"><Lock className="w-3 h-3" /> Pro</span>}
                    <Icon className={cn("w-8 h-8 mb-3", format === value ? "text-primary" : "text-muted-foreground")} />
                    <p className="font-medium text-foreground text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Style */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Choose your edit style</h2>
              <p className="text-sm text-muted-foreground mt-1">This determines how your clips are cut, transitioned, and styled</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {([
                { value: "raw_cut" as StylePreset, icon: Scissors, label: "Raw Cut", desc: "Hard cuts on every beat. Classic, clean, no effects.", tier: "free" },
                { value: "cinematic" as StylePreset, icon: Clapperboard, label: "Cinematic", desc: "Slow zooms, film grain, smooth cuts. The Lyrical Lemonade look.", tier: "pro" },
                { value: "hype" as StylePreset, icon: Zap, label: "Hype", desc: "Camera shake on every kick. Whip cuts. Film burns. Pure energy.", tier: "pro" },
                { value: "vibe" as StylePreset, icon: Sparkles, label: "Vibe", desc: "Film burns, lo-fi texture, warm glow. For storytelling rap.", tier: "pro" },
              ]).map(({ value, icon: Icon, label, desc, tier }) => (
                <button key={value} onClick={() => setStyle(value)} className={cn("relative surface-card p-5 text-left transition-default rounded-xl", style === value ? "glow-primary border-primary" : "hover:border-primary/30")}>
                  {tier !== "free" && <span className="absolute top-3 right-3 text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary flex items-center gap-1"><Lock className="w-3 h-3" /> Pro</span>}
                  <Icon className={cn("w-7 h-7 mb-3", style === value ? "text-primary" : "text-muted-foreground")} />
                  <p className="font-semibold text-foreground">{label}</p>
                  <p className="text-sm text-muted-foreground mt-1">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Song Upload */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Upload Your Song</h2>
              <p className="text-sm text-muted-foreground mt-1">Upload the official song file for beat analysis</p>
            </div>
            <input ref={songInputRef} type="file" accept="audio/mp3,audio/wav,audio/mpeg,.mp3,.wav" className="hidden" onChange={handleSongSelect} />
            {!songFile ? (
              <div onClick={() => songInputRef.current?.click()} {...songDragHandlers}
                className={cn("w-full border-2 border-dashed rounded-xl p-12 text-center transition-default cursor-pointer", isDraggingSong ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-foreground font-medium">Drop your MP3 or WAV here, or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">MP3 or WAV · Max 200MB</p>
              </div>
            ) : (
              <div className="surface-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Music className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{songFile.file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(songFile.file.size)}</p>
                    </div>
                  </div>
                  <button onClick={() => setSongFile(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-300", songFile.status === "error" ? "bg-destructive" : songFile.status === "complete" ? "bg-green-500" : "bg-primary")}
                    style={{ width: `${songFile.progress}%` }} />
                </div>
                {songFile.status === "complete" && <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Ready</p>}
                {songFile.status === "error" && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Upload failed</p>}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Video Clips Upload */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Upload Your Clips</h2>
              <p className="text-sm text-muted-foreground mt-1">Add your performance footage and B-roll</p>
            </div>

            <FileSizeWarning files={allClipFiles} />

            <input ref={perfInputRef} type="file" accept=".mp4,.mov,.m4v,video/mp4,video/quicktime,video/x-m4v" multiple className="hidden" onChange={(e) => handleClipSelect(e, "perf")} />
            <input ref={brollInputRef} type="file" accept=".mp4,.mov,.m4v,video/mp4,video/quicktime,video/x-m4v" multiple className="hidden" onChange={(e) => handleClipSelect(e, "broll")} />

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Performance */}
              <div className="space-y-3">
                <div onClick={() => perfInputRef.current?.click()} {...perfDragHandlers}
                  className={cn("w-full border-2 border-dashed rounded-xl p-8 text-center transition-default cursor-pointer", isDraggingPerf ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                  <Upload className="w-10 h-10 text-primary/60 mx-auto mb-3" />
                  <p className="text-foreground font-medium text-sm">Performance Clips</p>
                  <p className="text-xs text-muted-foreground mt-1">Drop your clips here, or click to browse</p>
                  <p className="text-xs text-muted-foreground">MP4, MOV or M4V · Max 2GB</p>
                </div>
                {perfClips.map((clip, i) => (
                  <ClipRow key={clip.id} clip={clip} onRemove={() => removeClip("perf", i)} type="perf" />
                ))}
                {perfClips.length > 0 && (
                  <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => perfInputRef.current?.click()}>
                    <Plus className="w-3.5 h-3.5" /> Add more clips
                  </Button>
                )}
              </div>

              {/* B-Roll */}
              <div className="space-y-3">
                <div onClick={() => brollInputRef.current?.click()} {...brollDragHandlers}
                  className={cn("w-full border-2 border-dashed rounded-xl p-8 text-center transition-default cursor-pointer", isDraggingBroll ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                  <Upload className="w-10 h-10 text-success/60 mx-auto mb-3" />
                  <p className="text-foreground font-medium text-sm">B-Roll Clips</p>
                  <p className="text-xs text-muted-foreground mt-1">Drop your B-roll here, or click to browse</p>
                  <p className="text-xs text-muted-foreground">MP4, MOV or M4V · Max 2GB</p>
                </div>
                {brollClips.map((clip, i) => (
                  <ClipRow key={clip.id} clip={clip} onRemove={() => removeClip("broll", i)} type="broll" />
                ))}
                {brollClips.length > 0 && (
                  <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => brollInputRef.current?.click()}>
                    <Plus className="w-3.5 h-3.5" /> Add more clips
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">Our AI will place your B-roll at the best moments — always on beat, during verses, never on the hook</p>
          </div>
        )}

        {/* Step 4: Color Grade (LAST) */}
        {step === 4 && (
          <WizardColorStep
            colorGrade={colorGrade}
            colorIntensity={colorIntensity}
            projectId={projectId}
            onGradeChange={setColorGrade}
            onIntensityChange={setColorIntensity}
            onSkip={() => { setColorGrade("none"); setColorIntensity(50); handleFinishProject(); }}
          />
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => {
          if (step > 0) { setStep(step - 1); scrollToTop(); } else { navigate("/app/projects"); }
        }} className="border-border">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        {step < steps.length - 1 ? (
          <Button onClick={handleContinue} disabled={!canContinue}>
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleFinishProject} disabled={creating}>
            {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Building…</> : <>Build My Video <ArrowRight className="w-4 h-4 ml-2" /></>}
          </Button>
        )}
      </div>
    </div>
  );
}
