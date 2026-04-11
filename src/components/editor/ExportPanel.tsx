import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { X, Copy, Check, RefreshCw, Download, Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Section } from "@/types";

type ExportFormat = "9:16" | "16:9" | "1:1" | "highlight";
type Resolution = "720p" | "1080p" | "4k";
type SocialTab = "tiktok" | "youtube" | "instagram";

interface SocialCopy {
  tiktok: { caption: string; hashtags: string[] };
  youtube: { title: string; description: string };
  instagram: { caption: string; hashtags: string[] };
}

type RenderStep = { label: string; status: "pending" | "active" | "done" | "error" };

interface ExportPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  songTitle?: string;
  artistName?: string;
  sections: Section[];
  bpm: number;
  isPro: boolean;
  bangerStart?: number;
  bangerEnd?: number;
  hasLyrics?: boolean;
  manifestId?: string;
  onExportComplete?: () => void;
}

export function ExportPanel({
  open,
  onClose,
  projectId,
  songTitle,
  artistName,
  sections,
  bpm,
  isPro,
  bangerStart,
  bangerEnd,
  hasLyrics,
  manifestId,
  onExportComplete,
}: ExportPanelProps) {
  // Format selection
  const [selectedFormats, setSelectedFormats] = useState<ExportFormat[]>(["9:16", "16:9"]);
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [includeLyrics, setIncludeLyrics] = useState(false);

  // Social copy
  const [socialCopy, setSocialCopy] = useState<SocialCopy | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialTab, setSocialTab] = useState<SocialTab>("tiktok");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Export progress
  const [exporting, setExporting] = useState(false);
  const [renderSteps, setRenderSteps] = useState<RenderStep[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [activeExportId, setActiveExportId] = useState<string | null>(null);
  // Track last seen status to avoid duplicate toasts from realtime + polling both firing
  const lastStatusRef = useRef<string | null>(null);

  // Granular progress from Railway (Phase 4)
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStep, setProgressStep] = useState("");
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  // Shared handler for export status changes (used by both realtime and polling)
  const applyStatusUpdate = useCallback((status: string, url?: string | null) => {
    if (status === lastStatusRef.current) return;
    lastStatusRef.current = status;

    if (status === "processing") {
      setRenderSteps(prev => prev.map((s, i) =>
        i < 2 ? { ...s, status: "done" } :
        i === 2 ? { ...s, status: "active" } : s
      ));
    } else if (status === "completed") {
      setDownloadUrl(url || null);
      setRenderSteps(prev => prev.map(s => ({ ...s, status: "done" as const })));
      setExporting(false);
      toast.success("Your video is ready to download!");
      onExportComplete?.();
    } else if (status === "failed") {
      setRenderSteps(prev => {
        const activeIdx = prev.findIndex(st => st.status === "active");
        return prev.map((s, i) =>
          i === activeIdx ? { ...s, status: "error" as const } : s
        );
      });
      setExporting(false);
      toast.error("Render failed — please try again.");
    }
  }, []);

  // Parse granular progress from Railway (Phase 4)
  const applyProgressUpdate = useCallback((progress: Record<string, unknown> | null) => {
    if (!progress || typeof progress !== "object") return;
    const percent = (typeof progress.percent === "number" ? progress.percent : 0);
    const eta = (typeof progress.eta_seconds === "number" ? progress.eta_seconds : null);
    const step = (typeof progress.step === "string" ? progress.step : "");

    setProgressPercent(percent);
    setEtaSeconds(eta);

    // Map Railway pipeline steps to render step indices
    const STEP_MAP: Record<string, number> = {
      rendering_segments: 2,
      concatenating: 3,
      mixing_audio: 3,
      uploading: 3,
    };
    const activeStepIdx = STEP_MAP[step] ?? 2;
    setRenderSteps(prev => prev.map((s, i) =>
      i < activeStepIdx ? { ...s, status: "done" as const } :
      i === activeStepIdx ? { ...s, status: "active" as const } : s
    ));

    if (step === "rendering_segments") {
      const done = (typeof progress.segments_done === "number" ? progress.segments_done : 0);
      const total = (typeof progress.segments_total === "number" ? progress.segments_total : 0);
      setProgressStep(total > 0 ? `Building video... (${done}/${total} clips)` : "Building video...");
    } else if (step === "concatenating") {
      setProgressStep("Joining clips...");
    } else if (step === "mixing_audio") {
      setProgressStep("Mixing audio...");
    } else if (step === "uploading") {
      setProgressStep("Uploading to cloud...");
    }
  }, []);

  // Generate social copy on panel open
  useEffect(() => {
    if (open && !socialCopy && !socialLoading) {
      generateSocialCopy();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // On panel open, recover any in-progress or stale export for this project
  useEffect(() => {
    if (!open || activeExportId) return;
    (async () => {
      const { data } = await supabase
        .from("exports")
        .select("id, status, download_url, created_at")
        .eq("project_id", projectId)
        .in("status", ["processing", "queued"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        // Check if a "queued" export is stale (>30 minutes old)
        const STALE_THRESHOLD_MS = 30 * 60 * 1000;
        const ageMs = Date.now() - new Date(data.created_at).getTime();

        if (data.status === "queued" && ageMs > STALE_THRESHOLD_MS) {
          // Mark stale queued export as failed so user sees retry button
          await supabase
            .from("exports")
            .update({ status: "failed" })
            .eq("id", data.id);
          lastStatusRef.current = "failed";
          setActiveExportId(data.id);
          setExporting(false);
          setRenderSteps([
            { label: "Settings saved", status: "done" },
            { label: "Render queued...", status: "error" },
            { label: "Building your video...", status: "pending" },
            { label: "Uploading to cloud...", status: "pending" },
            { label: "Ready to download", status: "pending" },
          ]);
          return;
        }

        // Normal recovery for recent exports
        lastStatusRef.current = data.status;
        setActiveExportId(data.id);
        setExporting(true);
        setRenderSteps([
          { label: "Settings saved", status: "done" },
          { label: "Render queued...", status: data.status === "processing" ? "done" : "active" },
          { label: "Building your video...", status: data.status === "processing" ? "active" : "pending" },
          { label: "Uploading to cloud...", status: "pending" },
          { label: "Ready to download", status: "pending" },
        ]);
      }
    })();
  }, [open, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription for export status
  useEffect(() => {
    if (!activeExportId) return;

    const channel = supabase
      .channel(`export-${activeExportId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "exports",
          filter: `id=eq.${activeExportId}`,
        },
        (payload) => {
          applyStatusUpdate(payload.new?.status, payload.new?.download_url);
          applyProgressUpdate(payload.new?.progress as Record<string, unknown> | null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeExportId, applyStatusUpdate, applyProgressUpdate]);

  // Polling fallback — catches updates if the realtime subscription drops or the
  // panel was closed and reopened while a render was in flight
  useEffect(() => {
    if (!activeExportId || !exporting) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("exports")
        .select("status, download_url, progress")
        .eq("id", activeExportId)
        .single();
      if (data) {
        applyStatusUpdate(data.status, data.download_url);
        applyProgressUpdate(data.progress as Record<string, unknown> | null);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeExportId, exporting, applyStatusUpdate]);

  const generateSocialCopy = useCallback(async () => {
    setSocialLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-copy", {
        body: { songTitle, artistName, sections, bpm },
      });
      if (error) throw error;
      setSocialCopy(data);
    } catch (err) {
      console.error("Social copy generation failed:", err);
      toast.error("Failed to generate post copy. Try again.");
    } finally {
      setSocialLoading(false);
    }
  }, [songTitle, artistName, sections, bpm]);

  const toggleFormat = (f: ExportFormat) => {
    setSelectedFormats(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    );
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleExportClick = () => {
    if (selectedFormats.length === 0) {
      toast.error("Select at least one format.");
      return;
    }
    handleExport();
  };

  const handleExport = async () => {
    lastStatusRef.current = null;
    setActiveExportId(null);
    setExporting(true);
    setDownloadUrl(null);

    // Initialize render steps
    setRenderSteps([
      { label: "Settings saved", status: "done" },
      { label: "Render queued...", status: "active" },
      { label: "Building your video...", status: "pending" },
      { label: "Uploading to cloud...", status: "pending" },
      { label: "Ready to download", status: "pending" },
    ]);

    // Create export records and deduct credits, then trigger render
    for (const fmt of selectedFormats) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) continue;

        const shouldWatermark = !isPro;

        const { data: exportRecord, error: insertError } = await supabase.from("exports").insert({
          project_id: projectId,
          user_id: user.id,
          format: fmt === "highlight" ? "9:16" : fmt,
          status: "queued",
          watermarked: shouldWatermark,
          credits_used: 1,
          manifest_id: manifestId || null,
          settings: {
            resolution,
            format: fmt,
            include_lyrics: includeLyrics,
            ...(fmt === "highlight" && bangerStart != null ? { highlight_start: bangerStart, highlight_end: bangerEnd } : {}),
          },
        }).select("id").single();

        if (insertError) {
          console.error("Failed to create export record:", insertError);
          continue;
        }

        // Deduct credit via RPC
        if (exportRecord) {
          const { data: deductResult, error: deductError } = await supabase.rpc("deduct_credit", {
            p_export_id: exportRecord.id,
            p_amount: 1,
          });

          if (deductError) {
            console.error("Credit deduction error:", deductError);
          } else if (deductResult && typeof deductResult === "object" && "success" in (deductResult as Record<string, unknown>)) {
            const result = deductResult as Record<string, unknown>;
            if (!result.success && result.error === "insufficient_credits") {
              toast.error("Not enough credits. Purchase a top-up from Billing.");
              setExporting(false);
              setRenderSteps([]);
              return;
            }
          }

          // Subscribe to this export's status updates
          setActiveExportId(exportRecord.id);

          // Trigger real render via edge function
          try {
            await supabase.functions.invoke("trigger-render", {
              body: { export_id: exportRecord.id, project_id: projectId, manifest_id: manifestId || null },
            });
            if (import.meta.env.DEV) console.log("Render triggered for export:", exportRecord.id);
          } catch (triggerErr) {
            console.error("Failed to trigger render:", triggerErr);
            toast.error("Failed to start render. Please try again.");
          }
        }
      } catch (err) {
        console.error("Failed to create export record:", err);
      }
    }
  };

  const handleRetryExport = async () => {
    if (!activeExportId) return;
    lastStatusRef.current = null;
    setExporting(true);
    setDownloadUrl(null);
    setProgressPercent(0);
    setProgressStep("");
    setEtaSeconds(null);
    setRenderSteps([
      { label: "Settings saved", status: "done" },
      { label: "Render queued...", status: "active" },
      { label: "Building your video...", status: "pending" },
      { label: "Uploading to cloud...", status: "pending" },
      { label: "Ready to download", status: "pending" },
    ]);

    // Reset the existing export row (no new credit deducted)
    await supabase
      .from("exports")
      .update({ status: "queued", download_url: null, progress: null })
      .eq("id", activeExportId);

    // Re-trigger render
    try {
      await supabase.functions.invoke("trigger-render", {
        body: { export_id: activeExportId, project_id: projectId, manifest_id: manifestId || null },
      });
      if (import.meta.env.DEV) console.log("Retry triggered for export:", activeExportId);
    } catch (err) {
      console.error("Retry trigger failed:", err);
      toast.error("Retry failed. Please try again.");
      setExporting(false);
    }
  };

  if (!open) return null;

  const FORMAT_OPTIONS: { value: ExportFormat; label: string; sub: string }[] = [
    { value: "9:16", label: "9:16", sub: "TikTok / Reels" },
    { value: "16:9", label: "16:9", sub: "YouTube" },
    { value: "1:1", label: "1:1", sub: "Square" },
    { value: "highlight", label: "60s", sub: "Highlight Reel" },
  ];

  const renderSocialCopyContent = () => {
    if (socialLoading) {
      return (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs font-mono">Generating post copy...</span>
        </div>
      );
    }
    if (!socialCopy) return null;

    const tabs: { id: SocialTab; label: string }[] = [
      { id: "tiktok", label: "TikTok" },
      { id: "youtube", label: "YouTube" },
      { id: "instagram", label: "Instagram" },
    ];

    const renderTabContent = () => {
      if (socialTab === "tiktok") {
        const fullText = `${socialCopy.tiktok.caption}\n\n${socialCopy.tiktok.hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ")}`;
        return (
          <div className="space-y-2">
            <textarea
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary/50"
              rows={4}
              value={fullText}
              readOnly
            />
            <CopyButton text={fullText} field="tiktok" />
          </div>
        );
      }
      if (socialTab === "youtube") {
        return (
          <div className="space-y-2">
            <div>
              <span className="text-[10px] font-mono text-muted-foreground mb-1 block">TITLE</span>
              <textarea
                className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary/50"
                rows={2}
                value={socialCopy.youtube.title}
                readOnly
              />
              <CopyButton text={socialCopy.youtube.title} field="yt-title" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-muted-foreground mb-1 block">DESCRIPTION</span>
              <textarea
                className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary/50"
                rows={3}
                value={socialCopy.youtube.description}
                readOnly
              />
              <CopyButton text={socialCopy.youtube.description} field="yt-desc" />
            </div>
          </div>
        );
      }
      if (socialTab === "instagram") {
        const fullText = `${socialCopy.instagram.caption}\n\n${socialCopy.instagram.hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ")}`;
        return (
          <div className="space-y-2">
            <textarea
              className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground resize-none focus:outline-none focus:border-primary/50"
              rows={4}
              value={fullText}
              readOnly
            />
            <CopyButton text={fullText} field="instagram" />
          </div>
        );
      }
      return null;
    };

    return (
      <div>
        <div className="flex gap-1 mb-3">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSocialTab(t.id)}
              className={cn(
                "flex-1 text-xs font-mono py-2 rounded-lg transition-colors",
                socialTab === t.id
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {renderTabContent()}
      </div>
    );
  };

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-mono"
    >
      {copiedField === field ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copiedField === field ? "COPIED" : "COPY"}
    </button>
  );

  return (
    <>
      {/* Backdrop — disabled while a render is in flight to prevent losing progress */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={exporting ? undefined : onClose}
        title={exporting ? "Render in progress — wait for it to complete" : undefined}
      />

      {/* Panel — drawer on desktop, bottom sheet on mobile */}
      <div
        className={cn(
          "fixed z-50 bg-background border-border overflow-y-auto",
          "md:right-0 md:top-0 md:bottom-0 md:w-[420px] md:border-l",
          "max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:max-h-[85vh] max-md:rounded-t-2xl max-md:border-t"
        )}
        style={{ background: "hsl(0 0% 4.7%)" }}
      >
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="p-5 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2
              className="text-2xl font-bold"
              style={{ fontFamily: "'Bebas Neue', sans-serif", color: "hsl(var(--primary))", letterSpacing: 2 }}
            >
              EXPORT YOUR VIDEO
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* SECTION 1 — FORMAT SELECTION */}
          <div className="space-y-3">
            <span className="text-[10px] font-mono text-muted-foreground tracking-wider">FORMAT</span>
            <div className="space-y-2">
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggleFormat(opt.value)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left",
                    selectedFormats.includes(opt.value)
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:border-primary/20"
                  )}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0",
                      selectedFormats.includes(opt.value)
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {selectedFormats.includes(opt.value) && (
                      <Check className="w-3 h-3 text-primary-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold">{opt.label}</span>
                    <span className="text-xs text-muted-foreground ml-2">{opt.sub}</span>
                  </div>
                  {opt.value === "highlight" && bangerStart != null && (
                    <span className="text-[10px] font-mono text-primary px-2 py-0.5 rounded-full bg-primary/10">
                      Auto
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Resolution */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-muted-foreground tracking-wider">RESOLUTION</span>
              <div className="flex gap-2">
                {(["720p", "1080p", "4k"] as Resolution[]).map(res => (
                  <button
                    key={res}
                    onClick={() => {
                      if (res === "4k" && !isPro) return;
                      setResolution(res);
                    }}
                    className={cn(
                      "flex-1 text-xs font-mono py-2.5 rounded-lg border transition-colors relative",
                      resolution === res
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30",
                      res === "4k" && !isPro && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {res.toUpperCase()}
                    {res === "4k" && !isPro && <Lock className="w-3 h-3 inline ml-1" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Include lyrics toggle */}
            {hasLyrics && (
              <button
                onClick={() => setIncludeLyrics(!includeLyrics)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
                  includeLyrics
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/20"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0",
                    includeLyrics ? "border-primary bg-primary" : "border-muted-foreground/30"
                  )}
                >
                  {includeLyrics && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <span className="text-sm">Burn in lyrics captions</span>
              </button>
            )}
          </div>

          {/* SECTION 2 — SOCIAL COPY */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground tracking-wider">POST COPY</span>
              <button
                onClick={generateSocialCopy}
                disabled={socialLoading}
                className="flex items-center gap-1 text-[10px] font-mono text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3 h-3", socialLoading && "animate-spin")} />
                REGENERATE
              </button>
            </div>

            <div
              className="rounded-xl border border-border p-4"
              style={{ background: "hsl(0 0% 6.7%)" }}
            >
              {renderSocialCopyContent()}
            </div>
          </div>

          {/* SECTION 3 — EXPORT BUTTON + PROGRESS */}
          <div className="space-y-3">
            {/* Progress steps — shown during and after render */}
            {renderSteps.length > 0 && (
              <div className="space-y-2">
                {renderSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {step.status === "done" && (
                      <Check className="w-4 h-4 text-success shrink-0" />
                    )}
                    {step.status === "active" && (
                      <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                    )}
                    {step.status === "pending" && (
                      <div className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" />
                    )}
                    {step.status === "error" && (
                      <X className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-sm font-mono",
                        step.status === "done" ? "text-success" :
                        step.status === "active" ? "text-primary" :
                        step.status === "error" ? "text-destructive" :
                        "text-muted-foreground"
                      )}
                    >
                      {step.status === "done" ? step.label.replace("...", " ✓") : step.label}
                    </span>
                  </div>
                ))}

                {/* Granular progress bar — Phase 4 */}
                {exporting && progressPercent > 0 && (
                  <div className="mt-3 space-y-2">
                    {/* Bar */}
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "hsl(0 0% 12%)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.min(progressPercent, 100)}%`,
                          background: "hsl(var(--primary))",
                        }}
                      />
                    </div>
                    {/* Label row */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {progressStep || "Processing..."}
                      </span>
                      <span className="text-[11px] font-mono text-primary">
                        {progressPercent}%
                        {etaSeconds != null && etaSeconds > 0 && (
                          <span className="text-muted-foreground ml-1.5">
                            ~{etaSeconds < 60 ? `${etaSeconds}s` : `${Math.ceil(etaSeconds / 60)}m`}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Download button when render is complete */}
                {downloadUrl && !exporting && renderSteps.every(s => s.status === "done") && (
                  <div className="mt-4 space-y-2">
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-primary/30 text-primary text-sm font-mono hover:bg-primary/5 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download Video
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(downloadUrl);
                        toast.success("Download link copied!");
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-muted-foreground text-xs font-mono hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Download Link
                    </button>
                  </div>
                )}

                {/* Retry button when render has failed */}
                {!exporting && renderSteps.some(s => s.status === "error") && activeExportId && (
                  <div className="mt-3 space-y-2">
                    <button
                      onClick={handleRetryExport}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-destructive/30 text-destructive text-sm font-mono hover:bg-destructive/5 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      RETRY EXPORT
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center font-mono">
                      Uses the same export — no additional credit
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* START EXPORT / EXPORT AGAIN — always visible when not actively rendering */}
            {!exporting && (
              <>
                <button
                  onClick={handleExportClick}
                  disabled={selectedFormats.length === 0}
                  className={cn(
                    "w-full py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40",
                    "bg-primary text-primary-foreground hover:shadow-[0_0_24px_hsl(var(--primary)/0.3)]"
                  )}
                  style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3, fontSize: 16 }}
                >
                  {renderSteps.length > 0 ? "EXPORT AGAIN" : "START EXPORT"}
                </button>
                {renderSteps.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center font-mono">
                    Your video will be ready in 1-3 minutes
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </>
  );
}
