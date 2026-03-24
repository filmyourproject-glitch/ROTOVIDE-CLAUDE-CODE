import { Film, Loader2 } from "lucide-react";
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
import { TransportControls } from "./video-preview/TransportControls";
import { FaceTrackingBadge, WatermarkOverlay } from "./video-preview/VideoOverlays";

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
      if (hlsRefs.current[cameraId]) {
        readyCount++;
        continue;
      }

      const video = videoRefs.current[cameraId];
      if (!video) continue;

      const camera = cameraRegistry[cameraId];
      if (camera.url.endsWith(".m3u8") && Hls.isSupported()) {
        const hls = new Hls({ startFragPrefetch: true, maxBufferLength: 30 });
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
      for (const hls of Object.values(hlsRefs.current)) hls?.destroy();
      hlsRefs.current = {};
      brollHlsRef.current?.destroy();
      hlsBothRef1.current?.destroy();
      hlsBothRef2.current?.destroy();
    };
  }, []);

  // ── THE KEY SYNC LOOP ──
  useEffect(() => {
    for (const [cameraId, camera] of Object.entries(cameraRegistry)) {
      const video = videoRefs.current[cameraId];
      if (!video) continue;
      const targetPos = Math.max(0, currentTime + camera.xcorrOffset);
      const drift = Math.abs(video.currentTime - targetPos);
      if (isPlaying) {
        if (drift > 1.5) video.currentTime = targetPos;
      } else {
        if (drift > 0.05) video.currentTime = targetPos;
      }
    }
  }, [currentTime, cameraRegistry, isPlaying]);

  // ── Sync play/pause on ALL cameras simultaneously ──
  useEffect(() => {
    for (const video of Object.values(videoRefs.current)) {
      if (!video) continue;
      if (isPlaying) video.play().catch(() => {});
      else video.pause();
    }
  }, [isPlaying]);

  // ── B-roll: load/unload when brollUrl changes ──
  useEffect(() => {
    if (brollUrl === prevBrollUrlRef.current) return;
    prevBrollUrlRef.current = brollUrl;

    if (!brollUrl) {
      brollHlsRef.current?.destroy();
      brollHlsRef.current = null;
      if (brollVideoRef.current) brollVideoRef.current.src = "";
      return;
    }

    const video = brollVideoRef.current;
    if (!video) return;

    brollHlsRef.current?.destroy();
    brollHlsRef.current = null;

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

  // ── Both-format sync ──
  const activeClipUrl = activeCameraId ? cameraRegistry[activeCameraId]?.url : brollUrl;

  const setupHls = useCallback((video: HTMLVideoElement, url: string, hlsHolder: React.MutableRefObject<Hls | null>) => {
    hlsHolder.current?.destroy();
    hlsHolder.current = null;
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
      if (v && Math.abs(v.currentTime - posInClip) > 0.2) v.currentTime = posInClip;
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

    if (format === "9:16" || format === "both") {
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

  const staticCropPosition = getSmartCropPosition(faceCrop, format);
  const cropPosition = hasKeyframes ? `${liveCropX}% ${liveCropY}%` : staticCropPosition;

  const videoFilter = filter !== "none" ? filter : undefined;
  const hasAnyCameraOrBroll = Object.keys(cameraRegistry).length > 0 || brollUrl;

  const overlayProps = { hasKeyframes: !!hasKeyframes, faceCrop, faceKeyframes, currentTime, activeCameraId, cameraRegistry, clipStart, sourceOffset };

  // ── Multicam render ──
  const renderVideo = (showFaceBadge: boolean, cropPos: string) => {
    if (hasAnyCameraOrBroll && !isImageOnly) {
      const showBroll = brollUrl && !activeCameraId;
      return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {Object.keys(cameraRegistry).map((cameraId) => (
            <video
              key={cameraId}
              ref={el => { videoRefs.current[cameraId] = el; }}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", filter: videoFilter,
                objectPosition: cropPos && cropPos !== "center" ? cropPos : undefined,
                transition: hasKeyframes ? "object-position 0.4s ease-out" : undefined,
                opacity: cameraId === activeCameraId ? 1 : 0,
                pointerEvents: cameraId === activeCameraId ? "auto" : "none",
              }}
              playsInline muted
            />
          ))}
          <video
            ref={brollVideoRef}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", filter: videoFilter,
              objectPosition: cropPos && cropPos !== "center" ? cropPos : undefined,
              opacity: showBroll ? 1 : 0,
              pointerEvents: showBroll ? "auto" : "none",
              transition: hasKeyframes && showBroll ? "object-position 0.4s ease-out" : "none",
            }}
            playsInline muted
          />
          {!camerasReady && Object.keys(cameraRegistry).length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          {showFaceBadge && <FaceTrackingBadge {...overlayProps} />}
          <WatermarkOverlay showWatermark={showWatermark} />
          <LyricsCaptionOverlay
            words={lyricsWords} currentTime={currentTime} visible={lyricsVisible}
            style={lyricsStyle} size={lyricsSize} position={lyricsPosition}
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
          {showFaceBadge && <FaceTrackingBadge {...overlayProps} />}
          <WatermarkOverlay showWatermark={showWatermark} />
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
          {showFace && <FaceTrackingBadge {...overlayProps} />}
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
          {showFace && <FaceTrackingBadge {...overlayProps} />}
        </>
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center">
        {clipStatus === "loading"
          ? <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          : <Film className="w-8 h-8 text-muted-foreground/20" />
        }
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
      <TransportControls
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        onPlayToggle={onPlayToggle}
        onSeek={onSeek}
        isMobile={isMobile}
      />
    </div>
  );
}
