import { Link, useNavigate } from "react-router-dom";
import { getMuxThumbnailUrl } from "@/lib/muxThumbnails";
import { Film, Plus, ArrowRight, Loader2, Music, Video, Check, Scissors, MessageSquare, Crop, X, Zap, Info, CircleDot } from "lucide-react";
import { ETABadge } from "@/components/shared/ETABadge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { storePendingFile } from "@/lib/pendingFileStore";
import { Button } from "@/components/ui/button";
import { StorageMeter } from "@/components/storage/StorageMeter";
import { SyncStatusBadge, FormatBadge } from "@/components/projects/Badges";
import { getStorageLimit } from "@/lib/storageLimits";
import { useCreditSystem } from "@/hooks/useCreditSystem";
import type { Project } from "@/types";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RotovideLogoMark } from "@/components/ui/RotovideLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";


/* ─── helpers ─── */
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ─── Tool Icon ─── */
interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  onClick: () => void;
}

function ToolIcon({ tool }: { tool: Tool }) {
  return (
    <button
      onClick={tool.onClick}
      className="flex flex-col items-center gap-2 min-w-[72px]"
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-95"
        style={{
          background: tool.accent ? 'hsla(72, 100%, 64%, 0.12)' : 'hsla(36, 30%, 92.2%, 0.06)',
          border: tool.accent ? '1px solid hsla(72, 100%, 64%, 0.2)' : '1px solid hsla(36, 30%, 92.2%, 0.08)',
          color: tool.accent ? 'hsl(72, 100%, 64%)' : 'hsla(36, 30%, 92.2%, 0.6)',
        }}
      >
        {tool.icon}
      </div>
      <span className="text-[11px] text-muted-foreground text-center leading-tight max-w-[64px]">
        {tool.label}
      </span>
    </button>
  );
}

