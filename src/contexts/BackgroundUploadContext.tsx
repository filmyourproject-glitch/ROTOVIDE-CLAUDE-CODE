import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type UploadPhase = "transcoding" | "uploading_proxy" | "uploading_original" | "queued" | "complete" | "error";

export interface BackgroundUpload {
  id: string;
  fileName: string;
  progress: number;
  phase: UploadPhase;
  /** For display in the progress bar */
  label: string;
  /** Upload speed in MB/s */
  speedMBps?: number;
}

interface BackgroundUploadContextType {
  uploads: BackgroundUpload[];
  queueUpload: (params: {
    file: File;
    userId: string;
    projectId: string;
    storagePath: string;
    fileName: string;
    mediaFileId?: string;
  }) => void;
  /** Add or update a tracked upload entry directly (used by transcoding flow) */
  setUploadEntry: (entry: BackgroundUpload) => void;
  /** Remove an entry by id */
  removeUploadEntry: (id: string) => void;
}

const BackgroundUploadContext = createContext<BackgroundUploadContextType>({
  uploads: [],
  queueUpload: () => {},
  setUploadEntry: () => {},
  removeUploadEntry: () => {},
});

export function useBackgroundUploads() {
  return useContext(BackgroundUploadContext);
}

let uploadCounter = 0;
const MAX_CONCURRENT = 2;

export function BackgroundUploadProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<BackgroundUpload[]>([]);
  const queueRef = useRef<Array<{ id: string; file: File; userId: string; projectId: string; storagePath: string; fileName: string; mediaFileId?: string }>>([]);
  const activeCountRef = useRef(0);

  const setUploadEntry = useCallback((entry: BackgroundUpload) => {
    setUploads(prev => {
      const idx = prev.findIndex(u => u.id === entry.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = entry;
        return next;
      }
      return [...prev, entry];
    });
  }, []);

  const removeUploadEntry = useCallback((id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  const processNext = useCallback(() => {
    while (activeCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;
      activeCountRef.current++;

      setUploads((prev) =>
        prev.map((u) => (u.id === item.id ? { ...u, phase: "uploading_original" as const, label: "Uploading original..." } : u))
      );

      (async () => {
        try {
          const { error } = await supabase.storage
            .from("media")
            .upload(item.storagePath, item.file, { upsert: true });

          if (error) throw error;

          // Update media_files row with original storage_path and status
          const updateFilter = item.mediaFileId
            ? supabase.from("media_files").update({ storage_path: item.storagePath, status: "ready" } as any).eq("id", item.mediaFileId)
            : supabase.from("media_files").update({ storage_path: item.storagePath, status: "ready" } as any)
                .eq("project_id", item.projectId)
                .eq("file_name", item.fileName)
                .eq("user_id", item.userId);
          await updateFilter;

          // Recalculate profiles.storage_used_bytes from actual media_files
          await supabase.rpc("update_storage_used", { p_user_id: item.userId });

          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id ? { ...u, progress: 100, phase: "complete" as const, label: "Ready" } : u
            )
          );
        } catch (err) {
          console.error("Background upload error:", err);
          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id ? { ...u, phase: "error" as const, label: "Upload failed" } : u
            )
          );
        } finally {
          activeCountRef.current--;
          processNext();
        }
      })();

      // Simulate progress for active upload
      let prog = 0;
      const estimatedMs = (item.file.size / (6.25 * 1024 * 1024)) * 1000;
      const intervalMs = Math.max(200, estimatedMs / 50);
      const interval = setInterval(() => {
        prog += 2;
        if (prog >= 95) {
          clearInterval(interval);
          return;
        }
        setUploads((prev) =>
          prev.map((u) =>
            u.id === item.id && u.phase === "uploading_original"
              ? { ...u, progress: Math.min(prog, 95) }
              : u
          )
        );
      }, intervalMs);
    }
  }, []);

  const queueUpload = useCallback(
    ({ file, userId, projectId, storagePath, fileName, mediaFileId }: {
      file: File; userId: string; projectId: string; storagePath: string; fileName: string; mediaFileId?: string;
    }) => {
      const id = `bg-${++uploadCounter}`;
      setUploads((prev) => [
        ...prev,
        { id, fileName, progress: 0, phase: "queued", label: "Queued..." },
      ]);
      queueRef.current.push({ id, file, userId, projectId, storagePath, fileName, mediaFileId });
      processNext();
    },
    [processNext]
  );

  // Auto-clean completed uploads after 3 seconds
  const activeUploads = uploads.filter((u) => u.phase === "uploading_original" || u.phase === "uploading_proxy" || u.phase === "transcoding" || u.phase === "queued");
  if (uploads.length > 0 && activeUploads.length === 0) {
    setTimeout(() => {
      setUploads((prev) => {
        const stillActive = prev.some((u) => u.phase === "uploading_original" || u.phase === "uploading_proxy" || u.phase === "transcoding" || u.phase === "queued");
        if (!stillActive) {
          if (prev.length > 0) {
            toast.success("✓ All files processed.");
          }
          return [];
        }
        return prev;
      });
    }, 3000);
  }

  return (
    <BackgroundUploadContext.Provider value={{ uploads, queueUpload, setUploadEntry, removeUploadEntry }}>
      {children}
    </BackgroundUploadContext.Provider>
  );
}
