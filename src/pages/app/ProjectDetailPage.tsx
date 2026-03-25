import { useParams, Link, useNavigate } from "react-router-dom";
import { getMuxThumbnailUrl, getMuxAnimatedUrl } from "@/lib/muxThumbnails";
import { ArrowLeft, Zap, Play, Film, HardDrive, Download, Loader2, AlertTriangle, ScanFace, Plus, Upload, MessageSquare, Check, Scissors, Clapperboard, Sparkles, Lock, Link2 } from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
import { Button } from "@/components/ui/button";

import { SyncStatusBadge, FormatBadge, StyleBadge } from "@/components/projects/Badges";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { runBeatSync } from "@/lib/beatSyncEngine";
import type { SyncStatus } from "@/types";
import { ProjectActionsMenu, ArchivedBanner } from "@/components/projects/ProjectActions";
import { useAuth } from "@/hooks/useAuth";
import { uploadToMux } from "@/lib/muxUploader";
import { extractPreviewFrame } from "@/lib/proxyGenerator";
import { extractFaceKeyframes, smoothKeyframes } from "@/lib/faceTracking";

const tabs = ["Overview", "Clips", "B-Roll", "Captions", "Exports"] as const;

/* BPM Modal removed — BPM is now auto-detected from the song audio during sync */

/* ── Style options ── */
const STYLE_OPTIONS = [
  { value: "raw_cut", label: "Raw Cut", icon: Scissors, proOnly: false },
  { value: "cinematic", label: "Cinematic", icon: Clapperboard, proOnly: true },
  { value: "hype", label: "Hype", icon: Zap, proOnly: true },
  { value: "vibe", label: "Vibe", icon: Sparkles, proOnly: true },
] as const;

