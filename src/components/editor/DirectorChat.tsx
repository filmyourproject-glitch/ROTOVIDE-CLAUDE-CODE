import { useState, useRef, useEffect } from "react";
import { Send, Loader2, CheckCircle, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Section, TimelineClip } from "@/types";
import type { StylePreset } from "@/types";

interface Placement {
  beat_index: number;
  timestamp: number;
  type: "broll" | "performance";
  duration_beats: number;
  reason: string;
  effect: string;
}

interface ChatMessage {
  role: "user" | "director";
  content: string;
  placements?: Placement[];
}

interface DirectorChatProps {
  open: boolean;
  onClose: () => void;
  bpm: number;
  songDuration: number;
  stylePreset: StylePreset;
  sections: Section[];
  clips: TimelineClip[];
  beats: number[];
  onApplyPlacements: (placements: Placement[]) => void;
}

export function DirectorChat({
  open,
  onClose,
  bpm,
  songDuration,
  stylePreset,
  sections,
  clips,
  beats,
  onApplyPlacements,
}: DirectorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "director",
        content: `Ready to direct. This track is ${bpm} BPM with ${clips.filter(c => c.type === "performance").length} performance clips and ${clips.filter(c => c.type === "broll").length} B-roll clips.\n\nTell me how you want the video to feel — I'll rearrange cuts to match your vision.`,
      }]);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const perfCount = clips.filter(c => c.type === "performance").length;
      const brollCount = clips.filter(c => c.type === "broll").length;

      const { data, error } = await supabase.functions.invoke("ai-creative-director", {
        body: {
          bpm,
          songDuration,
          stylePreset,
          sections,
          performanceClipCount: perfCount,
          brollClipCount: brollCount,
          beatTimestamps: beats,
          user_message: msg,
        },
      });

      if (error || data?.error) {
        setMessages(prev => [...prev, {
          role: "director",
          content: "Something went wrong — couldn't generate directions. Try again.",
        }]);
        return;
      }

      const note = data.creative_note ?? "Here's how I'd cut this.";
      const placements: Placement[] = data.placements ?? [];

      setMessages(prev => [...prev, {
        role: "director",
        content: note + (placements.length > 0
          ? `\n\n${placements.length} cuts planned across ${songDuration.toFixed(0)}s.`
          : ""),
        placements: placements.length > 0 ? placements : undefined,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "director",
        content: "Network error. Check your connection and try again.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        className="absolute right-0 top-0 bottom-0 flex flex-col"
        style={{ width: 360, background: "hsl(0 0% 5.1%)", borderLeft: "1px solid hsl(var(--border))" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono font-semibold text-foreground">DIRECTOR CHAT</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className="max-w-[85%] rounded-lg px-3 py-2 text-sm"
                style={{
                  background: msg.role === "user"
                    ? "hsl(var(--primary) / 0.2)"
                    : "hsl(0 0% 10.2%)",
                  color: "hsl(var(--foreground))",
                  fontFamily: msg.role === "director" ? "'Space Mono', monospace" : undefined,
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.content}
                {msg.placements && msg.placements.length > 0 && (
                  <button
                    onClick={() => onApplyPlacements(msg.placements!)}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono w-full justify-center transition-colors"
                    style={{
                      background: "hsl(var(--primary) / 0.15)",
                      color: "hsl(var(--primary))",
                      border: "1px solid hsl(var(--primary) / 0.3)",
                    }}
                  >
                    <CheckCircle className="w-3 h-3" />
                    APPLY {msg.placements.length} CUTS
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-lg" style={{ background: "hsl(0 0% 10.2%)" }}>
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-3 border-t border-border shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              placeholder="Make the chorus more hype…"
              rows={2}
              disabled={loading}
              className="flex-1 resize-none rounded-lg px-3 py-2 text-sm bg-muted/40 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
              style={{ fontFamily: "'Space Mono', monospace", fontSize: 12 }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="h-10 w-10 rounded-lg flex items-center justify-center transition-colors shrink-0"
              style={{
                background: input.trim() && !loading ? "hsl(var(--primary))" : "hsl(var(--muted))",
                color: input.trim() && !loading ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
              }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </div>
  );
}
