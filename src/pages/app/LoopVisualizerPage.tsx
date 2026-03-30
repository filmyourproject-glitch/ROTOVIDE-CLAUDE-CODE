import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, CircleDot, Play, Pause, Download, RotateCcw, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessingProgress } from "@/components/shared/ProcessingProgress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Step = "input" | "uploading" | "processing" | "preview" | "done";
type LoopDuration = 6 | 10 | 15 | 30;
type OutputFormat = "1:1" | "9:16" | "16:9";
type LoopStyle = "clean" | "bounce" | "crossfade";

export default function LoopVisualizerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [step, setStep] = useState<Step>("input");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<LoopDuration>(10);
  const [format, setFormat] = useState<OutputFormat>("1:1");
  const [loopStyle, setLoopStyle] = useState<LoopStyle>("clean");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setVideoUrl(URL.createObjectURL(f));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("video/")) {
      setFile(f);
      setVideoUrl(URL.createObjectURL(f));
    }
  };

  const startProcessing = async () => {
    if (!file) return;
    setStep("uploading");
    setProgress(0);

    // Create project
    if (user) {
      await supabase.from("projects").insert({
        user_id: user.id,
        name: `Loop — ${file.name.replace(/\.[^.]+$/, "")}`,
        type: "loop_visualizer",
        status: "active",
        sync_status: "processing",
      });
    }

    // Simulate upload
    const uploadInterval = setInterval(() => {
      setProgress((p) => {
        if (p >= 50) { clearInterval(uploadInterval); return 50; }
        return p + Math.random() * 10;
      });
    }, 200);

    setTimeout(() => {
      clearInterval(uploadInterval);
      setStep("processing");
      setProgress(50);

      // Simulate processing (loop extraction)
      const processInterval = setInterval(() => {
        setProgress((p) => {
          if (p >= 100) {
            clearInterval(processInterval);
            setStep("preview");
            return 100;
          }
          return p + Math.random() * 8;
        });
      }, 300);
    }, 2500);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  };

  const durations: { value: LoopDuration; label: string; desc: string }[] = [
    { value: 6, label: "6s", desc: "Spotify Canvas" },
    { value: 10, label: "10s", desc: "Short loop" },
    { value: 15, label: "15s", desc: "Standard" },
    { value: 30, label: "30s", desc: "Extended" },
  ];

  const formats: { id: OutputFormat; label: string; platform: string }[] = [
    { id: "1:1", label: "Square", platform: "Spotify Canvas" },
    { id: "9:16", label: "Vertical", platform: "YouTube Music" },
    { id: "16:9", label: "Horizontal", platform: "Apple Music" },
  ];

  const styles: { id: LoopStyle; label: string; desc: string }[] = [
    { id: "clean", label: "Clean Loop", desc: "Seamless segment cut" },
    { id: "bounce", label: "Bounce", desc: "Forward then reverse" },
    { id: "crossfade", label: "Crossfade", desc: "Dissolve end into start" },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/dashboard")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-display tracking-wider">LOOP VISUALIZER</h1>
          <p className="text-xs text-muted-foreground">Create seamless loops for Spotify, Apple Music & YouTube Music</p>
        </div>
      </div>

      {/* Step: Input */}
      {step === "input" && (
        <div className="space-y-6">
          {/* Upload zone */}
          <div
            className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors hover:border-primary/30"
            style={{ borderColor: "rgba(242,237,228,0.12)", background: "rgba(242,237,228,0.02)" }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {videoUrl ? (
              <div className="space-y-4">
                <video src={videoUrl} className="max-h-48 mx-auto rounded-lg" muted />
                <p className="text-sm font-medium text-foreground">{file?.name}</p>
                <p className="text-xs text-muted-foreground">{((file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <>
                <CircleDot className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Drop your video here</p>
                <p className="text-xs text-muted-foreground mt-1">Any video clip — we'll turn it into a perfect loop</p>
              </>
            )}
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
          </div>

          {/* Loop duration */}
          <div>
            <label className="text-xs font-mono tracking-widest uppercase block mb-3" style={{ color: "rgba(242,237,228,0.45)" }}>
              Loop Duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {durations.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className="py-3 rounded-xl text-center transition-all"
                  style={{
                    background: duration === d.value ? "rgba(232,255,71,0.08)" : "rgba(242,237,228,0.03)",
                    border: `1.5px solid ${duration === d.value ? "rgba(232,255,71,0.25)" : "rgba(242,237,228,0.06)"}`,
                    color: duration === d.value ? "#E8FF47" : "rgba(242,237,228,0.5)",
                  }}
                >
                  <div className="text-lg font-bold font-display">{d.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-60">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Output format */}
          <div>
            <label className="text-xs font-mono tracking-widest uppercase block mb-3" style={{ color: "rgba(242,237,228,0.45)" }}>
              Output Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {formats.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className="py-3 rounded-xl text-center transition-all"
                  style={{
                    background: format === f.id ? "rgba(232,255,71,0.08)" : "rgba(242,237,228,0.03)",
                    border: `1.5px solid ${format === f.id ? "rgba(232,255,71,0.25)" : "rgba(242,237,228,0.06)"}`,
                    color: format === f.id ? "#E8FF47" : "rgba(242,237,228,0.5)",
                  }}
                >
                  <div className="text-sm font-mono">{f.id}</div>
                  <div className="text-[10px] mt-0.5 opacity-60">{f.platform}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Loop style */}
          <div>
            <label className="text-xs font-mono tracking-widest uppercase block mb-3" style={{ color: "rgba(242,237,228,0.45)" }}>
              Loop Style
            </label>
            <div className="grid grid-cols-3 gap-2">
              {styles.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setLoopStyle(s.id)}
                  className="py-3 rounded-xl text-center transition-all"
                  style={{
                    background: loopStyle === s.id ? "rgba(232,255,71,0.08)" : "rgba(242,237,228,0.03)",
                    border: `1.5px solid ${loopStyle === s.id ? "rgba(232,255,71,0.25)" : "rgba(242,237,228,0.06)"}`,
                    color: loopStyle === s.id ? "#E8FF47" : "rgba(242,237,228,0.5)",
                  }}
                >
                  <div className="text-sm font-semibold">{s.label}</div>
                  <div className="text-[10px] mt-0.5 opacity-60">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Start */}
          <Button
            className="w-full py-6 text-base font-display tracking-widest"
            disabled={!file}
            onClick={startProcessing}
            style={{ background: "#E8FF47", color: "#080808" }}
          >
            <CircleDot className="w-4 h-4 mr-2" />
            CREATE LOOP — 1 CREDIT
          </Button>
        </div>
      )}

      {/* Step: Uploading / Processing */}
      {(step === "uploading" || step === "processing") && (
        <ProcessingProgress
          open
          percent={progress}
          message={step === "uploading" ? "Uploading your video..." : "Creating your seamless loop..."}
          etaSeconds={Math.max(0, (100 - progress) * 0.3)}
        />
      )}

      {/* Step: Preview */}
      {step === "preview" && videoUrl && (
        <div className="space-y-6">
          {/* Loop preview */}
          <div
            className="rounded-2xl overflow-hidden mx-auto"
            style={{
              border: "1px solid rgba(232,255,71,0.15)",
              maxWidth: format === "9:16" ? 280 : format === "1:1" ? 400 : 560,
            }}
          >
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full"
              loop
              autoPlay
              muted
              playsInline
              style={{
                aspectRatio: format === "1:1" ? "1/1" : format === "9:16" ? "9/16" : "16/9",
                objectFit: "cover",
              }}
            />
          </div>

          {/* Info */}
          <div className="flex justify-center gap-6 text-center">
            <div>
              <div className="text-xs font-mono tracking-wider" style={{ color: "rgba(242,237,228,0.4)" }}>DURATION</div>
              <div className="text-sm font-bold" style={{ color: "#E8FF47" }}>{duration}s</div>
            </div>
            <div>
              <div className="text-xs font-mono tracking-wider" style={{ color: "rgba(242,237,228,0.4)" }}>FORMAT</div>
              <div className="text-sm font-bold" style={{ color: "#E8FF47" }}>{format}</div>
            </div>
            <div>
              <div className="text-xs font-mono tracking-wider" style={{ color: "rgba(242,237,228,0.4)" }}>STYLE</div>
              <div className="text-sm font-bold" style={{ color: "#E8FF47" }}>{loopStyle}</div>
            </div>
          </div>

          {/* Platform badges */}
          <div className="flex justify-center gap-3">
            {["Spotify", "Apple Music", "YouTube Music"].map((platform) => (
              <span
                key={platform}
                className="text-[10px] font-mono tracking-wider px-3 py-1 rounded-full"
                style={{
                  background: "rgba(232,255,71,0.04)",
                  border: "1px solid rgba(232,255,71,0.1)",
                  color: "#E8FF47",
                }}
              >
                {platform}
              </span>
            ))}
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={togglePlay} className="gap-2">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? "Pause" : "Play"}
            </Button>
          </div>

          {/* Export */}
          <Button
            className="w-full py-5 text-base font-display tracking-widest"
            onClick={() => setStep("done")}
            style={{ background: "#E8FF47", color: "#080808" }}
          >
            <Download className="w-4 h-4 mr-2" />
            DOWNLOAD LOOP
          </Button>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="text-center py-16 space-y-6">
          <div
            className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
            style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)" }}
          >
            <Music className="w-7 h-7" style={{ color: "#4ade80" }} />
          </div>
          <h2 className="text-2xl font-display tracking-wider">LOOP READY</h2>
          <p className="text-sm text-muted-foreground">
            Your {duration}s {format} loop is ready for Spotify, Apple Music, and YouTube Music.
          </p>
          <div className="flex justify-center gap-3">
            <Button
              onClick={() => {
                setStep("input");
                setFile(null);
                setVideoUrl(null);
                setProgress(0);
              }}
              variant="outline"
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Create Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
