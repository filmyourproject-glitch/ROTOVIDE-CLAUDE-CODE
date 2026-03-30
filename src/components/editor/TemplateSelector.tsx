import { useEffect, useState } from "react";
import { Layers, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Template {
  id: string;
  name: string;
  settings: Record<string, any>;
  created_at: string;
}

interface TemplateSelectorProps {
  onSelect: (settings: Record<string, any>) => void;
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("edit_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setTemplates(data as Template[]);
      });
  }, [user]);

  if (templates.length === 0) return null;

  return (
    <div className="space-y-3">
      <label
        className="text-xs font-mono tracking-widest uppercase block"
        style={{ color: "rgba(242,237,228,0.45)" }}
      >
        <Layers className="w-3 h-3 inline mr-1.5" />
        My Templates
      </label>
      <div className="flex gap-2 flex-wrap">
        {/* Start Fresh */}
        <button
          onClick={() => {
            setSelected(null);
            onSelect({});
          }}
          className="px-4 py-2 rounded-lg text-xs font-mono transition-all"
          style={{
            background: selected === null ? "rgba(232,255,71,0.08)" : "rgba(242,237,228,0.03)",
            border: `1px solid ${selected === null ? "rgba(232,255,71,0.2)" : "rgba(242,237,228,0.06)"}`,
            color: selected === null ? "#E8FF47" : "rgba(242,237,228,0.5)",
          }}
        >
          <Plus className="w-3 h-3 inline mr-1" />
          Start Fresh
        </button>

        {/* Saved templates */}
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setSelected(t.id);
              onSelect(t.settings);
            }}
            className="px-4 py-2 rounded-lg text-xs font-mono transition-all"
            style={{
              background: selected === t.id ? "rgba(232,255,71,0.08)" : "rgba(242,237,228,0.03)",
              border: `1px solid ${selected === t.id ? "rgba(232,255,71,0.2)" : "rgba(242,237,228,0.06)"}`,
              color: selected === t.id ? "#E8FF47" : "rgba(242,237,228,0.5)",
            }}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