/* ─── Project Card ─── */
function ProjectCard({ project, thumbnailUrl }: { project: Project; thumbnailUrl?: string | null }) {
  const isProcessing = project.sync_status === "processing";
  return (
    <Link
      to={`/app/projects/${project.id}`}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/20"
    >
      <div className="relative h-32 flex items-center justify-center bg-background">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={project.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <RotovideLogoMark size={40} />
        )}
        {isProcessing && <ETABadge percent={50} />}
      </div>
      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
          {project.song_title || project.name}
        </h3>
        <div className="flex items-center gap-2">
          <SyncStatusBadge status={project.sync_status} />
          <FormatBadge format={project.format} />
        </div>
        <p className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground">
          {timeAgo(project.last_activity_at || project.created_at)}
        </p>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card">
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/* ─── Music Video Upload Card ─── */
function MusicVideoUploadCard() {
  const navigate = useNavigate();
  const songInputRef = useRef<HTMLInputElement>(null);
  const perfInputRef = useRef<HTMLInputElement>(null);
  const brollInputRef = useRef<HTMLInputElement>(null);

  const [songFile, setSongFile] = useState<File | null>(null);
  const [perfFiles, setPerfFiles] = useState<File[]>([]);
  const [brollFiles, setBrollFiles] = useState<File[]>([]);
  const [isDraggingSong, setIsDraggingSong] = useState(false);
  const [isDraggingPerf, setIsDraggingPerf] = useState(false);
  const [isDraggingBroll, setIsDraggingBroll] = useState(false);
  const [storing, setStoring] = useState(false);

  const canStart = songFile !== null && perfFiles.length > 0;

  const makeDrag = (
    setDragging: (v: boolean) => void,
    onDrop: (files: File[]) => void
  ) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      onDrop(Array.from(e.dataTransfer.files));
    },
  });

  const songDrag = makeDrag(setIsDraggingSong, (files) => {
    const audio = files.find(f =>
      f.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac)$/i.test(f.name)
    );
    if (audio) setSongFile(audio);
    else toast.error("Please drop an audio file (MP3 or WAV)");
  });

  const perfDrag = makeDrag(setIsDraggingPerf, (files) => {
    const videos = files.filter(f =>
      f.type.startsWith("video/") || /\.(mp4|mov)$/i.test(f.name)
    );
    if (videos.length) setPerfFiles(prev => [...prev, ...videos]);
  });

  const brollDrag = makeDrag(setIsDraggingBroll, (files) => {
    const videos = files.filter(f =>
      f.type.startsWith("video/") || /\.(mp4|mov)$/i.test(f.name)
    );
    if (videos.length) setBrollFiles(prev => [...prev, ...videos]);
  });

  const handleBuildVideo = async () => {
    if (!canStart || storing) return;
    setStoring(true);
    try {
      await storePendingFile("newProjectSong", songFile!);
      for (let i = 0; i < perfFiles.length; i++) {
        await storePendingFile(`newProjectPerf_${i}`, perfFiles[i]);
      }
      for (let i = 0; i < brollFiles.length; i++) {
        await storePendingFile(`newProjectBroll_${i}`, brollFiles[i]);
      }
      navigate("/app/projects/new", {
        state: {
          hasPendingSong: true,
          pendingPerfCount: perfFiles.length,
          pendingBrollCount: brollFiles.length,
          fromDashboard: true,
        },
      });
    } catch (err) {
      console.error("Failed to store files:", err);
      toast.error("Couldn't queue your files. Try again.");
      setStoring(false);
    }
  };

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ background: 'hsl(0 0% 6.7%)', borderColor: 'hsla(36, 30%, 92.2%, 0.08)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p
            className="font-display text-foreground tracking-wider"
            style={{ fontSize: 15, letterSpacing: 2 }}
          >
            MUSIC VIDEO
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drop your song + footage. AI builds the edit.
          </p>
        </div>
        <span
          className="font-mono text-[9px] tracking-[2px] uppercase px-2 py-1 rounded-sm"
          style={{
            background: 'hsla(72, 100%, 64%, 0.08)',
            color: 'hsl(72, 100%, 64%)',
            border: '1px solid hsla(72, 100%, 64%, 0.15)',
          }}
        >
          BEAT SYNC
        </span>
      </div>

      {/* Three upload zones */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Zone 1: Song */}
        <div
          onClick={() => songInputRef.current?.click()}
          {...songDrag}
          className="rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all select-none"
          style={{
            borderColor: isDraggingSong
              ? 'hsl(72, 100%, 64%)'
              : songFile
              ? 'hsla(72, 100%, 64%, 0.4)'
              : 'hsla(36, 30%, 92.2%, 0.1)',
            background: songFile ? 'hsla(72, 100%, 64%, 0.04)' : 'transparent',
            minHeight: 100,
          }}
        >
          <input
            ref={songInputRef}
            type="file"
            accept=".mp3,.wav,.m4a,audio/mp3,audio/wav,audio/mpeg,audio/x-wav"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) setSongFile(f);
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center gap-2 h-full justify-center py-2">
            {songFile ? (
              <>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'hsla(72, 100%, 64%, 0.15)' }}>
                  <Check className="w-4 h-4" style={{ color: 'hsl(72, 100%, 64%)' }} />
                </div>
                <p className="text-xs font-medium truncate w-full px-1" style={{ color: 'hsl(72, 100%, 64%)' }}>
                  {songFile.name}
                </p>
                <button onClick={e => { e.stopPropagation(); setSongFile(null); }} className="text-[10px] text-muted-foreground hover:text-foreground">
                  remove
                </button>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'hsla(36, 30%, 92.2%, 0.06)' }}>
                  <Music className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xs font-semibold text-foreground">Song</p>
                <p className="text-[10px] text-muted-foreground">MP3 or WAV</p>
              </>
            )}
          </div>
        </div>

        {/* Zone 2: Performance Clips */}
        <div
          onClick={() => perfInputRef.current?.click()}
          {...perfDrag}
          className="rounded-xl border-2 border-dashed p-3 text-center cursor-pointer transition-all select-none"
          style={{
            borderColor: isDraggingPerf
              ? 'hsl(72, 100%, 64%)'
              : 'hsla(36, 30%, 92.2%, 0.1)',
            background: perfFiles.length > 0 ? 'hsla(72, 100%, 64%, 0.04)' : 'transparent',
            minHeight: 100,
          }}
        >
          <input
            ref={perfInputRef}
            type="file"
            accept=".mp4,.mov,video/mp4,video/quicktime"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files || []);
              if (files.length) setPerfFiles(prev => [...prev, ...files]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center gap-1.5 h-full justify-center py-1">
            {perfFiles.length > 0 ? (
              <>
                {/* Clip list */}
                <div className="w-full space-y-1 max-h-[80px] overflow-y-auto scrollbar-none" onClick={e => e.stopPropagation()}>
                  {perfFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left" style={{ background: 'hsla(72, 100%, 64%, 0.06)' }}>
                      <Video className="w-3 h-3 shrink-0" style={{ color: 'hsl(72, 100%, 64%)' }} />
                      <span className="text-[10px] text-foreground truncate flex-1">{f.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setPerfFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Add more prompt */}
                <div className="flex items-center gap-1 mt-1">
                  <Plus className="w-3 h-3" style={{ color: 'hsl(72, 100%, 64%)' }} />
                  <span className="text-[10px] font-medium" style={{ color: 'hsl(72, 100%, 64%)' }}>Add more clips</span>
                </div>
                {perfFiles.length === 1 && (
                  <p className="text-[9px] text-muted-foreground">Add 2–3 clips for multicam switching</p>
                )}
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'hsla(36, 30%, 92.2%, 0.06)' }}>
                  <Video className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xs font-semibold text-foreground">Performance</p>
                <p className="text-[10px] text-muted-foreground">On-camera footage</p>
              </>
            )}
          </div>
          <p className="text-[8px] text-muted-foreground mt-1 font-mono tracking-wide">MULTI-CAM · UP TO 5 CLIPS</p>
        </div>

        {/* Zone 3: B-Roll */}
        <div
          onClick={() => brollInputRef.current?.click()}
          {...brollDrag}
          className="rounded-xl border-2 border-dashed p-3 text-center cursor-pointer transition-all select-none"
          style={{
            borderColor: isDraggingBroll
              ? 'hsl(72, 100%, 64%)'
              : 'hsla(36, 30%, 92.2%, 0.1)',
            background: brollFiles.length > 0 ? 'hsla(72, 100%, 64%, 0.04)' : 'transparent',
            minHeight: 100,
          }}
        >
          <input
            ref={brollInputRef}
            type="file"
            accept=".mp4,.mov,video/mp4,video/quicktime"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files || []);
              if (files.length) setBrollFiles(prev => [...prev, ...files]);
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center gap-1.5 h-full justify-center py-1">
            {brollFiles.length > 0 ? (
              <>
                {/* Clip list */}
                <div className="w-full space-y-1 max-h-[80px] overflow-y-auto scrollbar-none" onClick={e => e.stopPropagation()}>
                  {brollFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left" style={{ background: 'hsla(72, 100%, 64%, 0.06)' }}>
                      <Film className="w-3 h-3 shrink-0" style={{ color: 'hsl(72, 100%, 64%)' }} />
                      <span className="text-[10px] text-foreground truncate flex-1">{f.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setBrollFiles(prev => prev.filter((_, idx) => idx !== i)); }}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Add more prompt */}
                <div className="flex items-center gap-1 mt-1">
                  <Plus className="w-3 h-3" style={{ color: 'hsl(72, 100%, 64%)' }} />
                  <span className="text-[10px] font-medium" style={{ color: 'hsl(72, 100%, 64%)' }}>Add more B-roll</span>
                </div>
                {brollFiles.length === 1 && (
                  <p className="text-[9px] text-muted-foreground">Add 2–3 clips for more variety</p>
                )}
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'hsla(36, 30%, 92.2%, 0.06)' }}>
                  <Film className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                  B-Roll
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild onClick={e => e.stopPropagation()}>
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px] text-xs">
                        Cutaway footage — city shots, close-ups, behind the scenes — used between performance cuts
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">Optional cutaway footage</p>
              </>
            )}
          </div>
          <p className="text-[8px] text-muted-foreground mt-1 font-mono tracking-wide">CUTAWAY · UP TO 5 CLIPS</p>
        </div>
      </div>

      {/* CTA */}
      <Button
        className="w-full h-11"
        disabled={!canStart || storing}
        onClick={handleBuildVideo}
      >
        {storing ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing…</>
        ) : canStart ? (
          <>Build My Video <ArrowRight className="w-4 h-4 ml-2" /></>
        ) : (
          'Add a song + at least 1 performance clip'
        )}
      </Button>

      <p className="text-[10px] text-center text-muted-foreground font-mono">
        MP4 · MOV · UP TO 4K · MULTI-CAM SUPPORTED
      </p>
    </div>
  );
}

