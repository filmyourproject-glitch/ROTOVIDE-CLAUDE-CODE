import { Upload, AudioWaveform, Download, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StepHowItWorks({ onComplete }: { onComplete: () => void }) {
  const steps = [
    { icon: Upload, title: "UPLOAD", desc: "Drop your footage and song. Any format." },
    { icon: AudioWaveform, title: "AI CUTS TO THE BEAT", desc: "BPM detected. Clips synced. Timeline built." },
    { icon: Download, title: "EXPORT & POST", desc: "Download 9:16 and 16:9. Same day." },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-display text-foreground tracking-wider">
          HERE'S HOW IT WORKS
        </h2>
      </div>

      <div className="space-y-4">
        {steps.map(({ icon: Icon, title, desc }, i) => (
          <div key={title} className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-display text-lg shrink-0">
              {i + 1}
            </div>
            <div className="pt-1">
              <p className="font-display text-foreground tracking-wide">{title}</p>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center">
        <Button size="lg" className="text-base px-10 py-6" onClick={onComplete}>
          Got It — Let's Create <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
