import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TimelineClip, Section } from "@/types";
import { Minus, Plus, Crosshair, Trash2, Copy } from "lucide-react";
import type { EditTool } from "@/components/editor/EditingToolbar";

import { ClipBlock, DropLine } from "./timeline/ClipBlock";
import {
  BASE_PPS, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP,
  LONG_PRESS_MS, LONG_PRESS_MOVE_THRESHOLD, MIN_CLIP_DURATION,
  PLAYHEAD_OFFSET_PCT, SCRUB_THRESHOLD_PX,
  SECTION_PILL_COLORS, formatTimeBadge, recalcTimings, recalcTimingsForType,
} from "./timeline/utils";

interface TimelineProps {
  duration: number;
  beats: number[];
  sections: Section[];
  clips: TimelineClip[];
  clipNames?: Record<string, string>;
  clipThumbnails?: Record<string, string>;
  currentTime: number;
  isPlaying?: boolean;
  onSeek: (time: number) => void;
  onPlayPause?: (playing: boolean) => void;
  onClipsChange?: (clips: TimelineClip[]) => void;
  activeTool?: EditTool;
  selectedClipId?: string | null;
  onSelectClip?: (id: string | null) => void;
  onSplitAtPlayhead?: () => void;
}

export function Timeline({
  duration,
  beats,
  sections,
  clips,
  clipNames,
  clipThumbnails,
  currentTime,
  isPlaying = false,
  onSeek,
  onPlayPause,
  onClipsChange,
  activeTool = "select",
  selectedClipId: externalSelectedClipId,
  onSelectClip,
  onSplitAtPlayhead,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [internalSelectedClipId, setInternalSelectedClipId] = useState<string | null>(null);
  const selectedClipId = externalSelectedClipId !== undefined ? externalSelectedClipId : internalSelectedClipId;
  const setSelectedClipId = onSelectClip || setInternalSelectedClipId;
  const [showBottomSheet, setShowBottomSheet] = useState(false);

  // Drag state
  const [dragClipId, setDragClipId] = useState<string | null>(null);
  const [dragGhostX, setDragGhostX] = useState(0);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  // Trim state
  const [trimClipId, setTrimClipId] = useState<string | null>(null);
  const [trimSide, setTrimSide] = useState<"left" | "right" | null>(null);
  const [trimDelta, setTrimDelta] = useState(0);
  const trimStartX = useRef(0);
  const isTrimming = useRef(false);

  // Scrub state
  const isScrubbing = useRef(false);
  const scrubStartX = useRef(0);
  const scrubStartTime = useRef(0);
  const scrubStartTs = useRef(0);
  const [showTimeBadge, setShowTimeBadge] = useState(false);
  const wasPlayingBeforeScrub = useRef(false);

  // Playhead drag state
  const isPlayheadDragging = useRef(false);

  // Auto-scroll state
  const rafRef = useRef<number | null>(null);
  const userScrolledDuringPlayback = useRef(false);

  // Pinch state
  const lastPinchDist = useRef<number | null>(null);

  // Responsive
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : true);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const pps = BASE_PPS * zoom;
  const totalWidth = duration * pps;

  const perfClips = useMemo(() => clips.filter(c => c.type === "performance"), [clips]);
  const brollClips = useMemo(() => clips.filter(c => c.type === "broll"), [clips]);

  // ── Fixed Playhead Scroll Sync (non-playing) ──
  useEffect(() => {
    if (isPlaying || isScrubbing.current || isPlayheadDragging.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const viewWidth = el.clientWidth;
    const playheadPx = currentTime * pps;
    const targetScroll = playheadPx - viewWidth * PLAYHEAD_OFFSET_PCT;
    el.scrollLeft = Math.max(0, targetScroll);
  }, [currentTime, pps, isPlaying]);

  // ── Auto-scroll during playback (rAF) ──
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      userScrolledDuringPlayback.current = false;
      return;
    }
    userScrolledDuringPlayback.current = false;

    const scroll = () => {
      if (userScrolledDuringPlayback.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const viewWidth = el.clientWidth;
      const playheadPx = currentTime * pps;
      const targetScroll = playheadPx - viewWidth * PLAYHEAD_OFFSET_PCT;
      el.scrollLeft = Math.max(0, targetScroll);
      rafRef.current = requestAnimationFrame(scroll);
    };
    rafRef.current = requestAnimationFrame(scroll);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, currentTime, pps]);

  // Detect manual scroll during playback
  const handleScroll = useCallback(() => {
    if (isPlaying && !isScrubbing.current && !isPlayheadDragging.current) {
      userScrolledDuringPlayback.current = true;
    }
  }, [isPlaying]);

  // Snap to playhead
  const snapToPlayhead = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const viewWidth = el.clientWidth;
    const playheadPx = currentTime * pps;
    el.scrollTo({ left: Math.max(0, playheadPx - viewWidth * PLAYHEAD_OFFSET_PCT), behavior: "smooth" });
    userScrolledDuringPlayback.current = false;
  }, [currentTime, pps]);

  // ── Zoom Controls ──
  const changeZoom = useCallback((delta: number) => {
    setZoom(z => {
      const next = Math.round((z + delta) * 10) / 10;
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    });
  }, []);

  // ── Mouse wheel: horizontal scroll + ctrl=zoom ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.5 : 0.5;
        changeZoom(delta);
      } else {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [changeZoom]);

  // Pinch to zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.hypot(dx, dy);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const delta = (dist - lastPinchDist.current) / 100;
      changeZoom(delta);
      lastPinchDist.current = dist;
      e.preventDefault();
    }
  }, [changeZoom]);

  const handleTouchEnd = useCallback(() => {
    lastPinchDist.current = null;
  }, []);

  // ── Helper: x position to time ──
  const xToTime = useCallback((clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, Math.min(duration, x / pps));
  }, [pps, duration]);

  // ── Scrub / Tap-to-seek on timeline background ──
  const handleBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (isDragging.current || isTrimming.current) return;
    scrubStartX.current = e.clientX;
    scrubStartTime.current = Date.now();
    scrubStartTs.current = xToTime(e.clientX);
    isScrubbing.current = false;

    const time = xToTime(e.clientX);
    onSeek(time);

    if (isPlaying) {
      wasPlayingBeforeScrub.current = true;
      onPlayPause?.(false);
    } else {
      wasPlayingBeforeScrub.current = false;
    }

    const onMove = (me: MouseEvent) => {
      const dx = Math.abs(me.clientX - scrubStartX.current);
      if (dx > SCRUB_THRESHOLD_PX) {
        isScrubbing.current = true;
        setShowTimeBadge(true);
      }
      if (isScrubbing.current) {
        const t = xToTime(me.clientX);
        onSeek(t);
      }
    };

    const onUp = () => {
      if (isScrubbing.current && wasPlayingBeforeScrub.current) {
        onPlayPause?.(true);
      }
      isScrubbing.current = false;
      setShowTimeBadge(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [xToTime, onSeek, isPlaying, onPlayPause]);

  const handleBgTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      handleTouchStart(e);
      return;
    }
    if (isDragging.current || isTrimming.current) return;
    const touch = e.touches[0];
    scrubStartX.current = touch.clientX;
    scrubStartTime.current = Date.now();

    const time = xToTime(touch.clientX);
    onSeek(time);

    if (isPlaying) {
      wasPlayingBeforeScrub.current = true;
      onPlayPause?.(false);
    } else {
      wasPlayingBeforeScrub.current = false;
    }
  }, [xToTime, onSeek, isPlaying, onPlayPause, handleTouchStart]);

  const handleBgTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      handleTouchMove(e);
      return;
    }
    if (isDragging.current || isTrimming.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - scrubStartX.current);
    if (dx > SCRUB_THRESHOLD_PX) {
      isScrubbing.current = true;
      setShowTimeBadge(true);
    }
    if (isScrubbing.current) {
      const t = xToTime(touch.clientX);
      onSeek(t);
      e.preventDefault();
    }
  }, [xToTime, onSeek, handleTouchMove]);

  const handleBgTouchEnd = useCallback(() => {
    handleTouchEnd();
    if (isScrubbing.current && wasPlayingBeforeScrub.current) {
      onPlayPause?.(true);
    }
    isScrubbing.current = false;
    setShowTimeBadge(false);
  }, [handleTouchEnd, onPlayPause]);

  // ── Playhead drag ──
  const handlePlayheadDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isPlayheadDragging.current = true;
    setShowTimeBadge(true);
    if (isPlaying) {
      wasPlayingBeforeScrub.current = true;
      onPlayPause?.(false);
    } else {
      wasPlayingBeforeScrub.current = false;
    }

    const getX = (ev: MouseEvent | TouchEvent) =>
      "touches" in ev ? ev.touches[0].clientX : ev.clientX;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!isPlayheadDragging.current) return;
      const t = xToTime(getX(ev));
      onSeek(t);
    };
    const onUp = () => {
      isPlayheadDragging.current = false;
      setShowTimeBadge(false);
      if (wasPlayingBeforeScrub.current) onPlayPause?.(true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  }, [xToTime, onSeek, isPlaying, onPlayPause]);

  // ── Clip Selection ──
  const handleClipTap = useCallback((e: React.MouseEvent | React.TouchEvent, clipId: string) => {
    if (isDragging.current || isTrimming.current || isScrubbing.current) return;
    e.stopPropagation();
    if (activeTool === "split" && onSplitAtPlayhead) {
      onSplitAtPlayhead();
      return;
    }
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
      setShowBottomSheet(false);
    } else {
      setSelectedClipId(clipId);
      setShowBottomSheet(isMobile);
    }
  }, [selectedClipId, isMobile, activeTool, onSplitAtPlayhead]);

  const handleOutsideTap = useCallback(() => {
    if (!isDragging.current && !isTrimming.current && !isScrubbing.current) {
      setSelectedClipId(null);
      setShowBottomSheet(false);
    }
  }, []);

  // ── Delete & Duplicate ──
  const deleteClip = useCallback(() => {
    if (!selectedClipId || !onClipsChange) return;
    const newClips = clips.filter(c => c.id !== selectedClipId);
    onClipsChange(recalcTimings(newClips));
    setSelectedClipId(null);
    setShowBottomSheet(false);
  }, [selectedClipId, clips, onClipsChange]);

  const duplicateClip = useCallback(() => {
    if (!selectedClipId || !onClipsChange) return;
    const idx = clips.findIndex(c => c.id === selectedClipId);
    if (idx < 0) return;
    const original = clips[idx];
    const copy: TimelineClip = {
      ...original,
      id: `${original.id}_dup_${Date.now()}`,
    };
    const newClips = [...clips];
    newClips.splice(idx + 1, 0, copy);
    onClipsChange(recalcTimings(newClips));
    setSelectedClipId(null);
    setShowBottomSheet(false);
  }, [selectedClipId, clips, onClipsChange]);

  // Keyboard shortcuts (desktop)
  useEffect(() => {
    if (isMobile) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClipId && onClipsChange) {
          e.preventDefault();
          deleteClip();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isMobile, selectedClipId, deleteClip, onClipsChange]);

  // ── Drag-to-Reorder ──
  const startDrag = useCallback((clipId: string, clientX: number) => {
    isDragging.current = true;
    setDragClipId(clipId);
    setDragGhostX(clientX);
    try { navigator.vibrate?.(40); } catch {}
  }, []);

  const onDragMove = useCallback((clientX: number) => {
    if (!isDragging.current || !dragClipId) return;
    setDragGhostX(clientX);
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    const time = x / pps;
    const draggedClip = clips.find(c => c.id === dragClipId);
    if (!draggedClip) return;
    const sameType = clips.filter(c => c.type === draggedClip.type);
    let idx = sameType.findIndex(c => time < (c.start + c.end) / 2);
    if (idx < 0) idx = sameType.length;
    setDropIndex(idx);
  }, [dragClipId, clips, pps]);

  const endDrag = useCallback(() => {
    if (!isDragging.current || !dragClipId || dropIndex === null || !onClipsChange) {
      isDragging.current = false;
      setDragClipId(null);
      setDropIndex(null);
      return;
    }
    const draggedClip = clips.find(c => c.id === dragClipId);
    if (!draggedClip) {
      isDragging.current = false;
      setDragClipId(null);
      setDropIndex(null);
      return;
    }

    const sameType = clips.filter(c => c.type === draggedClip.type);
    const otherType = clips.filter(c => c.type !== draggedClip.type);
    const without = sameType.filter(c => c.id !== dragClipId);
    const clamped = Math.max(0, Math.min(dropIndex, without.length));
    without.splice(clamped, 0, draggedClip);

    const retimedSame = recalcTimingsForType(without);
    const merged = [...retimedSame, ...otherType].sort((a, b) => a.start - b.start);
    onClipsChange(merged);

    isDragging.current = false;
    setDragClipId(null);
    setDropIndex(null);
  }, [dragClipId, dropIndex, clips, onClipsChange]);

  // Touch handlers for long-press drag (mobile)
  const handleClipTouchStart = useCallback((e: React.TouchEvent, clipId: string) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimer.current = setTimeout(() => {
      startDrag(clipId, touch.clientX);
    }, LONG_PRESS_MS);
  }, [startDrag]);

  const handleClipTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (longPressTimer.current && touchStartPos.current) {
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
    if (isDragging.current) {
      onDragMove(touch.clientX);
      e.preventDefault();
    }
  }, [onDragMove]);

  const handleClipTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isDragging.current) {
      endDrag();
    }
  }, [endDrag]);

  // Mouse handlers for desktop drag
  const handleClipMouseDown = useCallback((e: React.MouseEvent, clipId: string) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(clipId, e.clientX);
  }, [isMobile, startDrag]);

  useEffect(() => {
    if (isMobile) return;
    const onMove = (e: MouseEvent) => {
      if (isDragging.current) onDragMove(e.clientX);
      if (isTrimming.current) handleTrimMouseMove(e);
    };
    const onUp = () => {
      if (isDragging.current) endDrag();
      if (isTrimming.current) endTrim();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isMobile, onDragMove, endDrag]);

  // ── Trim Handles ──
  const startTrim = useCallback((clipId: string, side: "left" | "right", clientX: number, e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isTrimming.current = true;
    setTrimClipId(clipId);
    setTrimSide(side);
    setTrimDelta(0);
    trimStartX.current = clientX;
  }, []);

  const handleTrimMouseMove = useCallback((e: MouseEvent) => {
    if (!isTrimming.current) return;
    const dx = e.clientX - trimStartX.current;
    setTrimDelta(dx / pps);
  }, [pps]);

  const endTrim = useCallback(() => {
    if (!isTrimming.current || !trimClipId || !trimSide || !onClipsChange) {
      isTrimming.current = false;
      setTrimClipId(null);
      setTrimSide(null);
      setTrimDelta(0);
      return;
    }
    const newClips = clips.map(c => {
      if (c.id !== trimClipId) return c;
      let newStart = c.start;
      let newEnd = c.end;
      if (trimSide === "left") {
        newStart = Math.max(0, c.start + trimDelta);
        if (newEnd - newStart < MIN_CLIP_DURATION) newStart = newEnd - MIN_CLIP_DURATION;
      } else {
        newEnd = Math.min(duration, c.end + trimDelta);
        if (newEnd - newStart < MIN_CLIP_DURATION) newEnd = newStart + MIN_CLIP_DURATION;
      }
      return { ...c, start: newStart, end: newEnd };
    });
    const trimmed = newClips.find(c => c.id === trimClipId)!;
    const sameType = newClips.filter(c => c.type === trimmed.type).sort((a, b) => a.start - b.start);
    const otherType = newClips.filter(c => c.type !== trimmed.type);
    const retimed = recalcTimingsForType(sameType);
    onClipsChange([...retimed, ...otherType].sort((a, b) => a.start - b.start));

    isTrimming.current = false;
    setTrimClipId(null);
    setTrimSide(null);
    setTrimDelta(0);
  }, [trimClipId, trimSide, trimDelta, clips, duration, onClipsChange]);

  // Attach global trim touch listeners
  useEffect(() => {
    if (!isMobile) return;
    const onTouchMove = (e: TouchEvent) => {
      if (isTrimming.current) {
        const dx = e.touches[0].clientX - trimStartX.current;
        setTrimDelta(dx / pps);
        e.preventDefault();
      }
    };
    const onTouchEnd = () => {
      if (isTrimming.current) endTrim();
    };
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, pps, endTrim]);

  const selectedClip = clips.find(c => c.id === selectedClipId);
  const playheadLeft = currentTime * pps;

  // Shared props for ClipBlock
  const clipBlockProps = {
    pps, duration, isMobile, activeTool, currentTime,
    selectedClipId, dragClipId, trimClipId, trimSide, trimDelta,
    clipNames, clipThumbnails,
    onClipTap: handleClipTap,
    onClipTouchStart: handleClipTouchStart,
    onClipTouchMove: handleClipTouchMove,
    onClipTouchEnd: handleClipTouchEnd,
    onClipMouseDown: handleClipMouseDown,
    onTrimStart: startTrim,
  };

  return (
    <div className="flex flex-col gap-1" ref={containerRef} onClick={handleOutsideTap}>
      {/* Timeline header with zoom controls */}
      <div className="flex items-center gap-1 px-1">
        <span className="text-[10px] text-muted-foreground font-mono">
          {formatTimeBadge(currentTime)}
        </span>
        <span className="flex-1" />

        <button
          onClick={snapToPlayhead}
          className="w-7 h-7 md:w-6 md:h-6 flex items-center justify-center rounded bg-muted/50 text-muted-foreground hover:text-foreground transition-default"
          title="Snap to playhead"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => changeZoom(-ZOOM_STEP)}
          className="flex items-center justify-center rounded bg-muted/50 text-muted-foreground hover:text-foreground transition-default"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="timeline-zoom-slider"
          style={{ width: isMobile ? 120 : 160 }}
        />
        <span
          className="text-[10px] font-mono text-primary min-w-[28px] text-center"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          {zoom.toFixed(1).replace(/\.0$/, "")}X
        </span>
        <button
          onClick={() => changeZoom(ZOOM_STEP)}
          className="flex items-center justify-center rounded bg-muted/50 text-muted-foreground hover:text-foreground transition-default"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Section pills ABOVE clip rows */}
      <div className="relative overflow-hidden" style={{ height: 18 }}>
        <div className="relative" style={{ width: totalWidth }}>
          {sections.map((s, i) => {
            const left = s.start * pps;
            const width = (s.end - s.start) * pps;
            return (
              <div
                key={i}
                className={cn("absolute top-0 h-full flex items-center justify-center rounded-sm", SECTION_PILL_COLORS[s.type])}
                style={{ left, width, fontSize: 9, fontFamily: "'Space Mono', monospace", textTransform: "uppercase", letterSpacing: 1 }}
              >
                {width > 40 && <span className="truncate px-1">{s.type}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main scrollable timeline */}
      <div
        ref={scrollRef}
        className="timeline-scroll relative overflow-y-hidden rounded-lg border border-border"
        style={{
          height: isMobile ? 120 : 140,
          background: "hsl(0 0% 5.1%)",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
          overscrollBehaviorX: "contain",
        }}
        onMouseDown={handleBgMouseDown}
        onTouchStart={handleBgTouchStart}
        onTouchMove={handleBgTouchMove}
        onTouchEnd={handleBgTouchEnd}
        onScroll={handleScroll}
      >
        <div className="relative" style={{ width: totalWidth, height: "100%" }}>
          {/* Beat grid lines */}
          {beats.map((beat, i) => {
            const isStrong = i % 4 === 0;
            return (
              <div
                key={i}
                className="absolute top-0 w-px"
                style={{
                  left: beat * pps,
                  height: isStrong ? "100%" : "50%",
                  bottom: 0,
                  background: `rgba(255,255,255,${isStrong ? 0.08 : 0.04})`,
                }}
              />
            );
          })}

          {/* Performance clip row */}
          <div className="absolute left-0 right-0" style={{ top: 0, height: isMobile ? 52 : 48 }}>
            {perfClips.map(clip => (
              <ClipBlock key={clip.id} clip={clip} rowType="performance" {...clipBlockProps} />
            ))}
            <DropLine
              dropIndex={dropIndex}
              dragClipId={dragClipId && clips.find(c => c.id === dragClipId)?.type === "performance" ? dragClipId : null}
              clips={clips}
              rowClips={perfClips}
              pps={pps}
            />
          </div>

          {/* B-Roll clip row */}
          <div className="absolute left-0 right-0" style={{ top: isMobile ? 56 : 52, height: isMobile ? 36 : 40 }}>
            {brollClips.map(clip => (
              <ClipBlock key={clip.id} clip={clip} rowType="broll" {...clipBlockProps} />
            ))}
            <DropLine
              dropIndex={dropIndex}
              dragClipId={dragClipId && clips.find(c => c.id === dragClipId)?.type === "broll" ? dragClipId : null}
              clips={clips}
              rowClips={brollClips}
              pps={pps}
            />
          </div>

          {/* Audio track row */}
          <div className="absolute left-0 right-0" style={{ top: isMobile ? 96 : 96, height: 32 }}>
            {beats.map((beat, i) => (
              <div
                key={i}
                className="absolute bottom-0"
                style={{
                  left: beat * pps,
                  width: Math.max(2, pps * 0.05),
                  height: `${i % 4 === 0 ? 100 : i % 2 === 0 ? 70 : 40}%`,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 1,
                }}
              />
            ))}
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground z-10">
              AUDIO
            </span>
          </div>

          {/* Playhead with draggable hit area */}
          <div
            className="absolute top-0 bottom-0 z-30 cursor-col-resize"
            style={{ left: playheadLeft - 12, width: 24 }}
            onMouseDown={handlePlayheadDown}
            onTouchStart={handlePlayheadDown}
          >
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 pointer-events-none" style={{ background: "#FF4444" }}>
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full" style={{ background: "#FF4444" }} />
            </div>
          </div>

          {/* Floating time badge during scrub/playhead drag */}
          {showTimeBadge && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{ left: playheadLeft, top: -28, transform: "translateX(-50%)" }}
            >
              <div
                className="px-2 py-0.5 rounded text-[11px] whitespace-nowrap"
                style={{ background: "hsl(0 0% 10.2%)", color: "hsl(72 100% 64%)", fontFamily: "'Space Mono', monospace" }}
              >
                {formatTimeBadge(currentTime)}
              </div>
            </div>
          )}

          {/* Split mode: dashed line at playhead */}
          {activeTool === "split" && (
            <div
              className="absolute top-0 bottom-0 w-0 z-20 pointer-events-none"
              style={{ left: playheadLeft, borderLeft: "2px dashed hsl(72 100% 64%)" }}
            />
          )}
        </div>
      </div>

      {/* Track labels */}
      <div className="flex items-center gap-4 px-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-primary/40" /> Performance
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-success/40" /> B-Roll
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-primary/40 opacity-40" /> Audio
        </span>
      </div>

      {/* Mobile Bottom Sheet for clip actions */}
      {showBottomSheet && selectedClip && isMobile && (
        <div
          className="fixed inset-0 z-[200]"
          onClick={() => { setShowBottomSheet(false); setSelectedClipId(null); }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-card border-t border-primary rounded-t-xl px-4 py-3 animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-mono text-foreground">
                {clipNames?.[selectedClip.clip_id]?.replace(/\.[^/.]+$/, "") ?? "Clip"}
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {(selectedClip.end - selectedClip.start).toFixed(1)}s
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={deleteClip}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-destructive/10 text-destructive font-medium text-sm transition-default"
                style={{ minHeight: 44 }}
              >
                <Trash2 className="w-4 h-4" />
                DELETE
              </button>
              <button
                onClick={duplicateClip}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 text-primary font-medium text-sm transition-default"
                style={{ minHeight: 44 }}
              >
                <Copy className="w-4 h-4" />
                DUPLICATE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop floating toolbar */}
      {!isMobile && selectedClip && !showBottomSheet && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[10px] font-mono text-muted-foreground mr-2">
            {clipNames?.[selectedClip.clip_id]?.replace(/\.[^/.]+$/, "") ?? "Clip"} · {(selectedClip.end - selectedClip.start).toFixed(1)}s
          </span>
          <button
            onClick={deleteClip}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-destructive bg-destructive/10 hover:bg-destructive/20 transition-default"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
          <button
            onClick={duplicateClip}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-primary bg-primary/10 hover:bg-primary/20 transition-default"
          >
            <Copy className="w-3 h-3" /> Duplicate
          </button>
        </div>
      )}
    </div>
  );
}
