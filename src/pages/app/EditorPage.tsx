import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle, Undo2, Redo2, Download, ChevronUp, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VideoPreview } from "@/components/editor/VideoPreview";
import { Timeline } from "@/components/editor/Timeline";
import { EditorControlPanel } from "@/components/editor/EditorControlPanel";
import { EditingToolbar, type EditTool } from "@/components/editor/EditingToolbar";
import { MobilePanelSheet, type TabId } from "@/components/editor/MobilePanelSheet";
import { useAutosave } from "@/hooks/useAutosave";
import { useTimelineHistory } from "@/hooks/useTimelineHistory";
import { KeyboardShortcutsDialog } from "@/components/editor/KeyboardShortcutsDialog";

import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import type { EditManifest } from "@/lib/editManifest";
import { convertManifestToTimeline } from "@/lib/manifestInterpreter";

// Lazy-loaded slide-out panels (only loaded when opened)
const ExportPanel = lazy(() => import("@/components/editor/ExportPanel").then(m => ({ default: m.ExportPanel })));
const DirectorChat = lazy(() => import("@/components/editor/DirectorChat").then(m => ({ default: m.DirectorChat })));
const StyleComparisonPanel = lazy(() => import("@/components/editor/StyleComparisonPanel").then(m => ({ default: m.StyleComparisonPanel })));
import { EditorSidebar, type SidebarTool } from "@/components/editor/EditorSidebar";
import { AIDirectorPanel } from "@/components/editor/AIDirectorPanel";
import { EditorTour } from "@/components/editor/EditorTour";
import { supabase } from "@/integrations/supabase/client";
import type { Project, StylePreset, ColorGrade, VideoFormat, TimelineData, TimelineClip, Section, Effect } from "@/types";
import type { LyricWord, CaptionStyle, CaptionSize, CaptionPosition } from "@/lib/lyricsEngine";
import type { FaceCrop } from "@/lib/faceUtils";
import { computeBangerScore } from "@/lib/audioAnalyzer";
import { getMuxThumbnailUrl } from "@/lib/muxThumbnails";
import { ensureFirstClipIsPerformance } from "@/lib/beatSyncEngine";
import type { CameraEntry } from "@/components/editor/VideoPreview";
import { useAuth } from "@/hooks/useAuth";
import { isProAccess } from "@/types";
import { toast } from "sonner";

// Fallback mock data only used when timeline_data has no real clips
const MOCK_BEATS = Array.from({ length: 80 }, (_, i) => i * (60 / 140));
const MOCK_SECTIONS: Section[] = [
  { type: "intro", start: 0, end: 12, energy_avg: 0.3 },
  { type: "verse", start: 12, end: 52, energy_avg: 0.6 },
  { type: "chorus", start: 52, end: 78, energy_avg: 0.9 },
  { type: "verse", start: 78, end: 130, energy_avg: 0.65 },
  { type: "chorus", start: 130, end: 160, energy_avg: 0.95 },
  { type: "outro", start: 160, end: 204, energy_avg: 0.2 },
];
const MOCK_CLIPS: TimelineClip[] = [
  { id: "c1", clip_id: "m1", type: "performance", start: 0, end: 12, source_offset: 0, mute_original_audio: true, beat_aligned: true, placement_reason: "intro", crop: null, effects: [] },
  { id: "c2", clip_id: "m2", type: "performance", start: 12, end: 40, source_offset: 0, mute_original_audio: true, beat_aligned: true, placement_reason: "verse_1", crop: null, effects: [] },
  { id: "c3", clip_id: "m3", type: "broll", start: 40, end: 52, source_offset: 0, mute_original_audio: true, beat_aligned: true, placement_reason: "energy_valley", crop: null, effects: [] },
  { id: "c4", clip_id: "m4", type: "performance", start: 52, end: 78, source_offset: 0, mute_original_audio: true, beat_aligned: true, placement_reason: "chorus_1", crop: null, effects: [] },
  { id: "c5", clip_id: "m5", type: "performance", start: 78, end: 110, source_offset: 0, mute_original_audio: true, beat_aligned: true, placement_reason: "verse_2", crop: null, effects: [] },
  { id: "c6", clip_id: "m6", type: "broll", start: 110, end: 130, source_offset: 0, mute_original_audio: true, beat_aligned: true, placement_reason: "energy_valley_2", crop: null, effects: [] },
  { id: "c7", clip_id: "m7", type: "performance", start: 130, end: 160, source_offset: 0, mute_original_audio: true, beat_aligned: true, placement_reason: "chorus_2", crop: null, effects: [] },
  { id: "c8", clip_id: "m8", type: "broll", start: 160, end: 180, source_offset: 0, mute_original_audio: true, beat_aligned: true, placement_reason: "outro_broll", crop: null, effects: [] },
  { id: "c9", clip_id: "m9", type: "performance", start: 180, end: 204, source_offset: 0, mute_original_audio: true, beat_aligned: true, placement_reason: "outro_perf", crop: null, effects: [] },
];

type LoadState = "loading" | "ready" | "not_ready" | "not_found";

