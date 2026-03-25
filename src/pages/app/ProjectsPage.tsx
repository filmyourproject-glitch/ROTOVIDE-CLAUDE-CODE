import { Link, useNavigate } from "react-router-dom";
import { Plus, Film, Search, MoreHorizontal, Archive, Trash2, RotateCcw, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import { SyncStatusBadge, FormatBadge, StyleBadge } from "@/components/projects/Badges";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { DeleteConfirmSheet, ProjectActionsMenu } from "@/components/projects/ProjectActions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Project } from "@/types";

/* ── Swipeable Row (mobile only) ── */
function SwipeableRow({
  children,
  onArchive,
  onDelete,
  isArchived,
}: {
  children: React.ReactNode;
  onArchive: () => void;
  onDelete: () => void;
  isArchived: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const [offset, setOffset] = useState(0);
  const swiping = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    swiping.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping.current) return;
    currentX.current = e.touches[0].clientX;
    const diff = startX.current - currentX.current;
    const clamped = Math.max(0, Math.min(diff, 160));
    setOffset(clamped);
  };

  const handleTouchEnd = () => {
    swiping.current = false;
    setOffset(offset > 80 ? 160 : 0);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Action buttons behind */}
      <div className="absolute right-0 top-0 bottom-0 flex" style={{ width: 160 }}>
        <button
          onClick={onArchive}
          className="flex-1 flex items-center justify-center text-foreground"
          style={{ background: '#333' }}
        >
          {isArchived ? <RotateCcw className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
        </button>
        <button
          onClick={onDelete}
          className="flex-1 flex items-center justify-center"
          style={{ background: '#FF4747', color: '#080808' }}
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
      {/* Content */}
      <div
        ref={rowRef}
        className="relative bg-card transition-transform"
        style={{ transform: `translateX(-${offset}px)`, transitionDuration: swiping.current ? '0ms' : '200ms' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "active" | "archived">("all");
  const tabs = ["all", "active", "archived"] as const;
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sortBy, setSortBy] = useState<"created_at" | "last_activity_at" | "name" | "sync_status">("created_at");

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to fetch projects:", error);
    } else {
      setProjects((data as unknown as Project[]) || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleArchive = async (projectId: string, currentStatus: string) => {
    if (!user) return;
    const newStatus = currentStatus === "archived" ? "active" : "archived";
    const { error } = await supabase
      .from("projects")
      .update({ status: newStatus })
      .eq("id", projectId)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Failed to update project.");
    } else {
      toast.success(newStatus === "archived" ? "Project archived." : "Project restored.");
      fetchProjects();
    }
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    await supabase.from("media_files").delete().eq("project_id", deleteTarget).eq("user_id", user.id);
    await supabase.from("exports").delete().eq("project_id", deleteTarget).eq("user_id", user.id);
    const { error } = await supabase.from("projects").delete().eq("id", deleteTarget).eq("user_id", user.id);
    setDeleting(false);
    if (error) {
      toast.error("Failed to delete project.");
    } else {
      toast.success("Project deleted.");
      setDeleteTarget(null);
      fetchProjects();
    }
  };

  const filtered = projects
    .filter((p) => {
      const matchesSearch =
        (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.artist_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.song_title || "").toLowerCase().includes(search.toLowerCase());
      const matchesTab = tab === "all" || p.status === tab;
      return matchesSearch && matchesTab;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        case "last_activity_at":
          return new Date(b.last_activity_at || b.created_at).getTime() - new Date(a.last_activity_at || a.created_at).getTime();
        case "sync_status": {
          const order: Record<string, number> = { ready: 0, processing: 1, pending: 2, failed: 3 };
          return (order[a.sync_status] ?? 4) - (order[b.sync_status] ?? 4);
        }
        case "created_at":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const renderRow = (p: Project) => {
    if (isMobile) {
      return (
        <tr key={p.id} className="border-b border-border last:border-0">
          <td colSpan={7} className="p-0">
            <SwipeableRow
              onArchive={() => handleArchive(p.id, p.status)}
              onDelete={() => setDeleteTarget(p.id)}
              isArchived={p.status === "archived"}
            >
              <Link to={`/app/projects/${p.id}`} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.artist_name} · {p.song_title}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <SyncStatusBadge status={p.sync_status} />
                </div>
              </Link>
            </SwipeableRow>
          </td>
        </tr>
      );
    }

    return <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/50 transition-default">
      <td className="px-4 py-3">
        <Link to={`/app/projects/${p.id}`} className="font-medium text-foreground hover:text-primary transition-default">
          {p.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{p.artist_name}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">{p.song_title}</td>
      <td className="px-4 py-3"><FormatBadge format={p.format} /></td>
      <td className="px-4 py-3 hidden md:table-cell"><StyleBadge style={p.style_preset} /></td>
      <td className="px-4 py-3"><SyncStatusBadge status={p.sync_status} /></td>
      <td className="px-4 py-3">
        <ProjectActionsMenu
          projectId={p.id}
          projectStatus={p.status}
          onStatusChange={fetchProjects}
        />
      </td>
    </tr>;
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Projects</h1>
        <Link to="/app/projects/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" /> New Project
          </Button>
        </Link>
      </div>

      {/* Search + Sort + Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[170px] bg-card">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Date Created</SelectItem>
            <SelectItem value="last_activity_at">Last Activity</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="sync_status">Sync Status</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1 bg-card rounded-lg p-1 border border-border">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-default capitalize ${
                tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="surface-card shadow-card p-6 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface-card shadow-card">
          <EmptyState
            icon={Film}
            title={tab === "archived" ? "No archived projects" : "No projects yet"}
            description={tab === "archived" ? "Archive a project to see it here." : "Upload your song and footage — we handle the sync."}
            action={
              tab !== "archived" ? (
                <Link to="/app/projects/new">
                  <Button>Create Your First Project</Button>
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="surface-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              {!isMobile && (
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Project</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Artist</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">Song</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Format</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Style</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
              )}
              <tbody>
                {filtered.map(renderRow)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Swipe hint for mobile */}
      {isMobile && filtered.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">Swipe left on a project for more options</p>
      )}

      <DeleteConfirmSheet
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
