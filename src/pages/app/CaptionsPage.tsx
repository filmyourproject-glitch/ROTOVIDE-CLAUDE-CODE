import { useState, useRef, useCallback } from "react";
import { ArrowLeft, Upload, Loader2, Check, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadToMux } from "@/lib/muxUploader";
import { LyricsCaptionOverlay } from "@/components/editor/LyricsCaptionOverlay";
import { CaptionPresetGrid } from "@/components/captions/CaptionPresetGrid";
import type { CaptionStyleExtended } from "@/lib/captionPresets";
import type { CaptionSize, CaptionPosition } from "@/lib/lyricsEngine";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Step = "upload" | "transcribing" | "preview";

const CAPTION_SIZES: CaptionSize[] = ["S", "M", "L"];
const CAPTION_POSITIONS: { id: CaptionPosition; label: string }[] = [
  { id: "bottom", label: "Bottom" },
  { id: "middle", label: "Middle" },
  { id: "top",    label: "Top" },
];

export default function CaptionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [lyricsWords, setLyricsWords] = useState<any[]>([]);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleExtended>("highlight");
  const [captionSize, setCaptionSize] = useState<CaptionSize>("M");
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>("bottom");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);

  const handleFileSelected = useCallback(async (file: File) => {
    if (!user) return;
    setStep("transcribing");
    setUploadProgress(0);

    try {
      // 1. Create a captions project
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: file.name.replace(/\.[^.]+$/, ""),
          type: "captions",
          status: "active",
          sync_status: "pending",
        } as any)
        .select("id")
        .single();

      if (projErr || !project) throw new Error("Failed to create project");
      setProjectId(project.id);

      // 2. Upload to Mux
      const { data: muxData, error: muxErr } = await supabase.functions.invoke("create-mux-upload", {
        body: {
          projectId: project.id,
          fileName: file.name,
          fileType: "performance_clip",
          fileSize: file.size,
        },
      });
      if (muxErr || !muxData?.uploadUrl) throw new Error("Failed to get upload URL");

      await uploadToMux(file, muxData.uploadUrl, (p) => setUploadProgress(p.percent));

      // Keep local object URL for browser preview
      setVideoObjectUrl(URL.createObjectURL(file));

      // 3. Trigger Whisper transcription
      const { error: transcribeErr } = await supabase.functions.invoke("transcribe-lyrics", {
        body: { projectId: project.id, audioUrl: muxData.audioUrl || muxData.uploadUrl },
      });

      if (transcribeErr) {
        console.error("Transcription error:", transcribeErr);
        toast.error("Transcription failed. Try again.");
        setStep("upload");
        return;
      }

      // 4. Fetch the transcribed words
      const { data: updatedProject } = await supabase
        .from("projects")
        .select("lyrics_data")
        .eq("id", project.id)
        .single();

      const words = (updatedProject as any)?.lyrics_data?.words || [];

      if (words.length === 0) {
        toast.error("No speech detected. Try a video with clear vocals.");
        setStep("upload");
        return;
      }

      setLyricsWords(words);
      setStep("preview");
      toast.success(`${words.length} words transcribed!`);
    } catch (err) {
      console.error("Captions upload failed:", err);
      toast.error("Something went wrong. Please try again.");
      setStep("upload");
    }
  }, [user]);

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  return (
    <div className="max-w-[680px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/dashboard")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-display text-foreground tracking-wider">AI CAPTIONS</h1>
          <p className="text-sm text-muted-foreground">Word-by-word captions. Karaoke, Highlight, or Classic.</p>
        </div>
      </div>

      {/* STEP: UPLOAD */}
      {step === "upload" && (
        <div className="space-y-5">
          {/* Caption style presets */}
          <CaptionPresetGrid selected={captionStyle} onChange={setCaptionStyle} />

          {/* Upload zone */}
          <div
            className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors hover:border-primary/30"
            style={{ borderColor: 'hsla(36, 30%, 92.2%, 0.12)' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Drop your video here</p>
            <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM · Max 20 minutes</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
            />
          </div>

          <p className="text-center text-[11px] text-muted-foreground font-mono">
            POWERED BY OPENAI WHISPER · WORD-LEVEL TIMESTAMPS
          </p>
        </div>
      )}

      {/* STEP: TRANSCRIBING */}
      {step === "transcribing" && (
        <div className="text-center py-20 space-y-4">
          <div className="relative mx-auto w-16 h-16">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
          </div>
          {uploadProgress < 100 ? (
            <>
              <p className="text-foreground font-medium">Uploading video...</p>
              <div className="w-48 mx-auto bg-muted rounded-full h-2">
                <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground font-mono">{uploadProgress}%</p>
            </>
          ) : (
            <>
              <p className="text-foreground font-medium">Transcribing audio...</p>
              <p className="text-xs text-muted-foreground">This takes 30–60 seconds depending on video length.</p>
            </>
          )}
        </div>
      )}

      {/* STEP: PREVIEW */}
      {step === "preview" && videoObjectUrl && (
        <div className="space-y-5">
          {/* Video preview with caption overlay */}
          <div className="relative rounded-2xl overflow-hidden bg-black mx-auto"
            style={{ aspectRatio: '9/16', maxHeight: 500, maxWidth: 280 }}>
            <video
              ref={videoRef}
              src={videoObjectUrl}
              className="w-full h-full object-cover"
              onTimeUpdate={handleTimeUpdate}
              onClick={() => {
                if (videoRef.current) {
                  if (isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
                  else { videoRef.current.play(); setIsPlaying(true); }
                }
              }}
              playsInline
            />
            <LyricsCaptionOverlay
              words={lyricsWords}
              currentTime={currentTime}
              visible={true}
              style={captionStyle}
              size={captionSize}
              position={captionPosition}
            />
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                  <div className="w-0 h-0 border-y-8 border-y-transparent border-l-[14px] border-l-white ml-1" />
                </div>
              </div>
            )}
          </div>

          {/* Style selector */}
          <div className="rounded-2xl border p-5 space-y-4"
            style={{ background: 'hsl(0 0% 6.7%)', borderColor: 'hsla(36, 30%, 92.2%, 0.08)' }}>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-muted-foreground tracking-widest">CAPTION STYLE</label>
              <CaptionPresetGrid selected={captionStyle} onChange={setCaptionStyle} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-muted-foreground tracking-widest">SIZE</label>
              <div className="flex gap-2">
                {CAPTION_SIZES.map(s => (
                  <button
                    key={s}
                    onClick={() => setCaptionSize(s)}
                    className={cn(
                      "flex-1 py-2 rounded-xl border text-xs font-mono transition-all",
                      captionSize === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-muted-foreground tracking-widest">POSITION</label>
              <div className="flex gap-2">
                {CAPTION_POSITIONS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setCaptionPosition(p.id)}
                    className={cn(
                      "flex-1 py-2 rounded-xl border text-xs font-mono transition-all",
                      captionPosition === p.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Export CTA */}
          <Button className="w-full py-6 text-base" onClick={() => {
            if (projectId) navigate(`/app/projects/${projectId}`);
          }}>
            <Check className="w-4 h-4 mr-2" />
            Save Captions — Open in Editor
          </Button>

          <button
            onClick={() => { setStep("upload"); setLyricsWords([]); setVideoObjectUrl(null); }}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" /> Try a different video
          </button>
        </div>
      )}
    </div>
  );
}
