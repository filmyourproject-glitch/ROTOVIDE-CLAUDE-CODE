import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, CheckCircle, X, Sparkles, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Section, TimelineClip } from "@/types";
import type { StylePreset } from "@/types";
import type { EditManifest } from "@/lib/editManifest";
import { getManifestStats } from "@/lib/manifestInterpreter";

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
  manifest?: EditManifest;
  changes?: string[];
}

interface DirectorChatProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  bpm: number;
  songDuration: number;
  stylePreset: StylePreset;
  sections: Section[];
  clips: TimelineClip[];
  beats: number[];
  onApplyPlacements: (placements: Placement[]) => void;
  onApplyManifest?: (manifest: EditManifest) => void;
  activeManifest?: EditManifest | null;
}

export function DirectorChat({
  open,
  onClose,
  projectId,
  bpm,
  songDuration,
  stylePreset,
  sections,
  clips,
  beats,
  onApplyPlacements,
  onApplyManifest,
  activeManifest,
}: DirectorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Phase 5: Video indexing status
  const [indexingStatus, setIndexingStatus] = useState<
    "idle" | "checking" | "indexing" | "ready"
  >("idle");
  const [indexingProgress, setIndexingProgress] = useState({ total: 0, ready: 0 });
  const greetingSent = useRef(false);

  // Phase 5: Check + trigger video indexing when chat opens
  useEffect(() => {
    if (!open || !projectId) return;

    let cancelled = false;
    setIndexingStatus("checking");

    (async () => {
      // Get all video media_files for this project (exclude songs)
      const { data: mediaFiles } = await supabase
        .from("media_files")
        .select("id, file_type, mux_playback_id")
        .eq("project_id", projectId)
        .neq("file_type", "song")
        .is("deleted_at", null);

      if (cancelled || !mediaFiles?.length) {
        setIndexingStatus("ready");
        setIndexingProgress({ total: 0, ready: 0 });
        return;
      }

      // Only consider clips that have a Mux playback ID (upload complete)
      const videoFileIds = mediaFiles
        .filter((f) => f.mux_playback_id)
        .map((f) => f.id);

      if (videoFileIds.length === 0) {
        setIndexingStatus("ready");
        setIndexingProgress({ total: 0, ready: 0 });
        return;
      }

      // Check existing indexes
      const { data: indexes } = await supabase
        .from("video_indexes")
        .select("media_file_id, status")
        .eq("project_id", projectId);

      const indexMap = new Map(
        (indexes ?? []).map((i: { media_file_id: string; status: string }) => [
          i.media_file_id,
          i.status,
        ])
      );

      const needsIndexing = videoFileIds.filter(
        (id) =>
          !indexMap.has(id) ||
          indexMap.get(id) === "pending" ||
          indexMap.get(id) === "failed"
      );
      const readyCount = videoFileIds.filter(
        (id) => indexMap.get(id) === "ready"
      ).length;

      setIndexingProgress({ total: videoFileIds.length, ready: readyCount });

      if (needsIndexing.length === 0) {
        setIndexingStatus("ready");
        return;
      }

      if (cancelled) return;
      setIndexingStatus("indexing");

      // Trigger indexing for unindexed clips (non-blocking — results come via Realtime)
      try {
        await supabase.functions.invoke("index-video", {
          body: { media_file_ids: needsIndexing },
        });
      } catch (err) {
        console.error("[DirectorChat] Video indexing trigger failed:", err);
        // Don't block chat — just proceed without full visual context
        setIndexingStatus("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  // Phase 5: Realtime subscription for indexing progress
  useEffect(() => {
    if (indexingStatus !== "indexing" || !projectId) return;

    const channel = supabase
      .channel(`video-indexes-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "video_indexes",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newStatus = (payload.new as { status?: string })?.status;
          if (newStatus === "ready") {
            setIndexingProgress((prev) => ({
              ...prev,
              ready: prev.ready + 1,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [indexingStatus, projectId]);

  // Phase 5: Auto-transition to "ready" when all clips indexed
  useEffect(() => {
    if (
      indexingStatus === "indexing" &&
      indexingProgress.total > 0 &&
      indexingProgress.ready >= indexingProgress.total
    ) {
      setIndexingStatus("ready");
    }
  }, [indexingStatus, indexingProgress]);

  // Greeting message — updated to reflect visual awareness
  useEffect(() => {
    if (!open || greetingSent.current) return;

    // Wait until indexing status resolves from "checking"
    if (indexingStatus === "checking" || indexingStatus === "idle") return;

    greetingSent.current = true;

    const perfCount = clips.filter((c) => c.type === "performance").length;
    const brollCount = clips.filter((c) => c.type === "broll").length;
    const visualNote =
      indexingStatus === "ready" && indexingProgress.total > 0
        ? ` I've analyzed your footage and can reference specific shots, outfits, and locations.`
        : "";
    const refineNote = activeManifest
      ? `\n\nYou have an active edit — ask me to refine specific parts (e.g. "make the chorus cuts faster" or "swap the clip at 0:45").`
      : "";

    setMessages([
      {
        role: "director",
        content: `Ready to direct. This track is ${bpm} BPM with ${perfCount} performance clips and ${brollCount} B-roll clips.${visualNote}\n\nTell me how you want the video to feel — I'll rearrange cuts to match your vision.${refineNote}`,
      },
    ]);
  }, [open, indexingStatus, indexingProgress.total, bpm, clips, activeManifest]);

  // Reset greeting flag when chat closes
  useEffect(() => {
    if (!open) {
      greetingSent.current = false;
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const perfCount = clips.filter(c => c.type === "performance").length;
      const brollCount = clips.filter(c => c.type === "broll").length;

      // Build media_resources from clips (unique clip_ids with type)
      const seen = new Set<string>();
      const mediaResources: { id: string; type: string; duration: number }[] = [];
      for (const c of clips) {
        if (!seen.has(c.clip_id)) {
          seen.add(c.clip_id);
          mediaResources.push({
            id: c.clip_id,
            type: c.type,
            duration: c.end - c.start,
          });
        }
      }

      // Build conversation history for threading (exclude initial greeting)
      const conversationHistory = messages
        .filter((m, i) => !(i === 0 && m.role === "director" && !m.placements && !m.manifest))
        .map(m => ({ role: m.role, content: m.content }));

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
          project_id: projectId,
          media_resources: mediaResources,
          conversation_history: conversationHistory,
          output_format: "manifest",
          // Phase 6: Send current manifest for incremental refinement
          current_manifest: activeManifest ?? undefined,
        },
      });

      if (error || data?.error) {
        setMessages(prev => [...prev, {
          role: "director",
          content: "Something went wrong — couldn't generate directions. Try again.",
        }]);
        return;
      }

      // Handle manifest-based response
      if (data.manifest) {
        const manifest = data.manifest as EditManifest;
        const stats = getManifestStats(manifest);
        const note = data.creative_note ?? "Here's how I'd cut this.";
        const changes: string[] | undefined = data.changes;

        // Build content — show changes if this was an incremental refinement
        let content = note;
        if (changes?.length) {
          content += "\n\nChanges:\n" + changes.map((c: string) => `• ${c}`).join("\n");
        }
        content += `\n\n${stats.cutCount} clips · ${stats.effectCount} effects · ${Math.round(stats.confidence * 100)}% confidence`;

        setMessages(prev => [...prev, {
          role: "director",
          content,
          manifest,
          placements: data.placements,
          changes,
        }]);
        return;
      }

      // Legacy placements fallback
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

        {/* Phase 5: Indexing status banner */}
        {(indexingStatus === "checking" || indexingStatus === "indexing") && (
          <div
            className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0"
            style={{ background: "hsl(var(--primary) / 0.05)" }}
          >
            <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
            <span className="text-[11px] font-mono text-primary">
              {indexingStatus === "checking"
                ? "Checking footage..."
                : `Analyzing footage (${indexingProgress.ready}/${indexingProgress.total})...`}
            </span>
          </div>
        )}
        {indexingStatus === "ready" &&
          indexingProgress.total > 0 &&
          messages.length <= 1 && (
            <div
              className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0"
              style={{ background: "hsl(var(--primary) / 0.03)" }}
            >
              <Eye className="w-3 h-3 text-primary shrink-0" />
              <span className="text-[11px] font-mono text-muted-foreground">
                {indexingProgress.total} clips analyzed — I can see your footage
              </span>
            </div>
          )}

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

                {/* Manifest-based APPLY button (preferred) */}
                {msg.manifest && onApplyManifest && (
                  <button
                    onClick={() => onApplyManifest(msg.manifest!)}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono w-full justify-center transition-colors"
                    style={{
                      background: "hsl(var(--primary) / 0.15)",
                      color: "hsl(var(--primary))",
                      border: "1px solid hsl(var(--primary) / 0.3)",
                    }}
                  >
                    <CheckCircle className="w-3 h-3" />
                    APPLY EDIT
                  </button>
                )}

                {/* Legacy placements APPLY button (fallback when no manifest) */}
                {!msg.manifest && msg.placements && msg.placements.length > 0 && (
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
