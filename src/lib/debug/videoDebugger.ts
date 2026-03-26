/**
 * Video Debugger — monitors HLS.js and HTMLVideoElement for errors.
 * Records media events and provides auto-recovery for non-fatal errors.
 */
import { errorTracker } from "@/lib/errorTracking";

export interface VideoEvent {
  type: "error" | "stall" | "recovery" | "loaded" | "seek" | "quality_change";
  message: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export class VideoDebugger {
  private events: VideoEvent[] = [];
  private maxEvents = 100;
  private videoElement: HTMLVideoElement | null = null;
  private listeners: Array<() => void> = [];

  /**
   * Attach to an HTMLVideoElement to monitor errors and stalls.
   */
  attachToVideoElement(video: HTMLVideoElement): () => void {
    this.videoElement = video;

    const onError = () => {
      const err = video.error;
      const message = err
        ? `MediaError code=${err.code}: ${err.message || this.mediaErrorCodeToString(err.code)}`
        : "Unknown video error";

      this.record("error", message, {
        code: err?.code,
        currentTime: video.currentTime,
        src: video.currentSrc?.slice(0, 100),
      });

      errorTracker.track(message, "media", "high", {
        code: err?.code,
        currentTime: video.currentTime,
      });
    };

    const onStalled = () => {
      this.record("stall", "Video playback stalled", {
        currentTime: video.currentTime,
        readyState: video.readyState,
        networkState: video.networkState,
      });
    };

    const onLoadedData = () => {
      this.record("loaded", `Video loaded: ${video.videoWidth}x${video.videoHeight}`, {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };

    video.addEventListener("error", onError);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("loadeddata", onLoadedData);

    const cleanup = () => {
      video.removeEventListener("error", onError);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("loadeddata", onLoadedData);
      this.videoElement = null;
    };

    this.listeners.push(cleanup);
    return cleanup;
  }

  /**
   * Attach to an HLS.js instance to monitor HLS-specific errors.
   */
  attachToHls(hls: {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    recoverMediaError?: () => void;
  }): () => void {
    const onError = (_event: unknown, data: Record<string, unknown>) => {
      const fatal = data.fatal as boolean;
      const type = data.type as string;
      const details = data.details as string;

      const message = `HLS ${fatal ? "FATAL" : "non-fatal"} ${type}: ${details}`;

      this.record("error", message, {
        fatal,
        type,
        details,
      });

      if (fatal) {
        errorTracker.track(message, "media", "critical", { type, details });

        // Auto-recover from media errors
        if (type === "mediaError" && hls.recoverMediaError) {
          this.record("recovery", "Attempting HLS media error recovery");
          try {
            hls.recoverMediaError();
          } catch (e) {
            this.record("error", `Recovery failed: ${e}`);
          }
        }
      } else {
        errorTracker.track(message, "media", "low", { type, details });
      }
    };

    // HLS.js event name for errors
    hls.on("hlsError", onError);

    const cleanup = () => {
      hls.off("hlsError", onError);
    };

    this.listeners.push(cleanup);
    return cleanup;
  }

  getEvents(): readonly VideoEvent[] {
    return this.events;
  }

  clear(): void {
    this.events = [];
  }

  detachAll(): void {
    this.listeners.forEach((cleanup) => cleanup());
    this.listeners = [];
  }

  private record(
    type: VideoEvent["type"],
    message: string,
    details?: Record<string, unknown>,
  ): void {
    this.events.unshift({
      type,
      message,
      timestamp: Date.now(),
      details,
    });

    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    if (import.meta.env.DEV) {
      console.log(`[VideoDebugger] ${type}: ${message}`);
    }
  }

  private mediaErrorCodeToString(code: number): string {
    switch (code) {
      case 1: return "MEDIA_ERR_ABORTED";
      case 2: return "MEDIA_ERR_NETWORK";
      case 3: return "MEDIA_ERR_DECODE";
      case 4: return "MEDIA_ERR_SRC_NOT_SUPPORTED";
      default: return `UNKNOWN_CODE_${code}`;
    }
  }
}

/** Singleton instance */
export const videoDebugger = new VideoDebugger();
