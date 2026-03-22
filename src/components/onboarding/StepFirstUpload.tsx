import { useState, useRef } from "react";
import { Upload, LinkIcon, ArrowRight, Film, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  primaryUse: string | null;
  onNext: () => void;
}

export default function StepFirstUpload({ primaryUse, onNext }: Props) {
  const [tab, setTab] = useState<"upload" | "youtube">(
    primaryUse === "official_video" ? "youtube" : "upload"
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div>
        <p className="text-[10px] font-mono text-primary tracking-widest mb-2">STEP 3 OF 4</p>
        <h2 className="text-2xl font-display text-foreground tracking-wider">
          UPLOAD YOUR FIRST ASSET
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {primaryUse === "raw_footage"
            ? "Drop your raw footage and song file."
            : primaryUse === "official_video"
            ? "Drop your finished video or paste a YouTube link."
            : "Upload footage or paste a YouTube link to get started."}
        </p>
      </div>

      {/* Tabs */}
      {(primaryUse === "both" || primaryUse === "official_video") && (
        <div className="flex gap-2">
          <button
            onClick={() => setTab("upload")}
            className={cn(
              "flex-1 py-2.5 rounded-lg border text-xs font-mono transition-colors",
              tab === "upload"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground"
            )}
          >
            <Upload className="w-3.5 h-3.5 inline mr-1.5" />File Upload
          </button>
          <button
            onClick={() => setTab("youtube")}
            className={cn(
              "flex-1 py-2.5 rounded-lg border text-xs font-mono transition-colors",
              tab === "youtube"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground"
            )}
          >
            <LinkIcon className="w-3.5 h-3.5 inline mr-1.5" />YouTube Link
          </button>
        </div>
      )}

      {tab === "upload" ? (
        <div className="border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-primary/30 transition-colors">
          <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium">
            {primaryUse === "raw_footage" ? "Drop footage + song" : "Drop your video"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">MP4, MOV or M4V · Max 2GB</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            placeholder="https://youtube.com/watch?v=..."
            className="bg-background text-base"
          />
          <p className="text-[11px] text-muted-foreground">
            Paste any YouTube music video link. Max 20 minutes.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onNext}
        >
          Skip for now
        </Button>
        <Button
          className="flex-1"
          onClick={onNext}
        >
          Continue <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
