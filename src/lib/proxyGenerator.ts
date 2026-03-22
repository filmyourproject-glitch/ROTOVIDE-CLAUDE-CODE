/**
 * Extract a single JPEG preview frame from a video file.
 * Uses minimal memory — only loads metadata + seeks to one frame.
 * Takes under 1 second for any file size including 4K.
 */
export async function extractPreviewFrame(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = objectUrl;
    video.muted = true;
    video.preload = 'metadata';

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.pause();
      video.removeAttribute('src');
      video.load(); // forces browser to release video buffer
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Frame extraction timed out'));
    }, 15_000);

    video.onloadedmetadata = () => {
      // Seek to 10% into the clip to avoid black opening frames
      video.currentTime = Math.max(video.duration * 0.1, 1);
    };

    video.onseeked = () => {
      try {
        clearTimeout(timeout);
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, 1280, 720);

        // Release memory immediately after frame is captured
        cleanup();

        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error('Frame extraction failed')),
          'image/jpeg',
          0.85,
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error('Could not load video for preview'));
    };
  });
}

export function estimateUploadTime(totalBytes: number): string {
  const mbps = 50;
  const bytesPerSecond = (mbps * 1_000_000) / 8;
  const seconds = totalBytes / bytesPerSecond;

  if (seconds < 60) return 'under a minute';
  if (seconds < 3600) return `about ${Math.ceil(seconds / 60)} minutes`;
  return `about ${(seconds / 3600).toFixed(1)} hours`;
}