/* ── Sync Status Card ── */
function SyncStatusCard({
  status,
  onSync,
  timelineData,
  perfCount = 0,
  brollCount = 0,
  projectId,
  currentStyle,
  isPro,
  onStyleChange,
}: {
  status: SyncStatus;
  onSync?: () => void;
  timelineData?: any;
  perfCount?: number;
  brollCount?: number;
  projectId?: string;
  currentStyle?: string;
  isPro?: boolean;
  onStyleChange?: (style: string) => void;
}) {
  if (status === "pending") {
    return (
      <div className="surface-card shadow-card p-6 border-border">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Film className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">Ready to sync your clips to the beat</h3>
            <p className="text-sm text-muted-foreground mt-1">We'll analyze your footage, classify your clips, and build your timeline automatically</p>
            <Button className="mt-4 w-full sm:w-auto" size="lg" onClick={onSync}>
              <Zap className="w-4 h-4 mr-2" /> Sync to Beat
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Takes 30-60 seconds depending on clip length</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "processing") {
    return (
      <div className="surface-card shadow-card p-6 border-primary/30 bg-primary/5">
        <div className="flex items-center gap-3 mb-4">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <h3 className="text-lg font-semibold text-foreground">🤖 AI is directing your video...</h3>
        </div>
        <div className="space-y-3">
          {[
            "Processing your clips...",
            "Auto-detecting BPM from audio...",
            "Analyzing beat structure & sections...",
            "Syncing performance clips to song audio...",
            "AI director placing footage...",
            "Building your video...",
          ].map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs bg-primary/20 text-primary animate-pulse">
                ⟳
              </div>
              <span className="text-sm text-muted-foreground">{s}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">This may take a minute if clips are still being processed by our servers.</p>
      </div>
    );
  }

  if (status === "ready") {
    const duration = timelineData?.duration || 0;
    const mins = Math.floor(duration / 60);
    const secs = Math.floor(duration % 60).toString().padStart(2, "0");
    const creativeNote = timelineData?.creative_note || "";
    const sectionTypes = [...new Set((timelineData?.sections || []).map((s: any) => s.type))];

    return (
      <div className="surface-card shadow-card p-6 border-success/30 bg-success/5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center shrink-0">
            <Play className="w-6 h-6 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">Your video is synced and ready to edit!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {perfCount} performance clips synced
              {brollCount > 0 && ` · ${brollCount} b-roll clips placed`}
              {duration > 0 && ` · ${mins}:${secs} total duration`}
            </p>

            {/* Section pills */}
            {sectionTypes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {sectionTypes.map((s: string) => (
                  <span
                    key={s}
                    className={cn(
                      "px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider",
                      s === "chorus" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* Director's Note */}
            {creativeNote && (
              <p className="text-xs text-muted-foreground mt-3 italic font-mono">
                🎬 "{creativeNote}"
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <Link to="editor" className="w-full sm:w-auto">
                <Button size="lg" className="bg-success hover:bg-success/90 w-full sm:w-auto">
                  <Play className="w-4 h-4 mr-2" /> Open Editor
                </Button>
              </Link>
              <Button variant="outline" className="border-border w-full sm:w-auto" onClick={onSync}>
                <Zap className="w-4 h-4 mr-2" /> Rebuild Timeline
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="border-border w-full sm:w-auto">
                    Change Style
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-2">
                  <div className="space-y-1">
                    {STYLE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = currentStyle === opt.value;
                      const locked = opt.proOnly && !isPro;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            if (locked) {
                              toast("Upgrade to Pro to unlock this style", { description: "Visit Billing to upgrade." });
                              return;
                            }
                            onStyleChange?.(opt.value);
                          }}
                          className={cn(
                            "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-foreground hover:bg-muted",
                            locked && "opacity-50"
                          )}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="flex-1 text-left">{opt.label}</span>
                          {locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                          {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card shadow-card p-6 border-destructive/30 bg-destructive/5">
      <div className="flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-destructive shrink-0 mt-1" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Sync failed — please try again</h3>
          <p className="text-sm text-muted-foreground mt-1">Something went wrong while building your timeline.</p>
          <Button className="mt-4" variant="destructive" onClick={onSync}>
            <Zap className="w-4 h-4 mr-2" /> Retry Sync
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Clip Card with hover-to-preview ── */
function ClipCard({
  clip,
  thumbnailUrl,
  animatedUrl,
  badgeLabel,
  badgeClass,
}: {
  clip: any;
  thumbnailUrl?: string;
  animatedUrl?: string;
  badgeLabel: string;
  badgeClass: string;
}) {
  const [hovered, setHovered] = useState(false);
  const showAnimated = hovered && animatedUrl;

  return (
    <div className="surface-card shadow-card overflow-hidden group">
      <div
        className="h-32 bg-muted/50 flex items-center justify-center overflow-hidden relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt={clip.file_name}
              className={cn(
                "w-full h-full object-cover transition-opacity duration-200",
                showAnimated ? "opacity-0" : "opacity-100"
              )}
            />
            {showAnimated && (
              <img
                src={animatedUrl}
                alt={`${clip.file_name} preview`}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
          </>
        ) : (
          <Film className="w-8 h-8 text-muted-foreground/30" />
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-foreground truncate">{clip.file_name}</p>
        <p className="text-xs text-muted-foreground">{clip.size_bytes ? formatBytes(clip.size_bytes) : "—"}</p>
        <span className={cn("inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full", badgeClass)}>
          {badgeLabel}
        </span>
      </div>
    </div>
  );
}

/* ── Reanalyze Faces Button ── */
function ReanalyzeFacesButton({ projectId, clips }: { projectId: string; clips: any[] }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const handleReanalyze = async () => {
    setRunning(true);
    setProgress("Loading face model…");

    try {
      const { extractFaceKeyframes, smoothKeyframes } = await import("@/lib/faceTracking");

      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        setProgress(`Tracking clip ${i + 1}/${clips.length}: ${clip.file_name}`);

        // We need the original file — fetch from Mux or storage
        const muxId = clip.mux_playback_id;
        if (!muxId) {
          console.warn(`No Mux playback for ${clip.file_name}, skipping`);
          continue;
        }

        // Use Mux low-res MP4 for face tracking, with fallback chain
        const renditions = ["low", "medium", "high"];
        let blob: Blob | null = null;
        for (const quality of renditions) {
          try {
            const resp = await fetch(`https://stream.mux.com/${muxId}/${quality}.mp4`);
            if (resp.ok) {
              blob = await resp.blob();
              break;
            }
          } catch {}
        }
        if (!blob) {
          console.warn(`Could not fetch any MP4 rendition for ${clip.file_name}`);
          continue;
        }
        try {
          const file = new File([blob], clip.file_name, { type: "video/mp4" });

          const rawKeyframes = await extractFaceKeyframes(file, (pct) => {
            setProgress(`Tracking ${clip.file_name}… ${pct}%`);
          });
          const smoothed = smoothKeyframes(rawKeyframes);

          await supabase.from("media_files").update({
            face_keyframes: smoothed as any,
          } as any).eq("id", clip.id);
        } catch (err) {
          console.warn(`Face tracking failed for ${clip.file_name}:`, err);
        }
      }

      setProgress("");
      toast.success("Face tracking complete for all clips!");
    } catch (err) {
      console.error("Reanalyze failed:", err);
      toast.error("Face tracking failed. Try again.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleReanalyze}
        disabled={running}
        className="gap-2"
      >
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanFace className="w-3.5 h-3.5" />}
        {running ? "Tracking…" : "Reanalyze Faces"}
      </Button>
      {progress && (
        <span className="text-xs text-muted-foreground font-mono">{progress}</span>
      )}
    </div>
  );
}

/* ── Add Footage Button ── */
function AddFootageButton({ projectId, fileType, onComplete }: {
  projectId: string;
  fileType: "performance_clip" | "broll_clip";
  onComplete: () => void;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`Uploading ${file.name} (${i + 1}/${files.length})…`);

      try {
        // Extract preview frame
        setProgress(`Extracting preview for ${file.name}…`);
        let previewPath: string | null = null;
        try {
          const frameBlob = await extractPreviewFrame(file);
          previewPath = `${user.id}/${projectId}/preview/${file.name}.jpg`;
          await supabase.storage.from("media").upload(previewPath, frameBlob, {
            contentType: "image/jpeg",
            upsert: true,
          });
        } catch {}

        // Get Mux upload URL
        setProgress(`Starting Mux upload for ${file.name}…`);
        const { data: muxData, error: muxErr } = await supabase.functions.invoke("create-mux-upload", {
          body: { projectId, fileName: file.name, fileType, fileSize: file.size },
        });

        if (muxErr || !muxData?.uploadUrl) throw new Error("Failed to get upload URL");

        // Update preview path
        if (previewPath && muxData.mediaFileId) {
          await supabase.from("media_files").update({
            preview_image_path: previewPath,
          } as any).eq("id", muxData.mediaFileId);
        }

        // Upload to Mux
        await uploadToMux(file, muxData.uploadUrl, (p) => {
          setProgress(`Uploading ${file.name}… ${p.percent}%`);
        });

        // Face tracking for performance clips
        if (fileType === "performance_clip" && muxData.mediaFileId) {
          setProgress(`Tracking faces in ${file.name}…`);
          try {
            const rawKf = await extractFaceKeyframes(file);
            const smoothed = smoothKeyframes(rawKf);
            await supabase.from("media_files").update({
              face_keyframes: smoothed as any,
            } as any).eq("id", muxData.mediaFileId);
          } catch {}
        }
      } catch (err) {
        console.error(`Upload failed for ${file.name}:`, err);
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    setProgress("");
    toast.success("New clips added. Re-sync your project to include them.");
    onComplete();
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="gap-2"
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {uploading ? "Uploading…" : "Add Footage"}
      </Button>
      {progress && (
        <span className="text-xs text-muted-foreground font-mono">{progress}</span>
      )}
    </div>
  );
}

/* ── YouTube Import Button ── */
function YouTubeImportButton({ projectId, fileType, onComplete }: {
  projectId: string;
  fileType: "performance_clip" | "broll_clip";
  onComplete: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);

  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;
  const isValid = ytRegex.test(url.trim());

  const handleImport = async () => {
    if (!isValid || !user || importing) return;
    setImporting(true);
    try {
      const { error } = await supabase.functions.invoke("youtube-ingest", {
        body: { youtubeUrl: url.trim(), project_id: projectId, user_id: user.id, file_type: fileType },
      });
      if (error) throw error;
      toast.success("YouTube import started! The clip will appear once processing completes.");
      setUrl("");
      setOpen(false);
      onComplete();
    } catch (err) {
      console.error("YouTube import failed:", err);
      toast.error("YouTube import failed. Check the URL and try again.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Link2 className="w-3.5 h-3.5" />
          YouTube Import
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Import from YouTube</p>
          <p className="text-xs text-muted-foreground mt-0.5">Paste a YouTube URL to import as a clip</p>
        </div>
        <Input
          placeholder="https://youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && isValid) handleImport(); }}
        />
        {url.trim().length > 0 && (
          <p className={cn("text-xs", isValid ? "text-success" : "text-destructive")}>
            {isValid ? "✓ Valid YouTube URL" : "✗ Invalid YouTube URL"}
          </p>
        )}
        <Button
          className="w-full"
          size="sm"
          disabled={!isValid || importing}
          onClick={handleImport}
        >
          {importing ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Importing…</> : "Import"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/* ── Main Page ── */
export default function ProjectDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isPro } = useAuth();
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>("Overview");
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasSong, setHasSong] = useState(false);
  const [clipCount, setClipCount] = useState(0);
  const [mediaFiles, setMediaFiles] = useState<any[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [animatedUrls, setAnimatedUrls] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [exports, setExports] = useState<any[]>([]);
  const [exportsLoading, setExportsLoading] = useState(false);

  const syncStatus = (project?.sync_status || "pending") as SyncStatus;
  const timelineData = project?.timeline_data;

  const refreshMedia = useCallback(() => setRefreshKey(k => k + 1), []);

  // Fetch project + media_files from DB
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [projRes, mediaRes] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("media_files").select("id, file_name, file_type, size_bytes, preview_image_path, status, created_at, mux_playback_id").eq("project_id", id).is("deleted_at", null).order("created_at", { ascending: true }),
      ]);
      if (projRes.data) setProject(projRes.data);
      const files = mediaRes.data || [];
      setMediaFiles(files);
      setHasSong(files.some((f: any) => f.file_type === "song"));
      setClipCount(files.filter((f: any) => f.file_type === "performance_clip" || f.file_type === "broll_clip").length);

      // Build thumbnail URLs: prefer Mux thumbnails, fallback to signed preview images
      const urlMap: Record<string, string> = {};
      for (const f of files) {
        const muxId = (f as any).mux_playback_id;
        if (muxId) {
          urlMap[f.id] = getMuxThumbnailUrl(muxId, { width: 400, fitMode: "smartcrop" });
        }
      }
      // For files without Mux, fall back to signed preview image URLs
      const needSigned = files.filter((f: any) => f.preview_image_path && !urlMap[f.id]);
      if (needSigned.length > 0) {
        const results = await Promise.all(
          needSigned.map((f: any) =>
            supabase.storage.from("media").createSignedUrl(f.preview_image_path, 3600).then(r => ({ id: f.id, url: r.data?.signedUrl }))
          )
        );
        results.forEach(r => { if (r.url) urlMap[r.id] = r.url; });
      }
      setPreviewUrls(urlMap);

      // Build animated GIF URLs for Mux clips (hover preview)
      const gifMap: Record<string, string> = {};
      for (const f of files) {
        const muxId = (f as any).mux_playback_id;
        if (muxId) {
          gifMap[f.id] = getMuxAnimatedUrl(muxId, { width: 320, fps: 10, start: 0, end: 4 });
        }
      }
      setAnimatedUrls(gifMap);
      setLoading(false);
    })();
  }, [id, refreshKey]);

  // Fetch exports when Exports tab is active
  useEffect(() => {
    if (activeTab !== "Exports" || !id) return;
    let cancelled = false;
    setExportsLoading(true);
    (async () => {
      const { data } = await supabase
        .from("exports")
        .select("id, status, format, download_url, created_at, watermarked, size_bytes")
        .eq("project_id", id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setExports(data || []);
        setExportsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, id]);

  // Realtime subscription for sync status updates
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`project-sync-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setProject((prev: any) => ({ ...prev, ...payload.new }));
          const newStatus = payload.new.sync_status;
          if (newStatus === "ready") {
            toast.success("Sync complete! Your video is ready to edit.");
            // Trigger lyrics transcription automatically after sync
            triggerLyricsTranscription(payload.new);
          } else if (newStatus === "failed") {
            toast.error("Sync failed. Try again.");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Handle style change
  const handleStyleChange = useCallback(async (newStyle: string) => {
    if (!id) return;
    const label = STYLE_OPTIONS.find(o => o.value === newStyle)?.label ?? newStyle;
    const { error } = await supabase
      .from("projects")
      .update({ style_preset: newStyle } as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update style.");
      return;
    }
    setProject((prev: any) => ({ ...prev, style_preset: newStyle }));
    toast.success(`Style changed to ${label}. Rebuild to apply.`);
  }, [id]);

  // Handle sync to beat — BPM is now auto-detected from audio
  const handleSyncToBeat = useCallback(async () => {
    if (!id || !project) return;

    // Set processing immediately
    setProject((prev: any) => ({ ...prev, sync_status: "processing" }));
    await supabase.from("projects").update({ sync_status: "processing" }).eq("id", id);

    // Run the sync engine (auto-detects BPM from song audio)
    const result = await runBeatSync(id);
    if (!result.success) {
      toast.error(result.error || "Sync failed.");
      if (result.error?.includes("Upload at least one")) {
        setProject((prev: any) => ({ ...prev, sync_status: "pending" }));
      }
    }
  }, [id, project]);

  // Trigger lyrics transcription after sync completes
  const triggerLyricsTranscription = useCallback(async (projectData: any) => {
    if (!id) return;
    // Skip if lyrics already exist
    if (projectData.lyrics_data?.words?.length) return;

    try {
      // Get song audio URL
      const { data: songFile } = await supabase
        .from("media_files")
        .select("storage_path, proxy_storage_path, mux_playback_id")
        .eq("project_id", id)
        .eq("file_type", "song")
        .is("deleted_at", null)
        .maybeSingle();

      if (!songFile) return;

      let audioUrl = "";
      // Prefer signed storage URL (more reliable than Mux audio extraction)
      const path = songFile.storage_path || songFile.proxy_storage_path;
      if (path) {
        const { data: signed } = await supabase.storage.from("media").createSignedUrl(path, 3600);
        if (signed?.signedUrl) audioUrl = signed.signedUrl;
      }
      // Only fall back to Mux if storage path doesn't exist
      if (!audioUrl && songFile.mux_playback_id) {
        audioUrl = `https://stream.mux.com/${songFile.mux_playback_id}/audio.m4a`;
      }
      if (!audioUrl) return;

      console.log("Triggering lyrics transcription for project:", id);
      const { error } = await supabase.functions.invoke("transcribe-lyrics", {
        body: { projectId: id, audioUrl },
      });

      if (error) {
        console.error("Lyrics transcription failed:", error);
      } else {
        toast.success("Lyrics transcribed! Open the editor to see captions.");
      }
    } catch (err) {
      console.error("Lyrics transcription error:", err);
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const bpmDisplay = project?.detected_bpm || project?.bpm || "—";

  return (
    <div className="space-y-6 max-w-5xl overflow-x-hidden px-4 sm:px-0">
      {/* BPM Modal */}

      {/* Archived Banner */}
      {project?.status === "archived" && <ArchivedBanner projectId={id!} />}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/app/projects" className="text-muted-foreground hover:text-foreground transition-default">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{project?.name || "Untitled"}</h1>
            {project?.artist_name && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{project.artist_name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {bpmDisplay !== "—" && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {bpmDisplay} BPM{project?.detected_bpm ? " · auto" : ""}
              </span>
            )}
            <FormatBadge format={project?.format || "9:16"} />
            <StyleBadge style={project?.style_preset || "raw_cut"} />
            <SyncStatusBadge status={syncStatus} />
          </div>
        </div>
        <ProjectActionsMenu
          projectId={id!}
          projectStatus={project?.status || "active"}
          projectName={project?.name}
        />
      </div>

      {/* Sync Status Card */}
      <SyncStatusCard
        status={syncStatus}
        onSync={handleSyncToBeat}
        timelineData={timelineData}
        perfCount={mediaFiles.filter(f => f.file_type === "performance_clip").length}
        brollCount={mediaFiles.filter(f => f.file_type === "broll_clip").length}
        projectId={id}
        currentStyle={project?.style_preset || "raw_cut"}
        isPro={isPro}
        onStyleChange={handleStyleChange}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-default -mb-px whitespace-nowrap",
              activeTab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "Overview" && (
          <div className="space-y-4">
            <div className="surface-card shadow-card p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Film className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{project?.song_title || "No song uploaded"}</p>
                  <p className="text-sm text-muted-foreground">
                    {timelineData
                      ? `${Math.floor(timelineData.duration / 60)}:${Math.floor(timelineData.duration % 60).toString().padStart(2, "0")} · ${timelineData.bpm} BPM · ${(timelineData.sections || []).length} sections detected`
                      : hasSong
                        ? "Song uploaded — ready for sync"
                        : "Upload a song to begin"}
                  </p>
                </div>
              </div>
              {timelineData?.sections && (
                <div className="mt-4 flex gap-2 flex-wrap">
                  {[...new Set(timelineData.sections.map((s: any) => s.type))].map((s: string) => (
                    <span
                      key={s}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium",
                        s === "chorus" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="surface-card shadow-card p-5">
              <p className="text-sm text-muted-foreground">
                {timelineData?.clip_summary
                  ? `${timelineData.clip_summary.performance_count} performance clips · ${timelineData.clip_summary.broll_count} b-roll clips`
                  : clipCount > 0
                    ? `${clipCount} clip${clipCount !== 1 ? "s" : ""} uploaded`
                    : "No clips uploaded yet"}
              </p>
            </div>
          </div>
        )}
        {activeTab === "Clips" && (() => {
          const perfClips = mediaFiles.filter(f => f.file_type === "performance_clip");
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <AddFootageButton projectId={id!} fileType="performance_clip" onComplete={refreshMedia} />
                <YouTubeImportButton projectId={id!} fileType="performance_clip" onComplete={refreshMedia} />
                {perfClips.length > 0 && <ReanalyzeFacesButton projectId={id!} clips={perfClips} />}
              </div>
              {perfClips.length === 0 ? (
                <EmptyState icon={Upload} title="No performance clips yet" description="Add your first performance clip above." />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {perfClips.map((clip) => (
                    <ClipCard
                      key={clip.id}
                      clip={clip}
                      thumbnailUrl={previewUrls[clip.id]}
                      animatedUrl={animatedUrls[clip.id]}
                      badgeLabel="Performance ✓"
                      badgeClass="bg-success/15 text-success"
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        {activeTab === "B-Roll" && (() => {
          const brollClips = mediaFiles.filter(f => f.file_type === "broll_clip");
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <AddFootageButton projectId={id!} fileType="broll_clip" onComplete={refreshMedia} />
                <YouTubeImportButton projectId={id!} fileType="broll_clip" onComplete={refreshMedia} />
              </div>
              {brollClips.length === 0 ? (
                <EmptyState icon={Upload} title="No B-roll yet" description="Add B-roll clips above to unlock AI placement." />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {brollClips.map((clip) => (
                    <ClipCard
                      key={clip.id}
                      clip={clip}
                      thumbnailUrl={previewUrls[clip.id]}
                      animatedUrl={animatedUrls[clip.id]}
                      badgeLabel="B-Roll"
                      badgeClass="bg-muted text-muted-foreground"
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        {activeTab === "Captions" && (
          <div className="space-y-4">
            {(project as any)?.lyrics_data?.words?.length > 0 ? (
              <div className="surface-card shadow-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  <p className="text-sm text-foreground font-medium">
                    {(project as any).lyrics_data.words.length} words transcribed
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Open in the editor to adjust caption style, size, and position.
                </p>
                <Button onClick={() => navigate(`/app/projects/${id}/editor`)}>
                  Open Editor with Captions
                </Button>
              </div>
            ) : (
              <div className="surface-card shadow-card p-5 space-y-3 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-foreground">No captions yet</p>
                <p className="text-xs text-muted-foreground">
                  Transcription runs automatically after your sync completes.
                  Or add captions manually via the AI Captions tool.
                </p>
                <Button variant="outline" onClick={() => navigate("/app/captions")}>
                  Add Captions
                </Button>
              </div>
            )}
          </div>
        )}
        {activeTab === "Exports" && (
          exportsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : exports.length === 0 ? (
            <EmptyState
              icon={Download}
              title="No exports yet"
              description="Sync your clips first then export from the editor"
              action={
                syncStatus === "ready" ? (
                  <Button onClick={() => navigate(`/app/projects/${id}/editor`)}>Open Editor</Button>
                ) : (
                  <Button disabled>Start New Export</Button>
                )
              }
            />
          ) : (
            <div className="space-y-2">
              {exports.map((exp) => {
                const date = new Date(exp.created_at);
                const statusColor = exp.status === "completed" ? "text-success" : exp.status === "processing" ? "text-primary" : "text-destructive";
                const statusBg = exp.status === "completed" ? "bg-success/15" : exp.status === "processing" ? "bg-primary/15" : "bg-destructive/15";
                return (
                  <div key={exp.id} className="surface-card shadow-card p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider", statusBg, statusColor)}>
                          {exp.status}
                        </span>
                        {exp.format && (
                          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {exp.format}
                          </span>
                        )}
                        {exp.watermarked && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            Watermarked
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 font-mono">
                        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {exp.size_bytes ? ` · ${formatBytes(exp.size_bytes)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {exp.download_url && (
                        <>
                          <a href={exp.download_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="gap-1.5">
                              <Download className="w-3.5 h-3.5" /> Download
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => {
                              navigator.clipboard.writeText(exp.download_url);
                              toast.success("Download link copied!");
                            }}
                          >
                            <Link2 className="w-3.5 h-3.5" /> Copy Link
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
