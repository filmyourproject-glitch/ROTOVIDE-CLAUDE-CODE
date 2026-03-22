import { Film, Play, Pause, Loader2 } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { cn } from "@/lib/utils";
import type { ColorGrade, VideoFormat } from "@/types";
import { getColorGradeFilter } from "@/lib/colorGrades";
import { Badge } from "@/components/ui/badge";
import { type FaceCrop, getSmartCropPosition } from "@/lib/faceDetection";
import { getFacePositionAtTime, type FaceKeyframe } from "@/lib/faceTracking";
import { LyricsCaptionOverlay } from "./LyricsCaptionOverlay";
import type { LyricWord, CaptionStyle, CaptionSize, CaptionPosition } from "@/lib/lyricsEngine";

export interface CameraEntry {
  url: string;
  xcorrOffset: number;
}

interface VideoPreviewProps {
  colorGrade: ColorGrade;
  colorGradeIntensity: number;
  currentTime: number;
  duration: number;
  format: VideoFormat;
  isPlaying?: boolean;
  onPlayToggle?: () => void;
  onSeek: (time: number) => void;
  // Multicam props
  cameraRegistry: Record<string, CameraEntry>;
  activeCameraId: string | null;
  brollUrl: string | null;
  brollSourceOffset: number;
  brollClipStart: number;
  // Kept props
  clipStatus: "loading" | "proxy" | "ready" | "unavailable";
  isImageOnly?: boolean;
  faceCrop?: FaceCrop;
  faceKeyframes?: FaceKeyframe[];
  currentClipId?: string;
  clipStart?: number;
  sourceOffset?: number;
  showWatermark?: boolean;
  // Lyrics caption props
  lyricsWords?: LyricWord[];
  lyricsVisible?: boolean;
  lyricsStyle?: CaptionStyle;
  lyricsSize?: CaptionSize;
  lyricsPosition?: CaptionPosition;
}

