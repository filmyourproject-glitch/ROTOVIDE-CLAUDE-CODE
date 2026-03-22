import { useState, useEffect } from "react";
import { StorageMeter } from "@/components/storage/StorageMeter";
import { getStorageLimit } from "@/lib/storageLimits";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDrive } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface ProjectStorageRow {
  id: string;
  name: string;
  perfBytes: number;
  brollBytes: number;
  exportBytes: number;
}

export default function StoragePage() {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<ProjectStorageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const totalBytes = getStorageLimit(profile?.plan);
  const [computedUsedBytes, setComputedUsedBytes] = useState(0);
  const usedBytes = computedUsedBytes || (profile?.storage_used_bytes ?? 0);
  const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      const [projectsRes, mediaRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name")
          .eq("user_id", user.id)
          .eq("status", "active"),
        supabase
          .from("media_files")
          .select("project_id, file_type, size_bytes")
          .eq("user_id", user.id)
          .is("deleted_at", null),
      ]);

      const projects = projectsRes.data ?? [];
      const media = mediaRes.data ?? [];

      const mapped: ProjectStorageRow[] = projects.map((p) => {
        const files = media.filter((m) => m.project_id === p.id);
        const sum = (type: string) =>
          files.filter((f) => f.file_type === type).reduce((a, f) => a + (f.size_bytes ?? 0), 0);
        return {
          id: p.id,
          name: p.name,
          perfBytes: sum("performance_clip"),
          brollBytes: sum("broll_clip"),
          exportBytes: sum("export"),
        };
      });
      setRows(mapped);
      // Compute real total from media_files in case profiles.storage_used_bytes is stale
      const realTotal = media.reduce((a, f) => a + (f.size_bytes ?? 0), 0);
      setComputedUsedBytes(realTotal);
      setLoading(false);
    };
    fetch();
  }, [user]);

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-foreground">Storage</h1>

      {/* Donut chart + meter */}
      <div className="surface-card shadow-card p-8 flex flex-col items-center gap-6">
        <div className="relative w-40 h-40">
          <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
            <circle cx="80" cy="80" r="70" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
            <circle
              cx="80" cy="80" r="70" fill="none" stroke="hsl(var(--primary))" strokeWidth="12"
              strokeDasharray={`${Math.min(percent, 100) / 100 * 440} 440`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{formatBytes(usedBytes)}</span>
            <span className="text-xs text-muted-foreground">used</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          of {formatBytes(totalBytes)} total ({profile?.plan === "pro" ? "Pro Plan" : profile?.plan === "pro_trial" ? "Pro Trial" : "Free Plan"})
        </p>
      </div>

      {/* Projects storage table */}
      <div className="surface-card shadow-card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-5 w-1/4" />
                <Skeleton className="h-5 w-1/6" />
                <Skeleton className="h-5 w-1/6" />
                <Skeleton className="h-5 w-1/6" />
                <Skeleton className="h-5 w-1/6" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon={HardDrive}
              title="No files uploaded yet"
              description="Upload media to a project to see storage usage."
            />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Project</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Performance</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">B-Roll</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Exports</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const total = r.perfBytes + r.brollBytes + r.exportBytes;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{r.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatBytes(r.perfBytes)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatBytes(r.brollBytes)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatBytes(r.exportBytes)}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium">{formatBytes(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
