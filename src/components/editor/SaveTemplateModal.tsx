import { useState } from "react";
import { Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface SaveTemplateModalProps {
  open: boolean;
  onClose: () => void;
  settings: {
    colorGrade?: string;
    colorGradeIntensity?: number;
    captionStyle?: string;
    captionSize?: string;
    captionPosition?: string;
    format?: string;
    stylePreset?: string;
  };
}

export function SaveTemplateModal({ open, onClose, settings }: SaveTemplateModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("edit_templates").insert({
        user_id: user.id,
        name: name.trim(),
        settings,
      });
      if (error) throw error;
      toast.success("Template saved!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const settingsList = Object.entries(settings)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({
      label: k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
      value: String(v),
    }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-md"
        style={{ background: "#0d0d0d", border: "1px solid rgba(242,237,228,0.08)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground font-display tracking-wider">
            SAVE AS TEMPLATE
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <p className="text-sm" style={{ color: "rgba(242,237,228,0.5)" }}>
            Save your current settings to reuse on future projects.
          </p>

          {/* Settings preview */}
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.06)" }}
          >
            {settingsList.map((s) => (
              <div key={s.label} className="flex justify-between text-xs">
                <span style={{ color: "rgba(242,237,228,0.4)" }}>{s.label}</span>
                <span style={{ color: "rgba(242,237,228,0.7)" }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Name input */}
          <Input
            placeholder="Template name (e.g., Worship Sunday)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              background: "#131313",
              border: "1px solid rgba(242,237,228,0.08)",
              color: "#F2EDE4",
            }}
          />

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              Skip
            </Button>
            <Button
              className="flex-1 gap-2"
              disabled={!name.trim() || saving}
              onClick={handleSave}
              style={{ background: "#E8FF47", color: "#080808" }}
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
