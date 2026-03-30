import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "./StatusBadge";
import { updateWaitlistNotes, updateWaitlistStatus, type WaitlistRow } from "@/lib/admin/queries";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Props {
  row: WaitlistRow | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function WaitlistDetailPanel({ row, open, onClose, onUpdate }: Props) {
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [saving, setSaving] = useState(false);

  if (!row) return null;

  const saveNotes = async () => {
    setSaving(true);
    await updateWaitlistNotes(row.id, notes);
    setSaving(false);
    toast.success("Notes saved");
    onUpdate();
  };

  const setStatus = async (status: string) => {
    await updateWaitlistStatus(row.id, status);
    toast.success(`Status set to ${status}`);
    onUpdate();
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[420px] overflow-y-auto"
        style={{ background: "#0d0d0d", borderLeft: "1px solid rgba(242,237,228,0.08)" }}
      >
        <SheetHeader>
          <SheetTitle className="text-foreground">{row.name || row.email}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Status */}
          <div>
            <Label>Status</Label>
            <div className="mt-1">
              <StatusBadge status={row.status} />
            </div>
          </div>

          {/* Email */}
          <div>
            <Label>Email</Label>
            <p className="text-sm text-foreground">{row.email}</p>
          </div>

          {/* Name */}
          {row.name && (
            <div>
              <Label>Name</Label>
              <p className="text-sm text-foreground">{row.name}</p>
            </div>
          )}

          {/* Socials */}
          {row.instagram_url && (
            <div>
              <Label>Instagram</Label>
              <a
                href={row.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm flex items-center gap-1 hover:underline"
                style={{ color: "#E8FF47" }}
              >
                {row.instagram_url} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          {row.tiktok_url && (
            <div>
              <Label>TikTok</Label>
              <a
                href={row.tiktok_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm flex items-center gap-1 hover:underline"
                style={{ color: "#E8FF47" }}
              >
                {row.tiktok_url} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Mission */}
          {row.mission && (
            <div>
              <Label>Mission</Label>
              <p className="text-sm text-foreground/80 leading-relaxed">{row.mission}</p>
            </div>
          )}

          {/* Signed up */}
          <div>
            <Label>Signed Up</Label>
            <p className="text-sm text-foreground/50">
              {row.created_at
                ? formatDistanceToNow(new Date(row.created_at), { addSuffix: true })
                : "Unknown"}
            </p>
          </div>

          {/* Notes */}
          <div>
            <Label>Admin Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this applicant..."
              className="mt-1 min-h-[100px]"
              style={{
                background: "#131313",
                border: "1px solid rgba(242,237,228,0.08)",
                color: "#F2EDE4",
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={saveNotes}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Notes"}
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t" style={{ borderColor: "rgba(242,237,228,0.08)" }}>
            <Button
              size="sm"
              className="flex-1"
              style={{ background: "#4ade80", color: "#080808" }}
              onClick={() => setStatus("approved")}
              disabled={row.status === "approved"}
            >
              Approve
            </Button>
            <Button
              size="sm"
              className="flex-1"
              style={{ background: "#FF4747", color: "#fff" }}
              onClick={() => setStatus("rejected")}
              disabled={row.status === "rejected"}
            >
              Reject
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs font-mono tracking-wider uppercase block mb-1"
      style={{ color: "rgba(242,237,228,0.4)" }}
    >
      {children}
    </span>
  );
}
