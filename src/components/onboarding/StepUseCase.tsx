import { Film, Scissors } from "lucide-react";

export default function StepUseCase({ onSelect }: { onSelect: (use: string) => void }) {
  const options = [
    {
      id: "raw_footage",
      icon: Film,
      title: "Generate a music video",
      desc: "Upload raw footage + your song. AI cuts it to the beat.",
    },
    {
      id: "official_video",
      icon: Scissors,
      title: "Cut my official video into clips",
      desc: "Drop your finished video or YouTube link. Get Reels, TikToks, Shorts.",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-display text-foreground tracking-wider">
          WHAT DO YOU WANT TO DO FIRST?
        </h2>
        <p className="text-sm text-muted-foreground">You can always switch later.</p>
      </div>

      <div className="space-y-4">
        {options.map(({ id, icon: Icon, title, desc }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="w-full text-left p-6 rounded border border-border bg-card hover:border-primary/30 hover:bg-primary/[0.02] transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-lg font-display text-foreground tracking-wide">{title}</p>
                <p className="text-sm text-muted-foreground mt-1">{desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