// Clip URL + metadata maps
interface ClipMeta {
  url: string;
  previewImageUrl?: string;
  status: "proxy" | "ready";
  fileName: string;
  isImageOnly?: boolean;
  muxPlaybackId?: string;
  faceKeyframes?: any[];
  xcorrOffset: number;
}
type ClipUrlMap = Record<string, ClipMeta>;

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, isPro } = useAuth();
  const showWatermark = !isPro;
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [project, setProject] = useState<Project | null>(null);

  // Editor state — start paused (no autoplay, requires user gesture for audio)
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stylePreset, setStylePreset] = useState<StylePreset>("raw_cut");
  const [colorGrade, setColorGrade] = useState<ColorGrade>("none");
  const [colorGradeIntensity, setColorGradeIntensity] = useState(0.5);
  const [format, setFormat] = useState<VideoFormat>("9:16");
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  
  const [clipMeta, setClipMeta] = useState<ClipUrlMap>({});
  const [clipUrlsLoading, setClipUrlsLoading] = useState(false);
  const [faceCrops, setFaceCrops] = useState<Record<string, FaceCrop>>({});
  const [songDuration, setSongDuration] = useState<number | null>(null);
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const repairRanRef = useRef(false);
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const faceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  // Editing toolbar state
  const [activeTool, setActiveTool] = useState<EditTool>("select");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<TabId | null>(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [directorChatOpen, setDirectorChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [styleCompOpen, setStyleCompOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [sidebarTool, setSidebarTool] = useState<SidebarTool>(null);
  const [showTour, setShowTour] = useState(false);
  const [currentManifestId, setCurrentManifestId] = useState<string | null>(null);
  const [activeManifest, setActiveManifest] = useState<EditManifest | null>(null);

  // Lyrics caption state
  const [lyricsWords, setLyricsWords] = useState<LyricWord[]>([]);
  const [lyricsVisible, setLyricsVisible] = useState(false);
  const [lyricsStyle, setLyricsStyle] = useState<CaptionStyle>("highlight");
  const [lyricsSize, setLyricsSize] = useState<CaptionSize>("M");
  const [lyricsPosition, setLyricsPosition] = useState<CaptionPosition>("bottom");

  // Undo/Redo history
  const { initHistory, pushHistory, undo, redo, canUndo, canRedo } = useTimelineHistory();
  const historyInitialized = useRef(false);

  // Responsive
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : true);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ── History-aware timeline update ──
  const updateTimelineWithHistory = useCallback((newTimeline: TimelineData) => {
    setTimelineData(newTimeline);
    pushHistory(newTimeline);
  }, [pushHistory]);

  // Undo/Redo actions
  const handleUndo = useCallback(() => {
    const prev = undo();
    if (prev) {
      setTimelineData(prev);
      toast("↩ Undone", {
        duration: 1500,
        style: {
          background: "hsl(0 0% 10.2%)",
          color: "hsl(72 100% 64%)",
          fontFamily: "'Space Mono', monospace",
          fontSize: 13,
        },
      });
    }
  }, [undo]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (next) {
      setTimelineData(next);
      toast("↪ Redone", {
        duration: 1500,
        style: {
          background: "hsl(0 0% 10.2%)",
          color: "hsl(72 100% 64%)",
          fontFamily: "'Space Mono', monospace",
          fontSize: 13,
        },
      });
    }
  }, [redo]);

  // ── Clip Actions ──
  const deleteClip = useCallback((clipId: string) => {
    if (!timelineData) return;
    const newClips = timelineData.timeline.filter(c => c.id !== clipId);
    const newTd = { ...timelineData, timeline: recalcTimings(newClips) };
    updateTimelineWithHistory(newTd);
    setSelectedClipId(null);
  }, [timelineData, updateTimelineWithHistory]);

  const duplicateClip = useCallback((clipId: string) => {
    if (!timelineData) return;
    const idx = timelineData.timeline.findIndex(c => c.id === clipId);
    if (idx < 0) return;
    const original = timelineData.timeline[idx];
    const copy: TimelineClip = {
      ...original,
      id: `${original.id}_dup_${Date.now()}`,
    };
    const newClips = [...timelineData.timeline];
    newClips.splice(idx + 1, 0, copy);
    const newTd = { ...timelineData, timeline: recalcTimings(newClips) };
    updateTimelineWithHistory(newTd);
  }, [timelineData, updateTimelineWithHistory]);

  const splitClipAtPlayhead = useCallback(() => {
    if (!timelineData) return;
    const splitTime = currentTime;
    const clips = timelineData.timeline;
    const targetIndex = clips.findIndex(c => splitTime > c.start && splitTime < c.end);
    if (targetIndex === -1) return;

    const target = clips[targetIndex];
    const firstHalf: TimelineClip = {
      ...target,
      id: `${target.id}-a`,
      end: splitTime,
    };
    const secondHalf: TimelineClip = {
      ...target,
      id: `${target.id}-b`,
      start: splitTime,
      source_offset: target.source_offset + (splitTime - target.start),
    };

    const newClips = [
      ...clips.slice(0, targetIndex),
      firstHalf,
      secondHalf,
      ...clips.slice(targetIndex + 1),
    ];

    const newTd = { ...timelineData, timeline: newClips };
    updateTimelineWithHistory(newTd);
  }, [timelineData, currentTime, updateTimelineWithHistory]);

  // ── Director Chat: apply AI placements to timeline ──
  const handleApplyPlacements = useCallback((placements: { timestamp: number; type: "broll" | "performance"; duration_beats: number; beat_index: number; reason: string; effect: string }[]) => {
    if (!timelineData || !placements.length) return;
    const bpmVal = timelineData.bpm || 140;
    const secondsPerBeat = 60 / bpmVal;
    const newClips: TimelineClip[] = placements.map((p, i) => {
      const duration = p.duration_beats * secondsPerBeat;
      const existingSameType = clips.filter(c => c.type === p.type);
      const referenceClip = existingSameType[i % Math.max(1, existingSameType.length)];
      return {
        id: `ai_${Date.now()}_${i}`,
        clip_id: referenceClip?.clip_id ?? clips[0]?.clip_id ?? "",
        type: p.type,
        start: p.timestamp,
        end: p.timestamp + duration,
        source_offset: referenceClip?.source_offset ?? 0,
        mute_original_audio: true,
        beat_aligned: true,
        placement_reason: p.reason,
        crop: null,
        effects: p.effect && p.effect !== "hard_cut" ? [{ type: p.effect as any }] : [],
      };
    });
    const newTd = { ...timelineData, timeline: newClips };
    updateTimelineWithHistory(newTd);
    setDirectorChatOpen(false);
  }, [timelineData, clips, updateTimelineWithHistory]);

  // ── Director Chat: apply AI manifest to timeline ──
  const handleApplyManifest = useCallback((manifest: EditManifest) => {
    if (!timelineData) return;
    const newClips = convertManifestToTimeline(manifest, clips);
    if (newClips.length === 0) return;
    const newTd = { ...timelineData, timeline: newClips };
    updateTimelineWithHistory(newTd);
    // Track which manifest is active (Phase 4)
    setCurrentManifestId(manifest.metadata?.id ?? null);
    // Phase 6: store full manifest for iterative refinement
    setActiveManifest(manifest);
    setDirectorChatOpen(false);
    setStyleCompOpen(false);

    // Undo hint toast (Phase 8)
    const isMac = navigator.platform.includes("Mac");
    toast(`Edit applied — press ${isMac ? "⌘Z" : "Ctrl+Z"} to undo`, { duration: 4000 });
  }, [timelineData, clips, updateTimelineWithHistory]);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.includes("Mac");
      const ctrl = isMac ? e.metaKey : e.ctrlKey;

      // Undo
      if (ctrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      // Redo
      if ((ctrl && e.key === "y") || (ctrl && e.shiftKey && e.key === "z") || (ctrl && e.shiftKey && e.key === "Z")) {
        e.preventDefault();
        handleRedo();
        return;
      }
      // Play/Pause — toggle and sync audio
      if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        setIsPlaying(prev => {
          const next = !prev;
          const audio = audioRef.current;
          if (audio && songUrl) {
            if (next) audio.play().catch(() => {});
            else audio.pause();
          }
          return next;
        });
        return;
      }
      // Delete selected clip
      if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
        e.preventDefault();
        deleteClip(selectedClipId);
        return;
      }
      // Escape — deselect
      if (e.key === "Escape") {
        setSelectedClipId(null);
        setActiveTool("select");
        return;
      }
      // Split at playhead
      if (e.key === "s" && ctrl) {
        e.preventDefault();
        splitClipAtPlayhead();
        return;
      }
      // Duplicate selected
      if (e.key === "d" && ctrl && selectedClipId) {
        e.preventDefault();
        duplicateClip(selectedClipId);
        return;
      }
      // Tool switches
      if (!ctrl && !e.shiftKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") setActiveTool("select");
        if (e.key === "s" || e.key === "S") setActiveTool("split");
        if (e.key === "t" || e.key === "T") setActiveTool("trim");
      }
      // Keyboard shortcuts help
      if (e.key === "?" && !ctrl) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      // Mute toggle
      if ((e.key === "m" || e.key === "M") && !ctrl && !e.shiftKey && !e.altKey) {
        handleMuteToggle();
        return;
      }
      // Frame stepping: , (back 1 frame) . (forward 1 frame)
      if (e.key === "," && !ctrl && !e.shiftKey) {
        e.preventDefault();
        setCurrentTime(t => Math.max(0, t - 1 / 30));
        return;
      }
      if (e.key === "." && !ctrl && !e.shiftKey) {
        e.preventDefault();
        const dur = songDuration || timelineData?.duration || 204;
        setCurrentTime(t => Math.min(dur, t + 1 / 30));
        return;
      }
      // JKL shuttle: J (back 2s), K (play/pause), L (forward 2s)
      if (e.key === "j" || e.key === "J") {
        if (!ctrl && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          setCurrentTime(t => Math.max(0, t - 2));
          return;
        }
      }
      if (e.key === "k" || e.key === "K") {
        if (!ctrl && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          setIsPlaying(prev => {
            const next = !prev;
            const audio = audioRef.current;
            if (audio && songUrl) {
              if (next) audio.play().catch(() => {});
              else audio.pause();
            }
            return next;
          });
          return;
        }
      }
      if (e.key === "l" || e.key === "L") {
        if (!ctrl && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          const dur = songDuration || timelineData?.duration || 204;
          setCurrentTime(t => Math.min(dur, t + 2));
          return;
        }
      }
      // Arrow keys to nudge playhead
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentTime(t => Math.max(0, t - (e.shiftKey ? 5 : 1)));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const dur = songDuration || timelineData?.duration || 204;
        setCurrentTime(t => Math.min(dur, t + (e.shiftKey ? 5 : 1)));
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedClipId, handleUndo, handleRedo, deleteClip, duplicateClip, splitClipAtPlayhead, songDuration, songUrl, timelineData?.duration, handleMuteToggle]);

  // ── Toolbar action handler ──
  const handleToolbarAction = useCallback((action: "duplicate" | "delete" | "undo" | "redo") => {
    if (action === "undo") handleUndo();
    else if (action === "redo") handleRedo();
    else if (action === "delete" && selectedClipId) deleteClip(selectedClipId);
    else if (action === "duplicate" && selectedClipId) duplicateClip(selectedClipId);
  }, [handleUndo, handleRedo, deleteClip, duplicateClip, selectedClipId]);

  // Fetch project fresh from DB
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        setLoadState("not_found");
        return;
      }

      const p = data as unknown as Project;
      if (p.sync_status !== "ready") {
        setLoadState("not_ready");
        setProject(p);
        return;
      }

      setProject(p);
      setStylePreset(p.style_preset);
      setColorGrade(p.color_grade);
      setColorGradeIntensity(p.color_grade_intensity);
      setFormat(p.format);
      setTrimStart(p.trim_start ?? 0);
      setTrimEnd(p.trim_end ?? null);

      // Load persisted Director Chat history
      const savedChat = (p as any).director_chat_history;
      if (Array.isArray(savedChat) && savedChat.length > 0) {
        setChatHistory(savedChat);
      }

      // Load lyrics data if available
      const lyricsData = (p as any).lyrics_data;
      if (lyricsData?.words?.length) {
        setLyricsWords(lyricsData.words);
        setLyricsVisible(true);
      }

      // Fetch song file for duration + audio URL
      const { data: songFile } = await supabase
        .from("media_files")
        .select("duration_seconds, storage_path, proxy_storage_path")
        .eq("project_id", id)
        .eq("file_type", "song")
        .is("deleted_at", null)
        .maybeSingle();

      const fetchedSongDuration = songFile?.duration_seconds ?? null;
      setSongDuration(fetchedSongDuration);

      // Generate signed URL for song audio playback
      const songPath = songFile?.storage_path || songFile?.proxy_storage_path;
      if (songPath) {
        const { data: songSigned } = await supabase.storage
          .from("media")
          .createSignedUrl(songPath, 7200);
        if (songSigned?.signedUrl) setSongUrl(songSigned.signedUrl);
      }

      // Use real timeline_data from DB if it has clips
      const td = p.timeline_data as any;
      const hasRealTimeline = td?.timeline && td.timeline.length > 0;
      const effectiveDuration = fetchedSongDuration || td?.duration || 204;

      // Clamp clips that extend beyond song duration
      const clampClips = (clips: TimelineClip[]): TimelineClip[] =>
        clips.map(c => ({
          ...c,
          end: Math.min(c.end, effectiveDuration),
          start: Math.min(c.start, effectiveDuration),
        })).filter(c => c.start < c.end);

      const clampSections = (sections: Section[]) =>
        sections
          .map(s => ({ ...s, start: Math.min(s.start, effectiveDuration), end: Math.min(s.end, effectiveDuration) }))
          .filter(s => s.start < s.end);

      const clampBeats = (beats: number[]) => beats.filter(b => b <= effectiveDuration);

      let resolvedTd: TimelineData;
      if (hasRealTimeline) {
        resolvedTd = {
          ...td,
          duration: effectiveDuration,
          beats: clampBeats(td.beats || td.beat_timestamps || MOCK_BEATS),
          sections: clampSections(td.sections || []),
          timeline: ensureFirstClipIsPerformance(clampClips(td.timeline)),
        };
      } else if (!td) {
        resolvedTd = {
          duration: effectiveDuration,
          format: p.format,
          style: p.style_preset,
          bpm: p.bpm || 140,
          beats: MOCK_BEATS,
          sections: MOCK_SECTIONS,
          timeline: clampClips(MOCK_CLIPS),
          effects: [],
        };
      } else {
        resolvedTd = {
          duration: effectiveDuration,
          format: p.format,
          style: p.style_preset,
          bpm: td.bpm || p.bpm || 140,
          beats: td.beats || td.beat_timestamps || MOCK_BEATS,
          sections: td.sections || MOCK_SECTIONS,
          timeline: [],
          effects: td.effects || [],
        };
      }
      setTimelineData(resolvedTd);
      // Initialize history with loaded timeline
      if (!historyInitialized.current) {
        initHistory(resolvedTd);
        historyInitialized.current = true;
      }

      // Load current manifest ID (Phase 4)
      try {
        const { data: currentManifest } = await supabase
          .from("edit_manifests")
          .select("id")
          .eq("project_id", id)
          .eq("is_current", true)
          .maybeSingle();
        if (currentManifest?.id) {
          setCurrentManifestId(currentManifest.id);
        }
      } catch {
        // Non-critical — proceed without manifest tracking
      }

      setLoadState("ready");
    })();
  }, [id]);

  // One-time repair: fix stuck proxy_ready rows where original upload completed but DB wasn't updated
  useEffect(() => {
    if (loadState !== "ready" || !id || !user?.id || repairRanRef.current) return;
    repairRanRef.current = true;

    (async () => {
      const { data: stuckFiles } = await supabase
        .from("media_files")
        .select("id, file_name")
        .eq("project_id", id)
        .eq("status", "proxy_ready")
        .is("deleted_at", null);

      if (!stuckFiles?.length) return;

      const folderPath = `${user.id}/${id}/original`;
      const { data: storageFiles } = await supabase.storage.from("media").list(folderPath);
      if (!storageFiles?.length) return;

      const storageNames = new Set(storageFiles.map(f => f.name));
      let repaired = 0;

      for (const stuck of stuckFiles) {
        if (storageNames.has(stuck.file_name)) {
          await supabase.from("media_files").update({
            status: "ready",
            storage_path: `${folderPath}/${stuck.file_name}`,
          } as any).eq("id", stuck.id);
          repaired++;
        }
      }

      if (repaired > 0) {
        if (import.meta.env.DEV) console.log(`Repaired ${repaired} stuck media_files rows`);
        setClipMeta({});
        setClipUrlsLoading(true);
      }
    })();
  }, [loadState, id, user?.id]);

  // Audio sync — play/pause (requires user gesture)
  const handlePlayToggle = useCallback(() => {
    setIsPlaying(prev => {
      const next = !prev;
      const audio = audioRef.current;
      if (!audio || !songUrl) return next;
      if (next) {
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      } else {
        audio.pause();
      }
      return next;
    });
  }, [songUrl]);

  // Keep audio paused/playing in sync (e.g. when spacebar toggles)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !songUrl) return;
    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, songUrl]);

  // Audio master clock — drives currentTime from audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      if (!isPlaying) return;
      setCurrentTime(audio.currentTime);
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [isPlaying]);

  // Callback ref for audio element
  const audioCallbackRef = useCallback((el: HTMLAudioElement | null) => {
    (audioRef as React.MutableRefObject<HTMLAudioElement | null>).current = el;
    if (!el) return;
    const onMeta = () => {
      const realDur = el.duration;
      if (!realDur || !isFinite(realDur)) return;
      setSongDuration(prev => {
        if (prev) return prev;
        setTimelineData(td => {
          if (!td) return td;

          // Check if duration mismatch is >5s — rebuild timeline proportionally
          const storedDuration = td.duration || 204;
          if (Math.abs(storedDuration - realDur) > 5) {
            const scale = realDur / storedDuration;
            const rebuiltClips = td.timeline
              .map(c => ({
                ...c,
                start: Math.min(c.start * scale, realDur),
                end: Math.min(c.end * scale, realDur),
              }))
              .filter(c => c.start < c.end && c.end - c.start >= 0.1);
            const rebuiltSections = (td.sections || [])
              .map(s => ({
                ...s,
                start: Math.min(s.start * scale, realDur),
                end: Math.min(s.end * scale, realDur),
              }))
              .filter(s => s.start < s.end);
            const rebuiltBeats = (td.beats || [])
              .map((b: number) => b * scale)
              .filter((b: number) => b <= realDur);

            const rebuilt = { ...td, duration: realDur, timeline: rebuiltClips, sections: rebuiltSections, beats: rebuiltBeats };

            // Persist rebuilt timeline
            if (id) {
              supabase.from("projects").update({ timeline_data: rebuilt as any }).eq("id", id).then(() => {});
            }

            toast("Timeline updated to match song length");
            return rebuilt;
          }

          // Minor mismatch — just clamp
          const clamped = td.timeline
            .map(c => ({ ...c, start: Math.min(c.start, realDur), end: Math.min(c.end, realDur) }))
            .filter(c => c.start < c.end);
          const clampedSections = (td.sections || [])
            .map(s => ({ ...s, start: Math.min(s.start, realDur), end: Math.min(s.end, realDur) }))
            .filter(s => s.start < s.end);
          const clampedBeats = (td.beats || []).filter((b: number) => b <= realDur);
          return { ...td, duration: realDur, timeline: clamped, sections: clampedSections, beats: clampedBeats };
        });
        if (id) {
          supabase.from("media_files").update({ duration_seconds: realDur } as any)
            .eq("project_id", id).eq("file_type", "song").is("deleted_at", null).then(() => {});
        }
        return realDur;
      });
    };
    el.addEventListener("loadedmetadata", onMeta);
    if (el.readyState >= 1) onMeta();
  }, [id]);

  // Audio sync — seek (sync audio to wherever the user scrubs)
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    const audio = audioRef.current;
    if (audio && Math.abs(audio.currentTime - time) > 0.1) {
      audio.currentTime = time;
    }
  }, []);

  // Fetch signed URLs for timeline clips — parallelized + staged loading
  useEffect(() => {
    if (loadState !== "ready" || !timelineData?.timeline?.length || !id) return;
    setClipUrlsLoading(true);

    (async () => {
      const { data: mediaFiles, error: mfError } = await supabase
        .from("media_files")
        .select("id, file_name, storage_path, proxy_storage_path, preview_image_path, status, face_crop_x, face_crop_y, face_confidence, mux_playback_id, face_keyframes, suggested_timeline_position, audio_similarity_score")
        .eq("project_id", id)
        .is("deleted_at", null);

      if (mfError || !mediaFiles?.length) {
        console.error("Failed to fetch media files:", mfError);
        setClipUrlsLoading(false);
        return;
      }

      const uniqueClipIds = [...new Set(timelineData.timeline.map(c => c.clip_id))];

      const resolveClipBatch = async (clipIds: string[]) => {
        const results = await Promise.all(
          clipIds.map(async (clipId) => {
            const file = mediaFiles.find(f =>
              f.id === clipId ||
              f.file_name === clipId ||
              f.file_name.replace(/\.[^/.]+$/, "") === clipId
            );
            if (!file) return null;

            // Prefer Mux playback URL if available
            const muxPlaybackId = (file as any).mux_playback_id;
            let videoUrl: string | undefined;
            
            if (muxPlaybackId) {
              // Mux HLS streaming URL
              videoUrl = `https://stream.mux.com/${muxPlaybackId}.m3u8`;
            } else {
              // Fallback to Supabase storage signed URL
              const path = file.storage_path || file.proxy_storage_path;
              if (path) {
                const { data: signed } = await supabase.storage
                  .from("media")
                  .createSignedUrl(path, 7200);
                videoUrl = signed?.signedUrl;
              }
            }

            // Use Mux thumbnail if available, otherwise fall back to signed preview image
            let previewImageUrl: string | undefined;
            if (muxPlaybackId) {
              previewImageUrl = getMuxThumbnailUrl(muxPlaybackId, { width: 400, fitMode: "smartcrop" });
            } else if (file.preview_image_path) {
              previewImageUrl = (await supabase.storage.from("media").createSignedUrl(file.preview_image_path, 7200)).data?.signedUrl ?? undefined;
            }

            const isReady = file.status === "ready";
            const isImageOnly = !videoUrl && !!previewImageUrl;

            const xcorrOffset = (file as any).suggested_timeline_position ?? 0;
            const meta: ClipMeta = {
              url: videoUrl || previewImageUrl || "",
              previewImageUrl,
              status: isReady ? "ready" : "proxy",
              fileName: file.file_name,
              isImageOnly,
              muxPlaybackId,
              faceKeyframes: (file as any).face_keyframes || [],
              xcorrOffset,
            };

            return { clipId, fileId: file.id, meta, file };
          })
        );
        return results.filter(Boolean) as { clipId: string; fileId: string; meta: ClipMeta; file: typeof mediaFiles[0] }[];
      };

      const initialIds = uniqueClipIds.slice(0, 4);
      const remainingIds = uniqueClipIds.slice(4);

      const initialResults = await resolveClipBatch(initialIds);

      const map: ClipUrlMap = {};
      const savedCrops: Record<string, FaceCrop> = {};
      const previewUrlsForDetection: { id: string; url: string }[] = [];

      for (const r of initialResults) {
        map[r.clipId] = r.meta;
        if (r.fileId !== r.clipId) map[r.fileId] = r.meta;

        if (r.file.face_crop_x != null && r.file.face_crop_y != null) {
          savedCrops[r.clipId] = {
            centerX: r.file.face_crop_x,
            centerY: r.file.face_crop_y,
            confidence: r.file.face_confidence ?? 0,
            detected: true,
          };
        } else if (r.meta.previewImageUrl) {
          previewUrlsForDetection.push({ id: r.clipId, url: r.meta.previewImageUrl });
        }
      }

      setClipMeta(map);
      setFaceCrops(savedCrops);
      setClipUrlsLoading(false);

      if (remainingIds.length > 0) {
        batchTimeoutRef.current = setTimeout(async () => {
          const restResults = await resolveClipBatch(remainingIds);
          const restMap: ClipUrlMap = {};
          const restCrops: Record<string, FaceCrop> = {};

          for (const r of restResults) {
            restMap[r.clipId] = r.meta;
            if (r.fileId !== r.clipId) restMap[r.fileId] = r.meta;

            if (r.file.face_crop_x != null && r.file.face_crop_y != null) {
              restCrops[r.clipId] = {
                centerX: r.file.face_crop_x,
                centerY: r.file.face_crop_y,
                confidence: r.file.face_confidence ?? 0,
                detected: true,
              };
            } else if (r.meta.previewImageUrl) {
              previewUrlsForDetection.push({ id: r.clipId, url: r.meta.previewImageUrl });
            }
          }

          setClipMeta(prev => ({ ...prev, ...restMap }));
          setFaceCrops(prev => ({ ...prev, ...restCrops }));
        }, 1500);
      }

      faceTimeoutRef.current = setTimeout(() => {
        if (previewUrlsForDetection.length > 0) {
          import("@/lib/faceDetection").then(async ({ loadFaceModel, detectFaceFromUrl }) => {
            await loadFaceModel();
            for (const { id: cId, url } of previewUrlsForDetection) {
              const crop = await detectFaceFromUrl(url);
              setFaceCrops(prev => ({ ...prev, [cId]: crop }));
              if (crop.detected) {
                const file = mediaFiles.find(f => f.id === cId || f.file_name === cId);
                if (file) {
                  await supabase.from("media_files").update({
                    face_crop_x: crop.centerX,
                    face_crop_y: crop.centerY,
                    face_confidence: crop.confidence,
                  }).eq("id", file.id);
                }
              }
            }
          });
        }
      }, 3000);
    })();

    return () => {
      if (batchTimeoutRef.current) clearTimeout(batchTimeoutRef.current);
      if (faceTimeoutRef.current) clearTimeout(faceTimeoutRef.current);
    };
  }, [loadState, timelineData?.timeline, id]);

  // Ref to avoid stale closure in polling interval
  const clipMetaRef = useRef<ClipUrlMap>({});
  useEffect(() => {
    clipMetaRef.current = clipMeta;
  }, [clipMeta]);

  // Poll for clip upload completion
  useEffect(() => {
    if (loadState !== "ready" || !timelineData?.timeline?.length || !id) return;

    const needsUpgrade = () => Object.values(clipMetaRef.current).some(m => m.isImageOnly || m.status === "proxy");
    if (!needsUpgrade()) return;

    const interval = setInterval(async () => {
      const current = clipMetaRef.current;
      const upgradeIds = Object.entries(current)
        .filter(([, m]) => m.isImageOnly || m.status === "proxy")
        .map(([clipId]) => clipId);

      if (upgradeIds.length === 0) {
        clearInterval(interval);
        return;
      }

      const { data: freshFiles } = await supabase
        .from("media_files")
        .select("id, file_name, storage_path, proxy_storage_path, status, mux_playback_id")
        .eq("project_id", id)
        .is("deleted_at", null);

      if (!freshFiles?.length) return;

      const updates: ClipUrlMap = {};

      for (const clipId of upgradeIds) {
        const file = freshFiles.find(f =>
          f.id === clipId ||
          f.file_name === clipId ||
          f.file_name.replace(/\.[^/.]+$/, "") === clipId
        );
        if (!file) continue;

        const prev = current[clipId];
        const muxPlaybackId = (file as any).mux_playback_id;

        // Upgrade: Mux playback became available
        if (muxPlaybackId && !prev?.muxPlaybackId) {
          const meta: ClipMeta = {
            url: `https://stream.mux.com/${muxPlaybackId}.m3u8`,
            previewImageUrl: prev?.previewImageUrl,
            status: file.status === "ready" ? "ready" : "proxy",
            fileName: file.file_name,
            isImageOnly: false,
            muxPlaybackId,
            xcorrOffset: prev?.xcorrOffset ?? 0,
          };
          updates[clipId] = meta;
          if (file.id !== clipId) updates[file.id] = meta;
          if (import.meta.env.DEV) console.log("Upgraded to Mux stream:", file.file_name);
          continue;
        }

        if (prev?.isImageOnly) {
          const videoPath = file.storage_path || file.proxy_storage_path;
          if (!videoPath) continue;

          const { data: signed } = await supabase.storage
            .from("media")
            .createSignedUrl(videoPath, 7200);

          if (signed?.signedUrl) {
            const meta: ClipMeta = {
              url: signed.signedUrl,
              previewImageUrl: prev?.previewImageUrl,
              status: file.status === "ready" ? "ready" : "proxy",
              fileName: file.file_name,
              isImageOnly: false,
              xcorrOffset: prev?.xcorrOffset ?? 0,
            };
            updates[clipId] = meta;
            if (file.id !== clipId) updates[file.id] = meta;
            if (import.meta.env.DEV) console.log("Upgraded to video:", file.file_name);
          }
        }
        else if (prev?.status === "proxy" && file.status === "ready" && file.storage_path) {
          const { data: signed } = await supabase.storage
            .from("media")
            .createSignedUrl(file.storage_path, 7200);

          if (signed?.signedUrl) {
            const meta: ClipMeta = {
              url: signed.signedUrl,
              previewImageUrl: prev?.previewImageUrl,
              status: "ready",
              fileName: file.file_name,
              isImageOnly: false,
              xcorrOffset: prev?.xcorrOffset ?? 0,
            };
            updates[clipId] = meta;
            if (file.id !== clipId) updates[file.id] = meta;
            if (import.meta.env.DEV) console.log("Upgraded proxy to original:", file.file_name);
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        setClipMeta(prev => ({ ...prev, ...updates }));
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [loadState, id, timelineData?.timeline]);

  const duration = songDuration || timelineData?.duration || 204;

  // Frame step callbacks for TransportControls buttons
  const handleFrameBack = useCallback(() => {
    setCurrentTime(t => Math.max(0, t - 1 / 30));
  }, []);
  const handleFrameForward = useCallback(() => {
    setCurrentTime(t => Math.min(duration, t + 1 / 30));
  }, [duration]);

  // Volume controls
  const handleMuteToggle = useCallback(() => setMuted(prev => !prev), []);
  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    if (v > 0 && muted) setMuted(false);
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  // Persist Director Chat messages to DB
  const handleChatHistoryChange = useCallback((msgs: any[]) => {
    setChatHistory(msgs);
    if (id) {
      // Strip manifest/placements to keep JSONB small — only persist role + content
      const slim = msgs.map((m: any) => ({ role: m.role, content: m.content }));
      supabase
        .from("projects")
        .update({ director_chat_history: slim } as any)
        .eq("id", id)
        .then(({ error }) => { if (error) console.error("Chat persist error:", error); });
    }
  }, [id]);

  const beats = timelineData?.beats ?? MOCK_BEATS;
  const sections = timelineData?.sections ?? MOCK_SECTIONS;
  const clips = timelineData?.timeline ?? MOCK_CLIPS;

  // Determine the current clip at the playhead
  const currentClipIndex = useMemo(() => {
    if (!clips.length) return -1;
    const idx = clips.findIndex(c => currentTime >= c.start && currentTime < c.end);
    return idx >= 0 ? idx : 0;
  }, [clips, currentTime]);

  const currentClip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;

  // ── Phase 6: compute active effects at playhead from current clip ──
  const activeEffects = useMemo(() => {
    if (!currentClip?.effects?.length) return [];
    return currentClip.effects.filter((e) => {
      const effectStart = e.at_seconds;
      const effectEnd = effectStart + (e.duration_seconds ?? currentClip.end - currentClip.start);
      return currentTime >= effectStart && currentTime < effectEnd;
    });
  }, [currentClip, currentTime]);

  // Detect transition at clip boundary (last 300ms of clip or first 300ms of next)
  const activeTransition = useMemo(() => {
    if (!currentClip || !clips.length) return null;
    // Check for transition effects (slow_dissolve, whip_transition, hard_cut) near clip end
    const transEffect = currentClip.effects.find(
      (e) => e.type === "slow_dissolve" || e.type === "whip_transition" || e.type === "hard_cut"
    );
    if (!transEffect) return null;
    const transitionDuration = transEffect.duration_seconds ?? 0.3;
    const transStart = currentClip.end - transitionDuration;
    if (currentTime < transStart || currentTime > currentClip.end) return null;
    const progress = (currentTime - transStart) / transitionDuration;
    const typeMap: Record<string, "fade" | "dissolve" | "flash" | "wipe"> = {
      slow_dissolve: "dissolve",
      whip_transition: "wipe",
      hard_cut: "flash",
    };
    return { type: typeMap[transEffect.type] ?? ("fade" as const), progress };
  }, [currentClip, currentTime, clips]);

  // Prefer manifest face keyframes over DB keyframes when available
  const activeFaceKeyframes = useMemo(() => {
    if (currentClip?.crop?.keyframes?.length) {
      // Map CropSettings keyframes to FaceKeyframe format
      return currentClip.crop.keyframes.map((kf) => ({
        t: kf.t,
        x: kf.x,
        y: kf.y,
        confidence: kf.confidence,
        trackingSource: "face" as const,
      }));
    }
    return undefined; // fall back to activeClipMeta?.faceKeyframes
  }, [currentClip]);

  // ── Multicam camera registry ──
  // Build a map of ALL unique performance cameras with their xcorrOffset.
  // xcorrOffset = seconds into the clip where the song audio begins (from xcorr analysis)
  const cameraRegistry = useMemo<Record<string, CameraEntry>>(() => {
    const registry: Record<string, CameraEntry> = {};
    for (const clip of clips) {
      if (clip.type !== 'performance') continue;
      if (registry[clip.clip_id]) continue; // already registered
      const meta = clipMeta[clip.clip_id];
      if (!meta?.url) continue;
      registry[clip.clip_id] = {
        url: meta.url,
        xcorrOffset: meta.xcorrOffset ?? 0,
        fileName: meta.fileName,
      };
    }
    return registry;
  }, [clips, clipMeta]);

  // Which camera is currently visible
  const activeCameraId = currentClip?.type === 'performance' ? currentClip.clip_id : null;

  // B-roll: still uses single-clip approach
  const activeClipMeta = currentClip ? clipMeta[currentClip.clip_id] : undefined;
  const brollUrl = currentClip?.type === 'broll' ? (activeClipMeta?.url ?? null) : null;
  const brollSourceOffset = currentClip?.type === 'broll' ? (currentClip.source_offset ?? 0) : 0;
  const brollClipStart = currentClip?.type === 'broll' ? (currentClip.start ?? 0) : 0;

  const activeClipIsImageOnly = activeClipMeta?.isImageOnly ?? false;
  const activeClipStatus: "loading" | "proxy" | "ready" | "unavailable" = clipUrlsLoading
    ? "loading"
    : activeClipMeta?.url
      ? activeClipMeta.status
      : currentClip
        ? "unavailable"
        : "loading";

  // Build current timeline data for autosave
  const currentTimeline: TimelineData | null = timelineData
    ? { ...timelineData, format, style: stylePreset }
    : null;

  useAutosave(id, currentTimeline);

  // Save project-level fields on change
  const lastSavedRef = useRef<string>("");
  const saveKey = JSON.stringify({ stylePreset, colorGrade, colorGradeIntensity, format, trimStart, trimEnd });

  const saveProjectFields = useCallback(async () => {
    if (!id) return;
    await supabase.from("projects").update({
      style_preset: stylePreset,
      color_grade: colorGrade,
      color_grade_intensity: colorGradeIntensity,
      format,
      trim_start: trimStart,
      trim_end: trimEnd,
    }).eq("id", id);
  }, [id, stylePreset, colorGrade, colorGradeIntensity, format, trimStart, trimEnd]);

  useEffect(() => {
    if (loadState !== "ready") return;
    if (saveKey === lastSavedRef.current) return;
    const timer = setTimeout(() => {
      saveProjectFields();
      lastSavedRef.current = saveKey;
    }, 2000);
    return () => clearTimeout(timer);
  }, [saveKey, saveProjectFields, loadState]);

  const clipNamesMap = useMemo(() =>
    Object.fromEntries(Object.entries(clipMeta).map(([cId, m]) => [cId, m.fileName])),
    [clipMeta]
  );
  const clipThumbsMap = useMemo(() =>
    Object.fromEntries(
      Object.entries(clipMeta)
        .filter(([, m]) => m.previewImageUrl || m.muxPlaybackId)
        .map(([cId, m]) => [cId, m.previewImageUrl || ""])
    ),
    [clipMeta]
  );

  // Extract energy curve from analysis_data if available
  const energyCurve = useMemo(() => {
    const ad = project?.analysis_data as any;
    return ad?.energy_curve ?? [];
  }, [project?.analysis_data]);

  // Compute Banger Score for ExportPanel
  const bangerResult = useMemo(() => {
    if (!energyCurve.length || !duration) return null;
    return computeBangerScore(energyCurve, sections, timelineData?.bpm || project?.bpm || 140, duration);
  }, [energyCurve, sections, timelineData?.bpm, project?.bpm, duration]);

  const controlPanelProps = {
    syncStatus: project?.sync_status ?? "pending",
    clips,
    sections,
    bpm: timelineData?.bpm || project?.bpm || 140,
    cameraRegistry,
    clipNames: clipNamesMap,
    clipThumbnails: clipThumbsMap,
    colorGrade,
    colorGradeIntensity,
    onColorGradeChange: setColorGrade,
    onColorIntensityChange: setColorGradeIntensity,
    format,
    onFormatChange: setFormat,
    onSeek: handleSeek,
    onExportHighlight: () => setExportPanelOpen(true),
    isPro,
    energyCurve,
    duration,
    // Lyrics props
    hasLyrics: lyricsWords.length > 0,
    lyricsVisible,
    lyricsStyle,
    lyricsSize,
    lyricsPosition,
    onLyricsVisibleChange: setLyricsVisible,
    onLyricsStyleChange: setLyricsStyle,
    onLyricsSizeChange: setLyricsSize,
    onLyricsPositionChange: setLyricsPosition,
  };

  if (loadState === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (loadState === "not_found") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="surface-card shadow-card p-8 text-center space-y-4 max-w-md">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Project not found</h2>
          <Button variant="outline" onClick={() => navigate("/app/projects")}>Back to Projects</Button>
        </div>
      </div>
    );
  }

  if (loadState === "not_ready") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="surface-card shadow-card p-8 text-center space-y-4 max-w-md">
          <AlertTriangle className="w-10 h-10 text-warning mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Project isn't ready for editing</h2>
          <p className="text-sm text-muted-foreground">Sync your clips to the beat first.</p>
          <Button variant="outline" onClick={() => navigate(`/app/projects/${id}`)}>Back to Project</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {songUrl && <audio ref={audioCallbackRef} src={songUrl} preload="auto" />}

      {/* ── HEADER BAR ── */}
      <header
        className="h-12 shrink-0 flex items-center px-3 md:px-4 gap-2 md:gap-3 border-b border-border sticky top-0 z-50"
        style={{ background: "hsla(0,0%,3.1%,0.95)" }}
      >
        <Link to={`/app/projects/${id}`} className="text-muted-foreground hover:text-foreground transition-default shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-foreground truncate">
            {project?.song_title ?? "Untitled"} — {project?.artist_name ?? ""}
          </h1>
        </div>

        {/* BPM pill */}
        <span
          className="text-[10px] font-mono px-2.5 py-1 rounded-full shrink-0"
          style={{ color: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.1)" }}
        >
          {timelineData?.bpm || project?.bpm || "?"} BPM
        </span>

        {/* Autosave — desktop */}
        <span className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-success shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          Autosaved
        </span>

        {/* Format toggle — desktop */}
        <div className="hidden md:flex items-center rounded-lg overflow-hidden border border-border shrink-0">
          {(["9:16", "16:9", "both"] as VideoFormat[]).map(f => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-mono uppercase transition-all",
                format === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "both" ? "BOTH" : f}
            </button>
          ))}
        </div>

        {/* Director Chat — desktop only */}
        <Button
          size="sm"
          variant="outline"
          className="hidden md:flex h-9 px-3 gap-2 shrink-0"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, fontSize: 14 }}
          onClick={() => setDirectorChatOpen(true)}
          data-tour="director-chat"
        >
          <Sparkles className="w-4 h-4" />
          DIRECTOR
        </Button>

        {/* Style Comparison — desktop only, pro feature */}
        <Button
          size="sm"
          variant="outline"
          className="hidden md:flex h-9 px-3 gap-2 shrink-0"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, fontSize: 14 }}
          onClick={() => setStyleCompOpen(true)}
        >
          <Sparkles className="w-4 h-4" />
          STYLES
        </Button>

        {/* Export */}
        <Button
          size="sm"
          className="h-9 px-4 gap-2 shrink-0"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, fontSize: 14 }}
          onClick={() => setExportPanelOpen(true)}
          data-tour="export"
        >
          <Download className="w-4 h-4" />
          EXPORT
        </Button>
      </header>

      {/* ── TOOLBAR ── */}
      <div className="shrink-0">
        <EditingToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onAction={handleToolbarAction}
          canUndo={canUndo}
          canRedo={canRedo}
          hasSelection={!!selectedClipId}
          isMobile={isMobile}
        />
      </div>

      {/* ── MAIN AREA: Video + Control Panel ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* VIDEO PREVIEW */}
        <div
          className="flex-1 min-h-[200px] p-2 md:p-4 pb-0 md:pb-2"
          style={isMobile ? { flex: "1 1 0%", minHeight: 200 } : undefined}
        >
          <VideoPreview
            colorGrade={colorGrade}
            colorGradeIntensity={colorGradeIntensity}
            currentTime={currentTime}
            duration={duration}
            format={format}
            isPlaying={isPlaying}
            onPlayToggle={handlePlayToggle}
            onSeek={handleSeek}
            cameraRegistry={cameraRegistry}
            activeCameraId={activeCameraId}
            brollUrl={brollUrl}
            brollSourceOffset={brollSourceOffset}
            brollClipStart={brollClipStart}
            clipStatus={activeClipStatus}
            isImageOnly={activeClipIsImageOnly}
            faceCrop={currentClip ? faceCrops[currentClip.clip_id] : undefined}
            faceKeyframes={activeFaceKeyframes ?? activeClipMeta?.faceKeyframes}
            currentClipId={currentClip?.id}
            clipStart={currentClip?.start ?? 0}
            clipEnd={currentClip?.end ?? 0}
            sourceOffset={currentClip?.source_offset ?? 0}
            showWatermark={showWatermark}
            activeEffects={activeEffects}
            activeTransition={activeTransition}
            lyricsWords={lyricsWords}
            lyricsVisible={lyricsVisible}
            lyricsStyle={lyricsStyle}
            lyricsSize={lyricsSize}
            lyricsPosition={lyricsPosition}
            onFrameBack={handleFrameBack}
            onFrameForward={handleFrameForward}
            volume={volume}
            onVolumeChange={handleVolumeChange}
            muted={muted}
            onMuteToggle={handleMuteToggle}
          />
        </div>

        {/* CONTROL PANEL — desktop */}
        <div
          className="hidden md:flex md:w-[340px] xl:w-[380px] flex-col border-l border-border shrink-0 overflow-hidden"
          style={{ background: "hsl(0 0% 6.7%)" }}
        >
          {sidebarTool === "ai_director" ? (
            <div className="p-4 overflow-y-auto flex-1">
              <AIDirectorPanel />
            </div>
          ) : (
            <EditorControlPanel {...controlPanelProps} />
          )}
        </div>

        {/* EDITOR SIDEBAR — right icon strip */}
        <EditorSidebar activeTool={sidebarTool} onToolChange={setSidebarTool} />
      </div>

      {/* ── COLLAPSIBLE TIMELINE ── */}
      <div
        className="shrink-0 border-t border-border"
        data-tour="timeline"
        style={isMobile && !timelineExpanded ? { paddingBottom: 52 } : isMobile ? { paddingBottom: 60 } : undefined}
      >
        {timelineExpanded ? (
          <div>
            <div className="flex items-center justify-between px-4 py-1.5">
              <span className="text-label">TIMELINE</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground">{clips.length} clips</span>
                <button
                  onClick={() => setTimelineExpanded(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="px-2 md:px-4 pb-2">
              <Timeline
                duration={duration}
                beats={beats}
                sections={sections}
                clips={clips}
                clipNames={clipNamesMap}
                clipThumbnails={clipThumbsMap}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onSeek={handleSeek}
                onPlayPause={setIsPlaying}
                activeTool={activeTool}
                selectedClipId={selectedClipId}
                onSelectClip={setSelectedClipId}
                onClipsChange={(newClips) => {
                  const newTd = timelineData ? { ...timelineData, timeline: newClips } : null;
                  if (newTd) updateTimelineWithHistory(newTd);
                }}
                onSplitAtPlayhead={splitClipAtPlayhead}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => setTimelineExpanded(true)}
            className="w-full h-12 flex items-center justify-between px-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="text-label">TIMELINE</span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono">{clips.length} clips</span>
              <ChevronUp className="w-4 h-4" />
            </div>
          </button>
        )}
      </div>

      {/* ── MOBILE BOTTOM SHEET + TAB BAR ── */}
      {isMobile && (
        <MobilePanelSheet activeTab={mobileTab} onTabChange={setMobileTab}>
          <EditorControlPanel {...controlPanelProps} activeTab={mobileTab} />
        </MobilePanelSheet>
      )}

      {/* Director Chat (lazy) */}
      {directorChatOpen && (
        <Suspense fallback={null}>
          <DirectorChat
            open={directorChatOpen}
            onClose={() => setDirectorChatOpen(false)}
            projectId={id!}
            bpm={timelineData?.bpm || project?.bpm || 140}
            songDuration={duration}
            stylePreset={stylePreset}
            sections={sections}
            clips={clips}
            beats={beats}
            onApplyPlacements={handleApplyPlacements}
            onApplyManifest={handleApplyManifest}
            activeManifest={activeManifest}
            initialMessages={chatHistory.length > 0 ? chatHistory : undefined}
            onMessagesChange={handleChatHistoryChange}
          />
        </Suspense>
      )}

      {/* Style Comparison (lazy) */}
      {styleCompOpen && (
        <Suspense fallback={null}>
          <StyleComparisonPanel
            open={styleCompOpen}
            onClose={() => setStyleCompOpen(false)}
            projectId={id!}
            bpm={timelineData?.bpm || project?.bpm || 140}
            songDuration={duration}
            sections={sections}
            clips={clips}
            beats={beats}
            onApplyManifest={handleApplyManifest}
            clipMeta={clipMeta}
          />
        </Suspense>
      )}

      {/* Export Panel (lazy) */}
      {exportPanelOpen && (
        <Suspense fallback={null}>
          <ExportPanel
            open={exportPanelOpen}
            onClose={() => setExportPanelOpen(false)}
            projectId={id!}
            songTitle={project?.song_title}
            artistName={project?.artist_name}
            sections={sections}
            bpm={timelineData?.bpm || project?.bpm || 140}
            isPro={isPro}
            bangerStart={bangerResult?.startTime}
            bangerEnd={bangerResult?.endTime}
            hasLyrics={lyricsWords.length > 0}
            manifestId={currentManifestId ?? undefined}
          />
        </Suspense>
      )}

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Editor Tour — guided onboarding */}
      <EditorTour
        open={showTour}
        onComplete={async () => {
          setShowTour(false);
          if (user) {
            await supabase.from("profiles").update({ has_seen_editor_tour: true }).eq("id", user.id);
          }
        }}
      />
    </div>
  );
}

// ── Helpers ──
function recalcTimings(clips: TimelineClip[]): TimelineClip[] {
  if (clips.length === 0) return [];
  // Sort by start time, then close gaps sequentially
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  let cursor = sorted[0].start;
  return sorted.map(c => {
    const dur = c.end - c.start;
    const updated = { ...c, start: cursor, end: cursor + dur };
    cursor += dur;
    return updated;
  });
}