/* ─── Trial Banner ─── */
function TrialStartBanner({ onStart, loading, canStart }: { onStart: () => void; loading: boolean; canStart: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
      <button onClick={() => setDismissed(true)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </button>
      <h3 className="text-primary font-display text-lg tracking-wider">YOUR FREE TRIAL IS READY!</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Try the full range of features before deciding which plan is right for you.
        After 3 days, you won't be charged unless you choose to upgrade.
      </p>
      <ul className="mt-3 space-y-1.5">
        {["15 free credits, valid for 3 days", "No credit card required", "Full range of features"].map(item => (
          <li key={item} className="flex items-center gap-2 text-sm text-foreground">
            <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
            {item}
          </li>
        ))}
      </ul>
      {canStart ? (
        <Button className="w-full mt-4" onClick={onStart} disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Start clipping
        </Button>
      ) : (
        <Link to="/app/billing">
          <Button className="w-full mt-4">Upgrade to Pro <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </Link>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile, credits, refreshCredits } = useAuth();
  const { totalAvailable, plan, alertLevel } = useCreditSystem();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingTrial, setStartingTrial] = useState(false);
  const [thumbnailMap, setThumbnailMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchProjects = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", user.id)
        .neq("status", "archived")
        .order("last_activity_at", { ascending: false, nullsFirst: false });
      if (cancelled) return;
      if (error) console.error("Failed to fetch projects:", error);
      else setProjects((data as unknown as Project[]) || []);
      setLoading(false);
    };
    fetchProjects();
    return () => { cancelled = true; };
  }, [user]);

  // Batch-fetch thumbnails for all visible projects (fixes N+1 query)
  useEffect(() => {
    if (!projects.length) return;
    let cancelled = false;
    const projectIds = projects.slice(0, 6).map((p) => p.id);
    (async () => {
      const { data: clips } = await supabase
        .from("media_files")
        .select("project_id, preview_image_path, mux_playback_id")
        .in("project_id", projectIds)
        .not("preview_image_path", "is", null);
      if (cancelled || !clips?.length) return;

      // Deduplicate: keep first clip per project
      const byProject = new Map<string, { preview_image_path: string; mux_playback_id?: string }>();
      for (const c of clips) {
        if (!byProject.has(c.project_id)) {
          byProject.set(c.project_id, c as any);
        }
      }

      const map: Record<string, string> = {};
      const needSigning: { projectId: string; path: string }[] = [];

      for (const [pid, clip] of byProject) {
        const muxId = (clip as any).mux_playback_id;
        if (muxId) {
          map[pid] = getMuxThumbnailUrl(muxId, { width: 400, fitMode: "smartcrop" });
        } else if (clip.preview_image_path) {
          needSigning.push({ projectId: pid, path: clip.preview_image_path });
        }
      }

      // Batch-sign remaining Supabase storage paths
      if (needSigning.length) {
        const results = await Promise.all(
          needSigning.map((s) =>
            supabase.storage.from("media").createSignedUrl(s.path, 3600).then((r) => ({
              projectId: s.projectId,
              url: r.data?.signedUrl ?? null,
            }))
          )
        );
        for (const r of results) {
          if (r.url) map[r.projectId] = r.url;
        }
      }

      if (!cancelled) setThumbnailMap(map);
    })();
    return () => { cancelled = true; };
  }, [projects]);

  const isOnTrial = profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();
  const canStartTrial = profile && !profile.trial_used;

  const trialDaysLeft = (() => {
    if (!profile?.trial_ends_at) return 0;
    const diff = new Date(profile.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const handleStartTrial = async () => {
    if (!user) return;
    if (startingTrial) return;
    if (profile?.trial_used) {
      toast.error("You've already used your trial. Upgrade to Pro.");
      return;
    }
    setStartingTrial(true);
    try {
      const trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const { error: profileErr } = await supabase.from("profiles").update({
        trial_ends_at: trialEndsAt,
        trial_used: true,
        plan: "trial",
      }).eq("id", user.id);
      if (profileErr) throw profileErr;
      const { error: creditsErr } = await supabase.from("user_credits").update({
        plan: "trial",
        trial_credits: 15,
        trial_expires_at: trialEndsAt,
      }).eq("user_id", user.id);
      if (creditsErr) console.error("Credits update error:", creditsErr);
      await refreshProfile();
      await refreshCredits();
      toast.success("🎉 Trial started! 15 credits unlocked. Exports include a watermark until you upgrade.");
    } catch (err) {
      console.error("Trial activation error:", err);
      toast.error("Something went wrong starting your trial. Try again.");
    }
    setStartingTrial(false);
  };

  const tools: Tool[] = [
    {
      id: 'music-video',
      icon: <Film className="w-5 h-5" />,
      label: 'Music Video',
      accent: true,
      onClick: () => navigate('/app/projects/new'),
    },
    {
      id: 'long-to-shorts',
      icon: <Scissors className="w-5 h-5" />,
      label: 'Long to Shorts',
      onClick: () => navigate('/app/long-to-shorts'),
    },
    {
      id: 'ai-captions',
      icon: <MessageSquare className="w-5 h-5" />,
      label: 'AI Captions',
      onClick: () => navigate('/app/captions'),
    },
    {
      id: 'ai-reframe',
      icon: <Crop className="w-5 h-5" />,
      label: 'AI Reframe',
      onClick: () => navigate('/app/reframe'),
    },
    {
      id: 'loop-visualizer',
      icon: <CircleDot className="w-5 h-5" />,
      label: 'Loop Viz',
      onClick: () => navigate('/app/loop-visualizer'),
    },
  ];

  const hasProjects = projects.length > 0;
  const usedBytes = profile?.storage_used_bytes ?? 0;

  return (
    <div className="max-w-[680px] mx-auto px-4 space-y-6">
      {/* Trial Active Banner */}
      {isOnTrial && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-mono tracking-widest text-primary uppercase flex-1">
            PRO TRIAL · {trialDaysLeft}D LEFT
          </span>
          <Link to="/app/billing">
            <Button size="sm" variant="outline" className="text-xs h-7">Upgrade</Button>
          </Link>
        </div>
      )}

      {/* Music Video Upload Card */}
      <MusicVideoUploadCard />

      {/* Feature Tool Icons */}
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
        {tools.map(tool => (
          <ToolIcon key={tool.id} tool={tool} />
        ))}
      </div>

      {/* Trial start banner for new users */}
      {!isOnTrial && canStartTrial && (
        <TrialStartBanner onStart={handleStartTrial} loading={startingTrial} canStart={!!canStartTrial} />
      )}

      {/* Projects section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-mono tracking-widest text-muted-foreground uppercase">
            All projects ({projects.length})
          </h2>
          {hasProjects && (
            <Link to="/app/projects" className="text-xs text-primary hover:underline">View all</Link>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : !hasProjects ? (
          <div className="text-center py-12 rounded-xl border border-border bg-card">
            <Film className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No projects yet</p>
            <p className="text-xs text-muted-foreground mt-1">Upload a video to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {projects.slice(0, 6).map((p) => (
              <ProjectCard key={p.id} project={p} thumbnailUrl={thumbnailMap[p.id] ?? null} />
            ))}
          </div>
        )}
      </div>

      {/* Storage meter */}
      <div className="rounded-xl border border-border bg-card p-4">
        <StorageMeter usedBytes={usedBytes} totalBytes={getStorageLimit(profile?.plan)} />
      </div>
    </div>
  );
}
