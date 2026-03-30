import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Crop, Play, Pause, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessingProgress } from "@/components/shared/ProcessingProgress";
import { supabase } from "@/integrations/supabase/client";
import { uploadToMux } from "@/lib/muxUploader";
import { useAuth } from "@/hooks/useAuth";

type Step = "input" | "uploading" | "tracking" | "preview" | "done";
type OutputFormat = "9:16" | "1:1" | "4:5";

export default function ReframePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  const [step, setStep] = useState<Step>("input");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>("9:16");
  const [trackingProgress, setTrackingProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [faceKeyframes, setFaceKeyframes] = useState<any[]>([]);
  const [currentPosition, setCurrentPosition] = useState("50% 30%");

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
    if (!file || !user) return;
    setStep("uploading");
    setUploadProgress(0);

    try {
      // Create project
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: file.name.replace(/\.[^.]+$/, ""),
          type: "ai_reframe",
          status: "active",
          sync_status: "pending",
        } as any)
        .select("id")
        .single();

      if (projErr || !project) throw new Error("Failed to create project");

      // Get Mux upload URL
      const { data: muxData, error: muxErr } = await supabase.functions.invoke(
        "create-mux-upload",
        {
          body: {
            projectId: project.id,
            fileName: file.name,
            fileType: "performance_clip",
            fileSize: file.size,
          },
        }
      );

      if (muxErr || !muxData?.uploadUrl) throw new Error("Failed to get upload URL");

      // Upload to Mux with real progress
      await uploadToMux(file, muxData.uploadUrl, (p) => {
        setUploadProgress(p.percent);
      });

      setUploadProgress(100);
      startFaceTracking();
    } catch (err) {
      console.error("Upload failed:", err);
      setStep("input");
    }
  };

  const startFaceTracking = async () => {
    setStep("tracking");
    setTrackingProgress(0);

    try {
      const { extractFaceKeyframes, smoothKeyframes } = await import("@/lib/faceTracking");
      const keyframes = await extractFaceKeyframes(file!, (progress) => {
        setTrackingProgress(Math.round(progress * 100));
      });
      const smoothed = smoothKeyframes(keyframes);
      setFaceKeyframes(smoothed);
      setStep("preview");
    } catch (err) {
      console.error("Face tracking failed:", err);
      // Fallback: center crop
      setFaceKeyframes([{ t: 0, x: 0.5, y: 0.4, confidence: 1, source: "fallback" }]);
      setStep("preview");
    }
  };

  // Sync face position during preview playback
  useEffect(() => {
    if (step !== "preview" || !videoRef.current || faceKeyframes.length === 0) return;

    const updatePosition = () => {
      const time = videoRef.current?.currentTime ?? 0;
      // Interpolate face position
      let kf = faceKeyframes[0];
      for (let i = 0; i < faceKeyframes.length - 1; i++) {
        if (faceKeyframes[i].t <= time && faceKeyframes[i + 1].t > time) {
          const t0 = faceKeyframes[i];
          const t1 = faceKeyframes[i + 1];
          const ratio = (time - t0.t) / (t1.t - t0.t);
          kf = {
            x: t0.x + (t1.x - t0.x) * ratio,
            y: t0.y + (t1.y - t0.y) * ratio,
          };
          break;
        }
        if (i === faceKeyframes.length - 2) kf = faceKeyframes[i + 1];
      }
      setCurrentPosition(`${Math.round(kf.x * 100)}% ${Math.round(kf.y * 100)}%`);
      requestAnimationFrame(updatePosition);
    };

    const raf = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(raf);
  }, [step, faceKeyframes]);

  const togglePlayPause = () => {
    if (!videoRef.current || !previewRef.current) return;
    if (playing) {
      videoRef.current.pause();
      previewRef.current.pause();
    } else {
      videoRef.current.play();
      previewRef.current.play();
    }
    setPlaying(!playing);
  };

  const syncVideos = () => {
    if (videoRef.current && previewRef.current) {
      previewRef.current.currentTime = videoRef.current.currentTime;
    }
  };

  const aspectRatios: { id: OutputFormat; label: string; ratio: string }[] = [
    { id: "9:16", label: "Vertical", ratio: "9/16" },
    { id: "1:1", label: "Square", ratio: "1/1" },
    { id: "4:5", label: "Portrait", ratio: "4/5" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/dashboard")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-display tracking-wider">AI REFRAME</h1>
          <p className="text-xs text-muted-foreground">Face-tracked crop from 16:9 to any format</p>
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
                <video
                  src={videoUrl}
                  className="max-h-48 mx-auto rounded-lg"
                  muted
                />
                <p className="text-sm font-medium text-foreground">{file?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {((file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Drop your 16:9 video here</p>
                <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM — up to 2GB</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Output format */}
          <div>
            <label className="text-xs font-mono tracking-widest uppercase block mb-3" style={{ color: "rgba(242,237,228,0.45)" }}>
              Output Format
            </label>
            <div className="flex gap-2">
              {aspectRatios.map((ar) => (
                <button
                  key={ar.id}
                  onClick={() => setFormat(ar.id)}
                  className="flex-1 py-3 rounded-xl text-center transition-all"
                  style={{
                    background: format === ar.id ? "rgba(232,255,71,0.08)" : "rgba(242,237,228,0.03)",
                    border: `1.5px solid ${format === ar.id ? "rgba(232,255,71,0.25)" : "rgba(242,237,228,0.06)"}`,
                    color: format === ar.id ? "#E8FF47" : "rgba(242,237,228,0.5)",
                  }}
                >
                  <Crop className="w-4 h-4 mx-auto mb-1" />
                  <div className="text-xs font-mono">{ar.id}</div>
                  <div className="text-[10px] mt-0.5 opacity-60">{ar.label}</div>
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
            <Crop className="w-4 h-4 mr-2" />
            START REFRAMING — 1 CREDIT
          </Button>
        </div>
      )}

      {/* Step: Uploading */}
      {step === "uploading" && (
        <ProcessingProgress
          open
          percent={uploadProgress}
          message="Uploading your video..."
        />
      )}

      {/* Step: Tracking */}
      {step === "tracking" && (
        <ProcessingProgress
          open
          percent={trackingProgress}
          message="Tracking face across every frame..."
          etaSeconds={Math.max(0, (100 - trackingProgress) * 0.5)}
        />
      )}

      {/* Step: Preview */}
      {step === "preview" && videoUrl && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Original */}
            <div>
              <label className="text-xs font-mono tracking-widest uppercase block mb-2" style={{ color: "rgba(242,237,228,0.4)" }}>
                Original (16:9)
              </label>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(242,237,228,0.08)" }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full"
                  muted
                  onTimeUpdate={syncVideos}
                  style={{ aspectRatio: "16/9", objectFit: "cover" }}
                />
              </div>
            </div>

            {/* Reframed */}
            <div>
              <label className="text-xs font-mono tracking-widest uppercase block mb-2" style={{ color: "#E8FF47" }}>
                Reframed ({format})
              </label>
              <div
                className="rounded-xl overflow-hidden mx-auto"
                style={{
                  border: "1px solid rgba(232,255,71,0.15)",
                  maxWidth: format === "9:16" ? 200 : format === "1:1" ? 280 : 240,
                }}
              >
                <video
                  ref={previewRef}
                  src={videoUrl}
                  className="w-full"
                  muted
                  style={{
                    aspectRatio: aspectRatios.find((a) => a.id === format)?.ratio,
                    objectFit: "cover",
                    objectPosition: currentPosition,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={togglePlayPause} className="gap-2">
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
            EXPORT REFRAMED VIDEO
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
            <Download className="w-7 h-7" style={{ color: "#4ade80" }} />
          </div>
          <h2 className="text-2xl font-display tracking-wider">REFRAME COMPLETE</h2>
          <p className="text-sm text-muted-foreground">Your {format} video is ready to download.</p>
          <div className="flex justify-center gap-3">
            <Button
              onClick={() => {
                setStep("input");
                setFile(null);
                setVideoUrl(null);
                setFaceKeyframes([]);
              }}
              variant="outline"
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reframe Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
