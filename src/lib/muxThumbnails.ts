/**
 * Generate a Mux thumbnail URL for a given playback ID.
 * @see https://docs.mux.com/guides/get-images-from-a-video
 */
export function getMuxThumbnailUrl(
  playbackId: string,
  opts?: {
    width?: number;
    height?: number;
    time?: number;
    fitMode?: "preserve" | "stretch" | "crop" | "smartcrop" | "pad";
  }
): string {
  const params = new URLSearchParams();
  if (opts?.width) params.set("width", String(opts.width));
  if (opts?.height) params.set("height", String(opts.height));
  if (opts?.time != null) params.set("time", String(opts.time));
  if (opts?.fitMode) params.set("fit_mode", opts.fitMode);
  const qs = params.toString();
  return `https://image.mux.com/${playbackId}/thumbnail.jpg${qs ? `?${qs}` : ""}`;
}

/**
 * Generate an animated GIF preview from Mux.
 */
export function getMuxAnimatedUrl(
  playbackId: string,
  opts?: { width?: number; start?: number; end?: number; fps?: number }
): string {
  const params = new URLSearchParams();
  if (opts?.width) params.set("width", String(opts.width));
  if (opts?.start != null) params.set("start", String(opts.start));
  if (opts?.end != null) params.set("end", String(opts.end));
  if (opts?.fps) params.set("fps", String(opts.fps));
  const qs = params.toString();
  return `https://image.mux.com/${playbackId}/animated.gif${qs ? `?${qs}` : ""}`;
}