export function VideoPreview({
  colorGrade,
  colorGradeIntensity,
  currentTime,
  duration,
  format,
  isPlaying = false,
  onPlayToggle,
  onSeek,
  cameraRegistry,
  activeCameraId,
  brollUrl,
  brollSourceOffset,
  brollClipStart,
  clipStatus,
  isImageOnly = false,
  faceCrop,
  faceKeyframes,
  currentClipId,
  clipStart = 0,
  sourceOffset = 0,
  showWatermark = false,
  lyricsWords = [],
  lyricsVisible = false,
  lyricsStyle = "highlight",
  lyricsSize = "M",
  lyricsPosition = "bottom",
}: VideoPreviewProps) {
  // ── N-camera multicam architecture ──
  // One video element per unique performance camera, all playing simultaneously.
  // Cuts are instant opacity flips — no HLS reload, no seeking.
  const hlsRefs = useRef<Record<string, Hls | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // B-roll uses a single dedicated video element (not multicam)
  const brollVideoRef = useRef<HTMLVideoElement>(null);
  const brollHlsRef = useRef<Hls | null>(null);
  const prevBrollUrlRef = useRef<string | null>(null);

  // Both-format refs (kept for "both" format mode)
  const bothVideoRef1 = useRef<HTMLVideoElement>(null);
  const bothVideoRef2 = useRef<HTMLVideoElement>(null);
  const hlsBothRef1 = useRef<Hls | null>(null);
  const hlsBothRef2 = useRef<Hls | null>(null);

  const [camerasReady, setCamerasReady] = useState(false);

  const filter = getColorGradeFilter(colorGrade, colorGradeIntensity);
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const [isSeekDragging, setIsSeekDragging] = useState(false);
  const [seekTooltipTime, setSeekTooltipTime] = useState<number | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Load each camera ONCE when registry changes ──
  useEffect(() => {
    const cameraIds = Object.keys(cameraRegistry);
    if (cameraIds.length === 0) return;

    let readyCount = 0;
    const totalCameras = cameraIds.length;

    for (const cameraId of cameraIds) {
      // Skip if already loaded with same URL
      if (hlsRefs.current[cameraId]) {
        readyCount++;
        continue;
      }

      const video = videoRefs.current[cameraId];
      if (!video) continue;

      const camera = cameraRegistry[cameraId];
      if (camera.url.endsWith(".m3u8") && Hls.isSupported()) {
        const hls = new Hls({
          startFragPrefetch: true,
          maxBufferLength: 30, // buffer generously — all cameras play simultaneously
        });
        hls.loadSource(camera.url);
        hls.attachMedia(video);
        hlsRefs.current[cameraId] = hls;

        video.addEventListener("canplay", () => {
          readyCount++;
          if (readyCount >= totalCameras) setCamerasReady(true);
        }, { once: true });
      } else {
        video.src = camera.url;
        video.addEventListener("canplay", () => {
          readyCount++;
          if (readyCount >= totalCameras) setCamerasReady(true);
        }, { once: true });
      }
    }

    if (readyCount >= totalCameras) setCamerasReady(true);

    // Cleanup cameras that left the registry
    for (const [id, hls] of Object.entries(hlsRefs.current)) {
      if (!cameraRegistry[id]) {
        hls?.destroy();
        delete hlsRefs.current[id];
        delete videoRefs.current[id];
      }
    }
  }, [cameraRegistry]);

  // ── Cleanup all HLS on unmount ──
  useEffect(() => {
    return () => {
      for (const hls of Object.values(hlsRefs.current)) {
        hls?.destroy();
      }
      hlsRefs.current = {};
      brollHlsRef.current?.destroy();
      hlsBothRef1.current?.destroy();
      hlsBothRef2.current?.destroy();
    };
  }, []);

  // ── THE KEY SYNC LOOP ──
  // Every tick of the audio clock, update ALL cameras using their individual xcorrOffset.
  // This is exactly what Premiere does — each camera has one formula, always.
  useEffect(() => {
    for (const [cameraId, camera] of Object.entries(cameraRegistry)) {
      const video = videoRefs.current[cameraId];
      if (!video) continue;

      // Each camera's correct position: songTime + xcorrOffset (pre-roll)
      const targetPos = Math.max(0, currentTime + camera.xcorrOffset);
      const drift = Math.abs(video.currentTime - targetPos);

      // During playback, only correct major drift (>1.5s) — let the video run freely
      // On pause/scrub, snap to exact position
      if (isPlaying) {
        if (drift > 1.5) {
          video.currentTime = targetPos;
        }
      } else {
        if (drift > 0.05) {
          video.currentTime = targetPos;
        }
      }
    }
  }, [currentTime, cameraRegistry, isPlaying]);

  // ── Sync play/pause on ALL cameras simultaneously ──
  useEffect(() => {
    for (const video of Object.values(videoRefs.current)) {
      if (!video) continue;
      if (isPlaying) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  }, [isPlaying]);

  // ── B-roll: load/unload when brollUrl changes ──
  useEffect(() => {
    if (brollUrl === prevBrollUrlRef.current) return;
    prevBrollUrlRef.current = brollUrl;

    if (!brollUrl) {
      if (brollHlsRef.current) {
        brollHlsRef.current.destroy();
        brollHlsRef.current = null;
      }
      if (brollVideoRef.current) brollVideoRef.current.src = "";
      return;
    }

    const video = brollVideoRef.current;
    if (!video) return;

    if (brollHlsRef.current) {
      brollHlsRef.current.destroy();
      brollHlsRef.current = null;
    }

    if (brollUrl.endsWith(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ startFragPrefetch: true, maxBufferLength: 8 });
      hls.loadSource(brollUrl);
      hls.attachMedia(video);
      brollHlsRef.current = hls;
    } else {
      video.src = brollUrl;
    }

    video.addEventListener("loadeddata", () => {
      const posInClip = (currentTime - brollClipStart) + brollSourceOffset;
      video.currentTime = Math.max(0, posInClip);
      if (isPlaying) video.play().catch(() => {});
    }, { once: true });
  }, [brollUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── B-roll sync ──
  useEffect(() => {
    const video = brollVideoRef.current;
    if (!video || !brollUrl) return;

    const posInClip = (currentTime - brollClipStart) + brollSourceOffset;
    const safePos = Math.max(0, posInClip);
    const drift = Math.abs(video.currentTime - safePos);

    if (isPlaying) {
      if (drift > 1.5) video.currentTime = safePos;
    } else {
      if (drift > 0.05) video.currentTime = safePos;
    }
  }, [currentTime, brollClipStart, brollSourceOffset, brollUrl, isPlaying]);

  // ── B-roll play/pause ──
  useEffect(() => {
    const video = brollVideoRef.current;
    if (!video || !brollUrl) return;
    if (isPlaying) video.play().catch(() => {});
    else video.pause();
  }, [isPlaying, brollUrl]);

  // ── Both-format sync (kept for "both" format) ──
  const activeClipUrl = activeCameraId ? cameraRegistry[activeCameraId]?.url : brollUrl;

  const setupHls = useCallback((video: HTMLVideoElement, url: string, hlsHolder: React.MutableRefObject<Hls | null>) => {
    if (hlsHolder.current) {
      hlsHolder.current.destroy();
      hlsHolder.current = null;
    }
    if (url.endsWith(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ startFragPrefetch: true, maxBufferLength: 8 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hlsHolder.current = hls;
    } else {
      video.src = url;
    }
  }, []);

  const syncBothVideos = useCallback((songTime: number) => {
    if (!activeClipUrl) return;
    const posInClip = activeCameraId
      ? Math.max(0, songTime + (cameraRegistry[activeCameraId]?.xcorrOffset ?? 0))
      : Math.max(0, (songTime - brollClipStart) + brollSourceOffset);

    [bothVideoRef1.current, bothVideoRef2.current].forEach(v => {
      if (v && Math.abs(v.currentTime - posInClip) > 0.2) {
        v.currentTime = posInClip;
      }
    });
  }, [activeCameraId, cameraRegistry, brollClipStart, brollSourceOffset, activeClipUrl]);

  useEffect(() => { syncBothVideos(currentTime); }, [currentTime, syncBothVideos]);

  useEffect(() => {
    [bothVideoRef1.current, bothVideoRef2.current].forEach(v => {
      if (!v || !activeClipUrl || isImageOnly) return;
      if (isPlaying) v.play().catch(() => {});
      else v.pause();
    });
  }, [isPlaying, activeClipUrl, isImageOnly]);

  useEffect(() => {
    if (format !== "both" || !activeClipUrl) return;
    if (bothVideoRef1.current) setupHls(bothVideoRef1.current, activeClipUrl, hlsBothRef1);
    if (bothVideoRef2.current) setupHls(bothVideoRef2.current, activeClipUrl, hlsBothRef2);
    return () => {
      hlsBothRef1.current?.destroy(); hlsBothRef1.current = null;
      hlsBothRef2.current?.destroy(); hlsBothRef2.current = null;
    };
  }, [activeClipUrl, format, setupHls]);

  // ── Helpers ──
  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const getSeekTime = useCallback((clientX: number) => {
    const bar = seekBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * duration;
  }, [duration]);

  const handleSeekDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsSeekDragging(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const time = getSeekTime(clientX);
    onSeek(time);
    setSeekTooltipTime(time);

    const getX = (ev: MouseEvent | TouchEvent) =>
      "touches" in ev ? ev.touches[0].clientX : ev.clientX;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const t = getSeekTime(getX(ev));
      onSeek(t);
      setSeekTooltipTime(t);
    };
    const onUp = () => {
      setIsSeekDragging(false);
      setSeekTooltipTime(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  }, [getSeekTime, onSeek]);

  const videoFilter = filter !== "none" ? filter : undefined;
  const staticCropPosition = getSmartCropPosition(faceCrop, format);

  // ── Live face tracking crop ──
  const [liveCropX, setLiveCropX] = useState(50);
  const [liveCropY, setLiveCropY] = useState(35);
  const hasKeyframes = faceKeyframes && faceKeyframes.length > 0;

  useEffect(() => {
    if (!hasKeyframes || !faceKeyframes) return;
    const posInClip = activeCameraId
      ? Math.max(0, currentTime + (cameraRegistry[activeCameraId]?.xcorrOffset ?? 0))
      : (currentTime - clipStart) + sourceOffset;
    const { x, y } = getFacePositionAtTime(faceKeyframes, posInClip);

    if (format === '9:16' || format === 'both') {
      const containerAspect = 9 / 16;
      const videoAspect = 16 / 9;
      const r = containerAspect / videoAspect;
      const objectX = Math.max(0, Math.min(100, ((x - r / 2) / (1 - r)) * 100));
      const objectY = Math.max(0, Math.min(100, y * 100));
      setLiveCropX(objectX);
      setLiveCropY(objectY);
    } else {
      setLiveCropX(Math.round(x * 100));
      setLiveCropY(Math.round(y * 100));
    }
  }, [currentTime, faceKeyframes, hasKeyframes, clipStart, sourceOffset, format, activeCameraId, cameraRegistry]);

  const cropPosition = hasKeyframes
    ? `${liveCropX}% ${liveCropY}%`
    : staticCropPosition;

  const renderFaceBadge = () => {
    // Determine tracking source from live keyframes
    let trackingLabel = "CENTER CROP";
    if (hasKeyframes && faceKeyframes) {
      const posInClip = activeCameraId
        ? Math.max(0, currentTime + (cameraRegistry[activeCameraId]?.xcorrOffset ?? 0))
        : (currentTime - clipStart) + sourceOffset;
      const result = getFacePositionAtTime(faceKeyframes, posInClip);
      const source = (result as any).trackingSource;
      if (source === 'body') trackingLabel = "BODY TRACKING";
      else if (source === 'face') trackingLabel = "FACE TRACKING";
      else if (source === 'held') trackingLabel = "TRACKING HELD";
    } else if (faceCrop?.detected) {
      trackingLabel = "FACE DETECTED";
    }

    return (
      <div className="absolute bottom-2 left-3 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1 z-10">
        <div
          className="w-[5px] h-[5px] rounded-full"
          style={{ background: (hasKeyframes || faceCrop?.detected) ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.3)" }}
        />
        <span className="text-[8px] font-mono text-foreground/70 tracking-wider">
          {trackingLabel}
        </span>
      </div>
    );
  };

  const renderWatermark = () => {
    if (!showWatermark) return null;
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
        <span
          className="font-mono tracking-[6px] select-none"
          style={{
            fontSize: 28,
            color: "hsla(0, 0%, 100%, 0.15)",
            textShadow: "0 2px 8px hsla(0, 0%, 0%, 0.4)",
            transform: "rotate(-18deg)",
            letterSpacing: 6,
            fontWeight: 700,
          }}
        >
          ROTOVIDE
        </span>
      </div>
    );
  };

  const cameraVideoStyle = (cameraId: string): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: videoFilter,
    objectPosition: cropPosition && cropPosition !== 'center' ? cropPosition : undefined,
    transition: hasKeyframes ? 'object-position 0.4s ease-out' : undefined,
    // INSTANT CUT: just opacity — no seeking, no reloading
    opacity: cameraId === activeCameraId ? 1 : 0,
    pointerEvents: cameraId === activeCameraId ? 'auto' as const : 'none' as const,
  });

  const hasAnyCameraOrBroll = Object.keys(cameraRegistry).length > 0 || brollUrl;

  // ── Multicam render: one <video> per camera, all playing simultaneously ──
  const renderVideo = (showFaceBadge: boolean, cropPos: string) => {
    if (hasAnyCameraOrBroll && !isImageOnly) {
      const showBroll = brollUrl && !activeCameraId;
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Performance cameras — always mounted, always playing */}
          {Object.keys(cameraRegistry).map((cameraId) => (
            <video
              key={cameraId}
              ref={el => { videoRefs.current[cameraId] = el; }}
              style={cameraVideoStyle(cameraId)}
              playsInline
              muted
            />
          ))}

          {/* B-roll overlay — shown only when no performance camera is active */}
          <video
            ref={brollVideoRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: videoFilter,
              objectPosition: cropPos && cropPos !== 'center' ? cropPos : undefined,
              opacity: showBroll ? 1 : 0,
              pointerEvents: showBroll ? 'auto' as const : 'none' as const,
              transition: hasKeyframes && showBroll ? 'object-position 0.4s ease-out' : 'none',
            }}
            playsInline
            muted
          />

          {/* Loading spinner until cameras are ready */}
          {!camerasReady && Object.keys(cameraRegistry).length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {showFaceBadge && renderFaceBadge()}
          {renderWatermark()}
          <LyricsCaptionOverlay
            words={lyricsWords}
            currentTime={currentTime}
            visible={lyricsVisible}
            style={lyricsStyle}
            size={lyricsSize}
            position={lyricsPosition}
          />
        </div>
      );
    }

    if (isImageOnly && activeClipUrl) {
      return (
        <>
          <img src={activeClipUrl} alt="Preview frame" className="w-full h-full object-cover" style={{ filter: videoFilter }} />
          <Badge className="absolute top-2 left-1/2 -translate-x-1/2 bg-warning/80 text-warning-foreground text-[10px] whitespace-nowrap z-10">
            Still frame — original uploading
          </Badge>
          {showFaceBadge && renderFaceBadge()}
          {renderWatermark()}
        </>
      );
    }

    if (clipStatus === "loading") {
      return (
        <div className="w-full h-full flex items-center justify-center animate-pulse bg-muted/30">
          <Loader2 className="w-10 h-10 text-muted-foreground animate-spin" />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground w-full h-full">
        <Film className="w-12 h-12 opacity-30" />
        <span className="text-xs">Clip not available yet</span>
      </div>
    );
  };

  const renderBothClip = (cropPos?: string, showFace?: boolean, vRef?: React.RefObject<HTMLVideoElement>) => {
    const style: React.CSSProperties = { filter: videoFilter };
    if (cropPos && cropPos !== "center") {
      style.objectPosition = cropPos;
      style.transition = "object-position 0.3s ease";
    }
    if (activeClipUrl && !isImageOnly) {
      return (
        <>
          <video ref={vRef} className="w-full h-full object-cover" style={style} muted playsInline />
          {showFace && renderFaceBadge()}
        </>
      );
    }
    if (activeClipUrl && isImageOnly) {
      return (
        <>
          <img src={activeClipUrl} alt="Preview" className="w-full h-full object-cover" style={style} />
          <Badge className="absolute top-2 left-1/2 -translate-x-1/2 bg-warning/80 text-warning-foreground text-[10px] whitespace-nowrap z-10">
            Still frame
          </Badge>
          {showFace && renderFaceBadge()}
        </>
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center">
        {clipStatus === "loading" ? (
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
        ) : (
          <Film className="w-8 h-8 text-muted-foreground/20" />
        )}
      </div>
    );
  };

  const renderBothPreview = () => (
    <div className="flex-1 min-h-0 overflow-hidden relative">
      <div
        style={{
          overflowY: "auto", height: "100%",
          display: "flex", flexDirection: isMobile ? "column" : "row",
          gap: 12, width: "100%", alignItems: "center", justifyContent: "center",
          padding: isMobile ? 8 : 16, WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="flex flex-col items-center gap-2" style={{ flexShrink: 0 }}>
          <div
            className="overflow-hidden rounded-lg relative bg-black"
            style={{ width: 158, height: 280, flexShrink: 0, margin: "0 auto", border: "1px solid hsl(var(--primary) / 0.3)" }}
          >
            {renderBothClip(cropPosition, true, bothVideoRef1)}
          </div>
          <span className="text-[11px] font-mono text-primary">9:16 · TIKTOK / REELS</span>
        </div>
        <div className="flex flex-col items-center gap-2" style={{ flexShrink: 0, width: isMobile ? "100%" : undefined, flex: isMobile ? undefined : 1 }}>
          <div
            className="overflow-hidden rounded-lg relative bg-black"
            style={{ width: "100%", aspectRatio: "16/9", border: "1px solid hsl(var(--foreground) / 0.15)" }}
          >
            {renderBothClip(undefined, false, bothVideoRef2)}
          </div>
          <span className="text-[11px] font-mono text-primary">16:9 · YOUTUBE</span>
        </div>
      </div>
    </div>
  );

  const containerStyle: React.CSSProperties =
    format === "9:16"
      ? { width: isMobile ? 158 : 240, height: isMobile ? 280 : 426, flexShrink: 0, margin: "0 auto" }
      : { width: "100%", aspectRatio: "16/9" };

  const renderSinglePreview = () => (
    <div
      className={cn(
        "flex-1 min-h-0 flex items-center overflow-hidden relative",
        format === "9:16" ? "justify-center bg-black" : "justify-stretch"
      )}
      style={{ minHeight: format === "9:16" ? 280 : undefined }}
    >
      <div
        className="bg-black/80 rounded-lg overflow-hidden relative flex items-center justify-center"
        style={containerStyle}
      >
        {renderVideo(format === "9:16", cropPosition)}

        {clipStatus === "proxy" && !isImageOnly && activeClipUrl && (
          <Badge className="absolute top-2 left-1/2 -translate-x-1/2 bg-warning/80 text-warning-foreground text-[10px] whitespace-nowrap z-10">
            Preview quality — full upload in progress
          </Badge>
        )}

        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent h-20 pointer-events-none" />
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}>
      {format === "both" ? renderBothPreview() : renderSinglePreview()}

      {/* Transport controls */}
      <div style={{ flexShrink: 0, position: "relative", zIndex: 10 }} className="mt-1 space-y-2 px-1">
        <div
          ref={seekBarRef}
          className="relative cursor-pointer group"
          style={{ padding: isMobile ? "19px 0" : "8px 0" }}
          onMouseDown={handleSeekDown}
          onTouchStart={handleSeekDown}
        >
          <div className="h-1.5 rounded-full relative" style={{ background: "hsl(0 0% 20%)" }}>
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${progressPct}%`, background: "hsl(72 100% 64%)" }}
            />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${progressPct}%`,
              transform: `translate(-50%, -50%)`,
              width: 20, height: 20,
              background: "hsl(72 100% 64%)",
              boxShadow: isSeekDragging ? "0 0 8px hsl(72 100% 64% / 0.5)" : "none",
              transition: isSeekDragging ? "none" : "box-shadow 0.15s",
            }}
          />
          {seekTooltipTime !== null && (
            <div
              className="absolute pointer-events-none"
              style={{ left: `${(seekTooltipTime / duration) * 100}%`, top: -28, transform: "translateX(-50%)" }}
            >
              <div
                className="px-2 py-0.5 rounded text-[11px] whitespace-nowrap"
                style={{ background: "hsl(0 0% 10.2%)", color: "hsl(72 100% 64%)", fontFamily: "'Space Mono', monospace" }}
              >
                {formatTime(seekTooltipTime)} / {formatTime(duration)}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button onClick={onPlayToggle} className="text-foreground hover:text-primary transition-default p-1" aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <span className="text-[11px] font-mono text-foreground/60 tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
