/**
 * Mux Direct Upload utility — chunked, resumable uploads
 * directly to Mux's servers via their Direct Upload URL.
 */

export interface MuxUploadProgress {
  percent: number;
  bytesUploaded: number;
  totalBytes: number;
  speedMBps?: number;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

/**
 * Upload a file to Mux via chunked PUT requests with Content-Range headers.
 */
export async function uploadToMux(
  file: File,
  uploadUrl: string,
  onProgress?: (p: MuxUploadProgress) => void,
): Promise<void> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const startTime = Date.now();

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);

      // Required headers for chunked upload
      xhr.setRequestHeader(
        "Content-Range",
        `bytes ${start}-${end - 1}/${file.size}`,
      );

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const chunkProgress = e.loaded / e.total;
          const overallBytes = start + e.loaded;
          const overallPercent = ((i + chunkProgress) / totalChunks) * 100;
          const elapsedSec = (Date.now() - startTime) / 1000;
          const speedMBps = elapsedSec > 0
            ? overallBytes / (1024 * 1024) / elapsedSec
            : 0;

          onProgress({
            percent: Math.round(overallPercent),
            bytesUploaded: overallBytes,
            totalBytes: file.size,
            speedMBps: Math.round(speedMBps * 10) / 10,
          });
        }
      };

      xhr.onload = () => {
        // 200, 201, 308 are all valid for chunked uploads
        if (xhr.status >= 200 && xhr.status < 400) resolve();
        else reject(new Error(`Chunk ${i} failed: ${xhr.status}`));
      };

      xhr.onerror = () => reject(new Error(`Chunk ${i} network error`));
      xhr.ontimeout = () => reject(new Error(`Chunk ${i} timed out`));

      xhr.send(chunk);
    });
  }
}
