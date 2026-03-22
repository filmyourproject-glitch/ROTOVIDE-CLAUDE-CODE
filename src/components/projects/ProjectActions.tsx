import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Archive, Trash2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

/* ── Delete Confirmation ── */
export function DeleteConfirmSheet({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const isMobile = useIsMobile();

  const content = (
    <div className="space-y-4 p-6">
      <h3 className="text-lg font-semibold text-foreground">Delete this project?</h3>
      <p className="text-sm text-muted-foreground">
        This will permanently delete your project, clips, and exports. This cannot be undone.
      </p>
      <div className="flex flex-col gap-2">
        <Button
          onClick={onConfirm}
          disabled={loading}
          className="w-full h-12 font-semibold text-[15px]"
          style={{ background: '#FF4747', color: '#080808' }}
        >
          {loading ? "Deleting..." : "Delete Forever"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={loading}
          className="w-full h-12 text-[15px]"
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          style={{
            background: '#1A1A1A',
            borderTop: '1px solid rgba(242,237,228,0.1)',
            borderRadius: '12px 12px 0 0',
          }}
        >
          <DrawerHeader className="sr-only">
            <DrawerTitle>Delete project</DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => onOpenChange(false)}>
      <div className="surface-card shadow-card max-w-sm w-full rounded-xl" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

/* ── Actions Menu (three-dot) ── */
export function ProjectActionsMenu({
  projectId,
  projectStatus,
  onStatusChange,
}: {
  projectId: string;
  projectStatus: string;
  onStatusChange?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showActions, setShowActions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleArchive = async () => {
    if (!user) return;
    const newStatus = projectStatus === "archived" ? "active" : "archived";
    const { error } = await supabase
      .from("projects")
      .update({ status: newStatus })
      .eq("id", projectId)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Failed to update project.");
    } else {
      toast.success(newStatus === "archived" ? "Project archived." : "Project restored.");
      if (onStatusChange) {
        onStatusChange();
      } else {
        navigate("/app/projects");
      }
    }
    setShowActions(false);
  };

  const handleDelete = async () => {
    if (!user) return;
    setDeleting(true);
    // Delete media files, exports, then project
    await supabase.from("media_files").delete().eq("project_id", projectId).eq("user_id", user.id);
    await supabase.from("exports").delete().eq("project_id", projectId).eq("user_id", user.id);
    const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("user_id", user.id);
    setDeleting(false);
    if (error) {
      toast.error("Failed to delete project.");
    } else {
      toast.success("Project deleted.");
      setShowDeleteConfirm(false);
      if (onStatusChange) {
        onStatusChange();
      } else {
        navigate("/app/projects");
      }
    }
  };

  const isArchived = projectStatus === "archived";

  const menuItems = (
    <>
      <button
        onClick={handleArchive}
        className="flex items-center gap-3 w-full px-4 text-left font-medium transition-colors hover:bg-accent/50"
        style={{ height: 56, fontSize: 15, fontFamily: "'DM Sans', sans-serif", color: '#F2EDE4' }}
      >
        {isArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
        {isArchived ? "Restore Project" : "Archive Project"}
      </button>
      <button
        onClick={() => { setShowActions(false); setShowDeleteConfirm(true); }}
        className="flex items-center gap-3 w-full px-4 text-left font-medium transition-colors hover:bg-accent/50"
        style={{ height: 56, fontSize: 15, fontFamily: "'DM Sans', sans-serif", color: '#FF4747' }}
      >
        <Trash2 className="w-4 h-4" />
        Delete Project
      </button>
    </>
  );

  if (isMobile) {
    return (
      <>
        <button onClick={() => setShowActions(true)} className="text-muted-foreground hover:text-foreground transition-default p-2">
          <MoreHorizontal className="w-5 h-5" />
        </button>
        <Drawer open={showActions} onOpenChange={setShowActions}>
          <DrawerContent
            style={{
              background: '#1A1A1A',
              borderTop: '1px solid rgba(242,237,228,0.1)',
              borderRadius: '12px 12px 0 0',
            }}
          >
            <DrawerHeader className="sr-only">
              <DrawerTitle>Project actions</DrawerTitle>
            </DrawerHeader>
            <div className="pb-6">{menuItems}</div>
          </DrawerContent>
        </Drawer>
        <DeleteConfirmSheet open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm} onConfirm={handleDelete} loading={deleting} />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground transition-default p-2">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={handleArchive}>
            {isArchived ? <RotateCcw className="w-4 h-4 mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
            {isArchived ? "Restore Project" : "Archive Project"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteConfirm(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteConfirmSheet open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm} onConfirm={handleDelete} loading={deleting} />
    </>
  );
}

/* ── Archived Banner ── */
export function ArchivedBanner({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    if (!user) return;
    setRestoring(true);
    const { error } = await supabase
      .from("projects")
      .update({ status: "active" })
      .eq("id", projectId)
      .eq("user_id", user.id);
    setRestoring(false);
    if (error) {
      toast.error("Failed to restore project.");
    } else {
      toast.success("Project restored.");
      navigate("/app/projects");
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
      <span className="text-sm text-muted-foreground">This project is archived.</span>
      <Button size="sm" variant="outline" onClick={handleRestore} disabled={restoring}>
        {restoring ? "Restoring..." : "Restore"}
      </Button>
    </div>
  );
}
