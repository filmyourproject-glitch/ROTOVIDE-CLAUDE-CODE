import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, X, ChevronDown, Menu, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RotovideLogo } from "@/components/ui/RotovideLogo";
import { supabase } from "@/integrations/supabase/client";

/* ───────────────────── Fade-in on scroll hook ───────────────────── */
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, className: cn("transition-all duration-700", visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8") };
}

/* ───────────────────── Navbar ───────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav className={cn(
      "fixed top-0 inset-x-0 z-50 transition-all duration-300",
      scrolled ? "backdrop-blur-xl" : ""
    )} style={{
      background: scrolled ? 'rgba(8,8,8,0.85)' : 'transparent',
      borderBottom: scrolled ? '1px solid rgba(242,237,228,0.08)' : 'none',
    }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between px-5 md:px-10 h-16">
        <RotovideLogo size="nav" />
        <div className="hidden md:flex items-center gap-6">
          <a href="#tools" className="text-sm hover:text-foreground transition-colors" style={{ color: 'rgba(242,237,228,0.6)' }}>Tools</a>
          <a href="#how-it-works" className="text-sm hover:text-foreground transition-colors" style={{ color: 'rgba(242,237,228,0.6)' }}>How It Works</a>
          <a href="#pricing" className="text-sm hover:text-foreground transition-colors" style={{ color: 'rgba(242,237,228,0.6)' }}>Pricing</a>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Button variant="outline" size="sm" asChild><Link to="/auth/login">Log In</Link></Button>
          <Button size="sm" asChild><Link to="/auth/signup">Start Free Trial</Link></Button>
        </div>
        <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          {menuOpen ? <X className="w-5 h-5 text-foreground" /> : <Menu className="w-5 h-5 text-foreground" />}
        </button>
      </div>
      {menuOpen && (
        <div className="md:hidden px-5 pb-5 pt-2 flex flex-col gap-4" style={{ background: 'rgba(8,8,8,0.95)', borderBottom: '1px solid rgba(242,237,228,0.08)' }}>
          <a href="#tools" onClick={() => setMenuOpen(false)} className="text-sm py-2" style={{ color: 'rgba(242,237,228,0.6)' }}>Tools</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-sm py-2" style={{ color: 'rgba(242,237,228,0.6)' }}>How It Works</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-sm py-2" style={{ color: 'rgba(242,237,228,0.6)' }}>Pricing</a>
          <div className="flex flex-col gap-3 pt-2">
            <Button variant="outline" size="sm" asChild><Link to="/auth/login">Log In</Link></Button>
            <Button size="sm" asChild><Link to="/auth/signup">Start Free Trial</Link></Button>
          </div>
        </div>
      )}
    </nav>
  );
}

/* ───────────────────── Hero ───────────────────── */
function Hero() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    const { error: dbError } = await supabase
      .from("waitlist")
      .insert({ email: trimmed, invite_code: "" } as any);
    setLoading(false);

    if (dbError) {
      if (dbError.code === "23505") {
        setError("You're already on the list. We'll see you at launch. 🤙");
      } else {
        setError("Something went wrong. Try again in a moment.");
      }
      return;
    }
    setSubmitted(true);
  };

  return (
    <section className="relative flex items-center justify-center overflow-hidden" style={{ background: "#080808", paddingTop: 120, paddingBottom: 60 }}>
      <div className="relative z-10 text-center px-5 max-w-4xl mx-auto">
        <span className="inline-block text-[10px] sm:text-xs px-4 py-1.5 rounded-full mb-8 whitespace-nowrap"
          style={{
            border: '1px solid rgba(232,255,71,0.3)',
            background: 'rgba(232,255,71,0.06)',
            color: '#E8FF47',
            letterSpacing: 1,
            fontFamily: "'DM Sans', sans-serif",
          }}>
          AI MUSIC VIDEO EDITOR FOR INDEPENDENT ARTISTS
        </span>

        <h1 className="font-display leading-none" style={{ letterSpacing: 4 }}>
          <span className="block" style={{ fontSize: 'clamp(36px, 6vw, 64px)', color: 'rgba(242,237,228,0.7)' }}>STOP EDITING.</span>
          <span className="block" style={{ fontSize: 'clamp(36px, 6vw, 64px)', color: 'rgba(242,237,228,0.7)' }}>START POSTING.</span>
          <span className="block text-primary" style={{ fontSize: 'clamp(48px, 8vw, 88px)' }}>BLOW UP FASTER.</span>
        </h1>

        <p className="mt-4 text-sm max-w-2xl mx-auto" style={{ color: 'rgba(242,237,228,0.45)', fontFamily: "'DM Sans', sans-serif" }}>
          ROTOVIDE is in final development. Join the waitlist — get early access + 3 days free with 15 export credits when we launch.
        </p>

        <p className="mt-4 text-base max-w-2xl mx-auto" style={{ color: 'rgba(242,237,228,0.45)', fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>
          Upload your footage and song — ROTOVIDE builds a beat-synced music video with frame-perfect lip sync, cuts it into Reels and TikToks, and captions every word using AI. Four tools. One suite. No editor. No timeline. No excuses for not posting.
        </p>

        {submitted ? (
          <div className="mt-8 space-y-1">
            <p className="font-display text-lg" style={{ color: '#E8FF47', letterSpacing: 2 }}>✓ You're on the list.</p>
            <p className="text-sm" style={{ color: 'rgba(242,237,228,0.45)' }}>We'll email your personal invite code when ROTOVIDE drops.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto">
            <Input
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              className="flex-1 h-12 text-base"
              style={{ background: '#0d0d0d', border: '1px solid rgba(242,237,228,0.12)' }}
            />
            <Button type="submit" size="lg" className="h-12 px-8 whitespace-nowrap" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              JOIN THE WAITLIST
            </Button>
          </form>
        )}

        {error && (
          <p className="mt-3 text-sm" style={{ color: error.includes("already") ? 'rgba(242,237,228,0.5)' : '#ff6b6b' }}>{error}</p>
        )}

        <p className="mt-6 font-mono text-[10px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.5)' }}>
          ✓ 15 credits loaded on signup  ·  ✓ 3-day trial  ·  ✓ No credit card  ·  ✓ Cancel anytime
        </p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'rgba(242,237,228,0.06)' }} />
    </section>
  );
}

/* ───────────────────── Pain Agitation ───────────────────── */
function PainAgitation() {
  const fade = useFadeIn();
  const cards = [
    { emoji: "💸", eyebrow: "YOU'RE PAYING", stat: "$300–$500", label: "Per video. To an editor who takes a week and still doesn't match the energy you recorded." },
    { emoji: "📱", eyebrow: "YOU NEED TO POST", stat: "12–16×", label: "Per song drop to stay relevant on TikTok, Reels, and Shorts. One video is not enough." },
    { emoji: "⚡", eyebrow: "ROTOVIDE DELIVERS", stat: "SAME DAY", label: "Music video, social clips, and AI captions. Upload in the morning. Post before midnight." },
  ];

  return (
    <section className="pt-10 pb-10 px-5" style={{ background: '#080808' }}>
      <div {...fade} className={cn("max-w-5xl mx-auto text-center", fade.className)}>
        <h2 className="font-display text-foreground mb-4" style={{ fontSize: 'clamp(32px, 5vw, 48px)', letterSpacing: 3 }}>
          YOUR SONG DROPPED.<br />YOUR FEED IS EMPTY.
        </h2>
        <p className="max-w-2xl mx-auto mb-12" style={{ color: 'rgba(242,237,228,0.5)', fontSize: 15 }}>
          You recorded something real. Shot footage at the session. Maybe you've got an official video sitting there too. But between editing, captions, repurposing, and posting — nothing goes up. Meanwhile artists with half your talent are posting every day and getting bigger.
        </p>
        <div className="grid sm:grid-cols-3 gap-5">
          {cards.map(c => (
            <div key={c.stat} className="p-8 rounded text-center space-y-3"
              style={{ background: '#0d0d0d', border: '1px solid rgba(232,255,71,0.12)' }}>
              <span className="text-3xl">{c.emoji}</span>
              {c.eyebrow && (
                <p className="font-mono text-[11px] tracking-[3px] uppercase font-bold" style={{ color: 'rgba(242,237,228,0.7)' }}>{c.eyebrow}</p>
              )}
              <p className="font-display text-primary" style={{ fontSize: 48, letterSpacing: 2 }}>{c.stat}</p>
              <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>{c.label}</p>
            </div>
          ))}
        </div>
        <p className="font-display text-primary mt-12 mb-0" style={{ fontSize: 'clamp(24px, 4vw, 36px)', letterSpacing: 3 }}>
          THERE'S A BETTER WAY.
        </p>
      </div>
    </section>
  );
}

/* ───────────────────── Problem → Solution ───────────────────── */
function ProblemSolution() {
  const fade = useFadeIn();
  const pains = [
    "Paying $300–$500 to an editor who takes a week",
    "Posting one video when you needed twelve",
    "Manually syncing multi-cam footage for hours",
    "Re-explaining your vision every single time",
    "Captions that are wrong, late, or don't exist",
    "That app owning a license to your music",
    "One camera angle looped the entire song",
  ];
  const wins = [
    "Full beat-synced music video — same day you upload",
    "8–16 social clips auto-generated from one video",
    "Frame-perfect lip sync — mouth matches every bar",
    "Multi-cam angles auto-distributed across the timeline",
    "Word-by-word AI captions in three styles, burned in",
    "Zero rights claimed. Your music stays yours. Forever.",
    "Section-aware pacing — verse breathes, chorus fires",
  ];

  return (
    <section className="pt-4 pb-12 px-5">
      <div {...fade} className={cn("max-w-5xl mx-auto", fade.className)}>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="p-8 md:p-10 space-y-4 rounded" style={{ background: '#0d0d0d', border: '1px solid rgba(255,71,71,0.12)' }}>
            <h3 className="font-display" style={{ color: 'rgba(255,71,71,0.8)', letterSpacing: 3, fontSize: 'clamp(20px, 3vw, 28px)' }}>DOING IT ALONE</h3>
            <ul className="space-y-3">
              {pains.map(p => (
                <li key={p} className="flex items-start gap-3 text-sm">
                  <X className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <span style={{ color: 'rgba(242,237,228,0.5)' }}>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="p-8 md:p-10 space-y-4 rounded" style={{ background: '#0d0d0d', border: '1px solid rgba(232,255,71,0.15)' }}>
            <h3 className="font-display" style={{ color: 'rgba(232,255,71,0.8)', letterSpacing: 3, fontSize: 'clamp(20px, 3vw, 28px)' }}>ROTOVIDE</h3>
            <ul className="space-y-3">
              {wins.map(w => (
                <li key={w} className="flex items-start gap-3 text-sm">
                  <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-foreground">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Four Tools ───────────────────── */
function FourTools() {
  const fade = useFadeIn();
  const tools = [
    {
      number: "01",
      eyebrow: "RAW FOOTAGE → FINISHED VIDEO",
      title: "MUSIC VIDEO",
      desc: "Upload performance clips and the final song. AI detects BPM, maps the verse and chorus, builds your entire edit — beat-synced with frame-perfect lip sync and multi-cam distribution. Export 9:16 and 16:9 in one shot.",
      pills: ["Beat Sync", "Lip Sync", "Multi-Cam", "9:16 + 16:9"],
      accent: true,
    },
    {
      number: "02",
      eyebrow: "OFFICIAL VIDEO → 8–16 CLIPS",
      title: "LONG TO SHORTS",
      desc: "Upload your finished music video. AI finds every drop, chorus hit, and high-energy moment — cuts them into social clips, auto-reframed to 9:16. One video becomes a month of content.",
      pills: ["Drop Detection", "Auto-Reframe", "Batch Export", "8–16 Clips"],
      accent: false,
    },
    {
      number: "03",
      eyebrow: "POWERED BY OPENAI WHISPER",
      title: "AI CAPTIONS",
      desc: "Upload any video. Whisper transcribes every word with exact timestamps. Highlight glows the active word in green. Karaoke fills as it's spoken. Classic drops clean white lines. All burned in at export.",
      pills: ["Word-Level Timing", "Highlight", "Karaoke", "Classic"],
      accent: false,
    },
    {
      number: "04",
      eyebrow: "16:9 → 9:16 AUTOMATICALLY",
      title: "AI REFRAME",
      desc: "Face detection tracks the artist frame by frame and keeps them centered while converting horizontal footage to vertical. No manual cropping. No heads cut off. Works on every clip automatically.",
      pills: ["Face Detection", "Auto-Center", "9:16 Output", "No Manual Crop"],
      accent: false,
    },
  ];

  return (
    <section id="tools" className="py-24 px-5 scroll-mt-20" style={{ background: '#0d0d0d' }}>
      <div {...fade} className={cn("max-w-5xl mx-auto", fade.className)}>
        <div className="text-center mb-14">
          <h2 className="font-display text-foreground" style={{ fontSize: 'clamp(32px, 5vw, 48px)', letterSpacing: 3 }}>
            FOUR TOOLS. ONE SUITE.
          </h2>
          <p className="mt-3 max-w-xl mx-auto" style={{ color: 'rgba(242,237,228,0.5)', fontSize: 15 }}>
            Everything an independent rap artist needs to go from session to feed — without an editor, a designer, or a video team.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {tools.map((tool) => (
            <div key={tool.number} className="p-8 rounded space-y-4" style={{
              background: '#080808',
              border: tool.accent ? '1px solid rgba(232,255,71,0.2)' : '1px solid rgba(242,237,228,0.08)',
            }}>
              <div className="flex items-start justify-between">
                <span className="font-mono text-[11px] tracking-[3px]" style={{ color: tool.accent ? '#E8FF47' : 'rgba(242,237,228,0.3)' }}>
                  {tool.eyebrow}
                </span>
                <span className="font-display" style={{ fontSize: 48, lineHeight: 1, color: 'rgba(242,237,228,0.05)' }}>
                  {tool.number}
                </span>
              </div>
              <h3 className="font-display text-foreground" style={{ fontSize: 'clamp(22px, 3vw, 28px)', letterSpacing: 2 }}>
                {tool.title}
              </h3>
              <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)', lineHeight: 1.7 }}>{tool.desc}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {tool.pills.map((pill) => (
                  <span key={pill} className="font-mono text-[9px] tracking-[2px] uppercase px-2 py-1 rounded-sm" style={{
                    background: tool.accent ? 'rgba(232,255,71,0.08)' : 'rgba(242,237,228,0.04)',
                    color: tool.accent ? '#E8FF47' : 'rgba(242,237,228,0.4)',
                    border: tool.accent ? '1px solid rgba(232,255,71,0.15)' : '1px solid rgba(242,237,228,0.08)',
                  }}>
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <Button size="lg" className="text-base px-9 py-6" asChild>
            <a href="#top">Join the Waitlist <ArrowRight className="w-4 h-4 ml-2" /></a>
          </Button>
          <p className="mt-3 font-mono text-[10px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.3)' }}>
            EARLY ACCESS · 15 CREDITS · 3-DAY TRIAL
          </p>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── "It Doesn't Just Sync. It Directs." ───────────────────── */
function KnowsRap() {
  const fade = useFadeIn();
  const features = [
    { emoji: "🎵", title: "FRAME-PERFECT LIP SYNC", desc: "Audio cross-correlation compares your camera mic against the master track and finds alignment down to the single frame. The rapper's mouth matches every syllable of every bar. Not approximately — exactly. On every clip. Automatically." },
    { emoji: "💬", title: "WORD-BY-WORD AI CAPTIONS", desc: "OpenAI Whisper transcribes your audio with word-level timestamps. Highlight style glows each word in green as it hits. Karaoke fills it left to right. Classic drops clean lines. All three styles burn in at export — ready to post immediately." },
    { emoji: "⚡", title: "SECTION-AWARE CUTTING", desc: "Verse holds 4–8 seconds so the listener can ride the flow. Chorus fires every 1–2 seconds to match the energy spike. Beat drops get the fastest cuts in the video. ROTOVIDE detects every section automatically and changes pace at every single transition." },
    { emoji: "🎬", title: "MULTI-CAM + AUTO-REFRAME", desc: "Upload 3–5 angles from the same shoot — ROTOVIDE distributes them so chorus and verse get different looks and no angle repeats back to back. Face detection keeps the artist centered when converting 16:9 to 9:16. One upload, every format covered." },
  ];

  return (
    <section className="py-24 px-5" style={{ background: '#0d0d0d' }}>
      <div {...fade} className={cn("max-w-5xl mx-auto text-center", fade.className)}>
        <h2 className="font-display text-foreground mb-4" style={{ fontSize: 'clamp(32px, 5vw, 48px)', letterSpacing: 3 }}>
          IT DOESN'T JUST SYNC. IT DIRECTS.
        </h2>
        <p className="max-w-2xl mx-auto mb-12" style={{ color: 'rgba(242,237,228,0.5)', fontSize: 15 }}>
          Most tools match tempo and call it editing. ROTOVIDE reads the song structure — intro, verse, chorus, drop — and makes a different creative decision in each section. Then AI Captions lands every word and AI Reframe keeps the artist in frame. That's a full creative team, not a template.
        </p>
        <div className="grid sm:grid-cols-2 gap-5">
          {features.map(f => (
            <div key={f.title} className="p-8 rounded text-center space-y-4"
              style={{ background: '#080808', border: '1px solid rgba(242,237,228,0.08)' }}>
              <span className="text-3xl">{f.emoji}</span>
              <h4 className="font-display text-foreground" style={{ fontSize: 22, letterSpacing: 2 }}>{f.title}</h4>
              <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── How It Works ───────────────────── */
function HowItWorks() {
  const fade = useFadeIn();

  return (
    <section id="how-it-works" className="py-24 px-5 scroll-mt-20">
      <div {...fade} className={cn("max-w-5xl mx-auto", fade.className)}>
        <h2 className="font-display text-foreground text-center mb-4" style={{ fontSize: 48, letterSpacing: 3 }}>THREE PATHS. ALL SAME DAY.</h2>
        <p className="text-center mb-12" style={{ color: 'rgba(242,237,228,0.5)', fontSize: 15 }}>Pick your starting point. ROTOVIDE handles everything from there.</p>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { emoji: "🎬", title: "RAW FOOTAGE → MUSIC VIDEO", desc: "Upload performance clips and the final song. AI detects BPM, maps the verse and chorus, builds your full edit with frame-perfect lip sync and multi-cam distribution. Export 9:16 and 16:9." },
            { emoji: "✂️", title: "OFFICIAL VIDEO → SOCIAL CLIPS", desc: "Already have the finished video? Upload it. AI finds every drop, chorus hit, and high-energy moment. Cuts 8–16 clips reframed to 9:16 and ready to post. One video. A full month of content." },
            { emoji: "💬", title: "ANY VIDEO → AI CAPTIONS", desc: "Upload any video. Whisper transcribes every word with exact timestamps. Choose Highlight, Karaoke, or Classic style. Preview live. Download with captions burned in permanently." },
            { emoji: "📤", title: "EXPORT AND POST", desc: "Download your music video, social clips, and captioned versions all at once. 9:16 for TikTok and Reels. 16:9 for YouTube. No watermark on Pro. Done the same day you drop." },
          ].map((s, i) => (
            <div key={s.title} className="p-8 text-center space-y-4 rounded transition-all duration-200 hover:border-primary/20"
              style={{ background: '#0d0d0d', border: '1px solid rgba(242,237,228,0.08)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center mx-auto font-display text-xl"
                style={{ background: '#E8FF47', color: '#080808' }}>
                {i + 1}
              </div>
              <h4 className="font-display text-foreground" style={{ fontSize: 22, letterSpacing: 2 }}>{s.title}</h4>
              <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── The App You're Already Using ───────────────────── */
function CapCutComparison() {
  const fade = useFadeIn();
  const rows = [
    { left: "Spend 3 hours editing one video manually", right: "Full music video built automatically in minutes" },
    { left: "Manually sync audio to video frame by frame", right: "Frame-perfect lip sync via waveform cross-correlation" },
    { left: "Type your own captions or pay a service", right: "Word-by-word AI captions — Whisper transcribes every bar" },
    { left: "One camera angle repeated the entire song", right: "Multi-cam auto-distributed — chorus and verse get different looks" },
    { left: "Post one video and call it a campaign", right: "Music video + 8–16 clips + captions from one upload" },
    { left: "Owned by the same company as TikTok. Read section 2.3.", right: "Zero rights claimed. Your music stays yours. Full stop." },
  ];

  return (
    <section className="py-24 px-5">
      <div {...fade} className={cn("max-w-5xl mx-auto", fade.className)}>
        <div className="text-center mb-12">
          <h2 className="font-display text-foreground" style={{ fontSize: 'clamp(28px, 5vw, 48px)', letterSpacing: 3 }}>
            BUILT FOR ARTISTS WHO CREATE.<br />NOT EDITORS WHO EDIT.
          </h2>
          <p className="mt-1 font-mono text-[11px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.3)' }}>
            You know which app we mean.
          </p>
          <p className="mt-3" style={{ color: 'rgba(242,237,228,0.5)', fontSize: 15 }}>
            That app is a great tool for people who want to spend hours editing. ROTOVIDE is for artists who want a finished video and an empty queue.
          </p>
        </div>
        <div className="max-w-3xl mx-auto rounded-lg overflow-hidden" style={{ border: '1px solid rgba(242,237,228,0.08)' }}>
          {/* Header */}
          <div className="grid grid-cols-2">
            <div className="px-5 py-4 font-display text-center" style={{ background: '#0d0d0d', fontSize: 18, letterSpacing: 2, color: 'rgba(242,237,228,0.4)' }}>
              THAT APP.
            </div>
            <div className="px-5 py-4 font-display text-center" style={{ background: '#0d0d0d', fontSize: 18, letterSpacing: 2, color: '#E8FF47' }}>
              ROTOVIDE
            </div>
          </div>
          {/* Rows */}
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-2" style={{ background: i % 2 === 0 ? '#0d0d0d' : '#080808' }}>
              <div className="px-5 py-4 flex items-start gap-3 text-sm" style={{ borderTop: '1px solid rgba(242,237,228,0.04)' }}>
                <X className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'rgba(242,237,228,0.3)' }} />
                <span style={{ color: 'rgba(242,237,228,0.4)' }}>{row.left}</span>
              </div>
              <div className="px-5 py-4 flex items-start gap-3 text-sm" style={{ borderTop: '1px solid rgba(242,237,228,0.04)' }}>
                <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#E8FF47' }} />
                <span style={{ color: 'rgba(242,237,228,0.85)' }}>{row.right}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center mt-6 font-mono text-[11px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.25)' }}>
          We don't need to say the name. You already know.
        </p>
      </div>
    </section>
  );
}

/* ───────────────────── Music Ownership ───────────────────── */
function MusicOwnership() {
  const fade = useFadeIn();
  return (
    <section className="py-24 px-5" style={{ background: '#0d0d0d', borderTop: '1px solid rgba(232,255,71,0.1)' }}>
      <div {...fade} className={cn("max-w-4xl mx-auto", fade.className)}>
        <h2 className="font-display text-foreground text-center mb-6" style={{ fontSize: 'clamp(32px, 5vw, 48px)', letterSpacing: 3 }}>
          YOUR MUSIC STAYS YOURS.
        </h2>
        <p className="max-w-2xl mx-auto text-center mb-4" style={{ color: 'rgba(242,237,228,0.5)', fontSize: 15 }}>
          There's a popular editing app — the one on every artist's phone right now. Their Terms of Service grant their parent company a royalty-free, worldwide license to your content — including your music. The beat you paid for, the verse you wrote at 3am, the hook that's gonna blow you up — they have rights to it the moment you upload. Read section 2.3 sometime.
        </p>
        <p className="max-w-2xl mx-auto text-center mb-12" style={{ color: 'rgba(242,237,228,0.5)', fontSize: 15 }}>
          ROTOVIDE never claims any rights to your music or footage. Not a license. Not a royalty share. Nothing. Upload, edit, export, and walk away. It's yours.
        </p>

        <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          <div className="p-8 rounded text-center space-y-3" style={{ background: '#080808', border: '1px solid rgba(255,71,71,0.2)' }}>
            <p className="text-2xl">❌</p>
            <h4 className="font-display text-foreground" style={{ fontSize: 22, letterSpacing: 2 }}>THAT OTHER APP</h4>
            <p className="font-mono text-[9px] tracking-[2px] -mt-1" style={{ color: 'rgba(242,237,228,0.25)' }}>you know the one</p>
            <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>
              Perpetual, royalty-free worldwide license to your content
            </p>
          </div>
          <div className="p-8 rounded text-center space-y-3" style={{ background: '#080808', border: '1px solid rgba(232,255,71,0.2)' }}>
            <p className="text-2xl">✓</p>
            <h4 className="font-display text-primary" style={{ fontSize: 22, letterSpacing: 2 }}>ROTOVIDE</h4>
            <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>
              Zero rights claimed. Your music is yours. Period.
            </p>
          </div>
        </div>

        <div className="text-center mt-10">
          <Button size="lg" className="text-base px-9 py-6" asChild>
            <a href="#top">Join the Waitlist <ArrowRight className="w-4 h-4 ml-2" /></a>
          </Button>
        </div>
      </div>
    </section>
  );
}



/* ───────────────────── Pricing ───────────────────── */
const landingPlans = [
  {
    name: "FREE", price: "$0", period: "/mo",
    credits: "20 credits / month",
    features: [
      { label: "20 credits per month", included: true },
      { label: "AI beat-sync music video", included: true },
      { label: "Long to Shorts clip generation", included: true },
      { label: "AI Captions (Whisper transcription)", included: true },
      { label: "Watermarked exports", included: true },
      { label: "Clips expire after 3 days", included: true },
      { label: "No watermark", included: false },
      { label: "Multi-cam distribution", included: false },
      { label: "Batch 9:16 + 16:9 export", included: false },
    ],
    cta: "Start Free →",
  },
  {
    name: "PRO", price: "$24.99", period: "/mo", popular: true,
    subtitle: "Or $14.99/mo billed annually — save 40%",
    credits: "150 credits / month",
    features: [
      { label: "150 credits per month", included: true },
      { label: "No watermark — ever", included: true },
      { label: "Exports never expire", included: true },
      { label: "AI beat-sync music video", included: true },
      { label: "Long to Shorts — 8–16 clips per video", included: true },
      { label: "AI Captions — all 3 styles, burned in", included: true },
      { label: "Multi-cam auto-distribution", included: true },
      { label: "Batch 9:16 + 16:9 export", included: true },
      { label: "Buy credit top-ups anytime", included: true },
    ],
    cta: "Start Free Trial →",
    finePrint: "3-day free trial · 15 credits · No credit card required",
  },
];

function Pricing() {
  const fade = useFadeIn();

  return (
    <section id="pricing" className="py-24 px-5 scroll-mt-20">
      <div {...fade} className={cn("max-w-5xl mx-auto", fade.className)}>
        <div className="text-center mb-12">
          <span className="inline-block font-mono text-[10px] tracking-[3px] uppercase px-4 py-1.5 rounded-full mb-4"
            style={{ border: '1px solid rgba(232,255,71,0.25)', background: 'rgba(232,255,71,0.06)', color: '#E8FF47' }}>
            COMING SOON — FOUNDING MEMBER PRICING
          </span>
          <h2 className="font-display text-foreground" style={{ fontSize: 48, letterSpacing: 3 }}>LESS THAN ONE BEAT LEASE.</h2>
          <p className="mt-2" style={{ color: 'rgba(242,237,228,0.5)', fontSize: 15 }}>Everything you need to post like a professional. Cancel anytime.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {landingPlans.map(plan => (
            <div key={plan.name} className="relative flex flex-col rounded p-10"
              style={{
                background: '#0d0d0d',
                border: plan.popular ? '1px solid rgba(232,255,71,0.25)' : '1px solid rgba(242,237,228,0.08)',
              }}>
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 font-mono text-[8px] tracking-[2px] uppercase px-3 py-1 rounded-sm"
                  style={{ background: 'rgba(232,255,71,0.1)', color: '#E8FF47', border: '1px solid rgba(232,255,71,0.2)' }}>
                  MOST POPULAR
                </span>
              )}
              <div className="mb-6">
                <h3 className="font-display text-foreground" style={{ fontSize: 22, letterSpacing: 2 }}>{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-foreground" style={{ fontSize: 64 }}>{plan.price}</span>
                  <span style={{ color: 'rgba(242,237,228,0.4)', fontSize: 16 }}>{plan.period}</span>
                </div>
                {plan.credits && <p className="text-xs mt-1.5 font-mono tracking-wide" style={{ color: '#E8FF47' }}>{plan.credits}</p>}
                {plan.subtitle && <p className="text-xs mt-1" style={{ color: 'rgba(242,237,228,0.45)' }}>{plan.subtitle}</p>}
              </div>
              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map(f => (
                  <li key={f.label} className="flex items-center gap-2 text-sm">
                    {f.included
                      ? <Check className="w-4 h-4 text-primary shrink-0" />
                      : <X className="w-4 h-4 shrink-0" style={{ color: 'rgba(242,237,228,0.2)' }} />}
                    <span style={{ color: f.included ? 'rgba(242,237,228,0.7)' : 'rgba(242,237,228,0.3)' }}>{f.label}</span>
                  </li>
                ))}
              </ul>
              <Button className="w-full" variant={plan.popular ? "default" : "outline"} asChild>
                <Link to="/auth/signup">
                  {plan.cta} <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              {plan.finePrint && (
                <p className="text-center mt-3 font-mono text-[9px] tracking-[1px]" style={{ color: 'rgba(242,237,228,0.3)' }}>
                  {plan.finePrint}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="text-center mt-8 space-y-2">
          <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>
            Dropping more this month?{" "}
            <Link to="/pricing" className="text-primary hover:underline">Buy a credit top-up from $9 →</Link>
          </p>
          <p className="font-mono text-[10px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.25)' }}>
            TOP-UP CREDITS NEVER EXPIRE · STACK ON ANY PLAN · NO PLAN CHANGE NEEDED
          </p>
        </div>
      </div>
    </section>
  );
}


/* ───────────────────── FAQ ───────────────────── */
const faqs = [
  { q: "What are the four tools?", a: "Music Video takes your raw footage and song and builds a fully-edited, beat-synced video automatically. Long to Shorts takes a finished video and cuts 8–16 social clips. AI Captions transcribes any video word-by-word using OpenAI Whisper — you choose Highlight, Karaoke, or Classic style. AI Reframe uses face detection to convert 16:9 footage to 9:16 without cutting off the artist. All four are available on every plan." },
  { q: "How accurate are the AI Captions?", a: "ROTOVIDE uses OpenAI Whisper — one of the most accurate speech-to-text models available. For rap specifically, Whisper handles fast flows, ad libs, and slang better than most transcription services. You get word-level timestamps — every word lights up exactly when it's spoken, not just line by line. If a word is wrong, you can edit it before exporting." },
  { q: "What's the difference between Highlight, Karaoke, and Classic?", a: "Highlight: the active word glows in ROTOVIDE green while the rest stays white — clean and readable on any background. Karaoke: the word fills with color left to right as it's spoken — works great for fast flows. Classic: the full line appears and fades when the next starts — minimal and professional. All three preview live before you export." },
  { q: "Will the AI actually understand rap music?", a: "Yes. The beat-sync engine detects BPM, identifies verse and chorus sections from energy analysis, and applies different cut pacing to each. Verses get slower cuts so the listener can ride the lyrics. Chorus fires faster to match the energy spike. Beat drops get the fastest cuts in the video. It's not syncing to a metronome — it's responding to the song structure." },
  { q: "How accurate is the lip sync?", a: "ROTOVIDE uses audio cross-correlation — it compares the waveform in your camera footage against your final mix and finds where they align down to the frame. The rapper's mouth actually matches every word throughout the entire video. Not approximately — exactly." },
  { q: "Can I use Long to Shorts on a YouTube video?", a: "YouTube direct import is coming soon. For now, download your video from YouTube and upload the file directly — it takes about 30 seconds and works exactly the same way. MP4, MOV, or WebM up to 20 minutes." },
  { q: "What counts as one credit?", a: "One credit = one export download. You can upload, generate, preview, switch caption styles, and preview again as many times as you want — credits only get deducted when you actually download. Try everything before you spend anything." },
  { q: "What happens when I run out of credits?", a: "Buy a top-up pack anytime — 60 credits for $9, 120 for $16, or 250 for $29. Top-up credits never expire and stack on top of your monthly allotment. You can also wait for your monthly reset if you're not in a rush. No plan change required." },
  { q: "How does the free trial work?", a: "Verify your email and 15 credits load instantly — no credit card, no friction. Full access to all four tools: Music Video, Long to Shorts, AI Captions, and AI Reframe. Trial exports include a small watermark. Go Pro anytime to remove it and get 150 credits every month." },
  { q: "Does ROTOVIDE own my music when I upload it?", a: "Never. ROTOVIDE claims zero rights to your music or footage — not a license, not a royalty share, nothing. There's a popular editing app whose parent company acquires a worldwide royalty-free license to your content the moment you upload. ROTOVIDE doesn't touch your rights. Upload, edit, export, and walk away. It's yours." },
  { q: "What happens when my trial ends?", a: "You drop to the Free plan automatically — no charges, ever. You keep 20 credits per month and access to all four tools. Exports include a watermark on Free. Upgrade to Pro anytime to remove it and get 150 credits per month." },
  { q: "How does multicam distribution work?", a: "Upload 3–5 performance angles from the same shoot. ROTOVIDE automatically assigns different angles to different sections — one for the verse, another for the chorus — and makes sure you never see the same angle twice in a row. You don't drag anything into a timeline. Just upload the clips, upload the song, and the distribution happens automatically." },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  const fade = useFadeIn();

  return (
    <section id="faq" className="py-24 px-5 scroll-mt-20">
      <div {...fade} className={cn("max-w-3xl mx-auto", fade.className)}>
        <h2 className="font-display text-foreground text-center mb-10" style={{ fontSize: 48, letterSpacing: 3 }}>REAL QUESTIONS.</h2>
        <div className="space-y-2">
          {faqs.map((f, i) => (
            <div key={i} className="rounded overflow-hidden" style={{ background: '#0d0d0d', border: '1px solid rgba(242,237,228,0.08)' }}>
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full text-left px-5 py-4 flex items-center justify-between text-sm font-medium text-foreground">
                {f.q}
                <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", open === i && "rotate-180")} style={{ color: 'rgba(242,237,228,0.4)' }} />
              </button>
              <div className={cn("grid transition-all duration-200", open === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                <div className="overflow-hidden">
                  <p className="px-5 pb-4 text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>{f.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Final CTA ───────────────────── */
function FinalCTA() {
  const fade = useFadeIn();
  return (
    <section className="py-24 px-5 relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #080808 0%, #0d0c00 50%, #080808 100%)' }}>
      <div {...fade} className={cn("relative z-10 max-w-2xl mx-auto text-center", fade.className)}>
        <h2 className="font-display leading-none" style={{ letterSpacing: 4 }}>
          <span className="block text-foreground" style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>YOUR SESSION.</span>
          <span className="block text-foreground" style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>YOUR SONG.</span>
          <span className="block text-primary mt-2" style={{ fontSize: 'clamp(40px, 6vw, 72px)' }}>YOUR MONTH OF CONTENT.</span>
        </h2>
        <p className="mt-6" style={{ color: 'rgba(242,237,228,0.5)', fontSize: 16 }}>
          Footage on your phone. Song in your DAW. Four AI tools ready. Beat-synced music video, 8–16 social clips, and word-by-word captions — all from one upload, all same day. No editor. No timeline. No more reasons to not post.
        </p>
        <Button size="lg" className="mt-8 text-base px-10 py-6" asChild>
          <a href="#top">Join the Waitlist — Get Early Access <ArrowRight className="w-4 h-4 ml-2" /></a>
        </Button>
        <p className="mt-4 font-mono text-[10px] tracking-[2px]" style={{ color: 'rgba(242,237,228,0.3)' }}>
          EARLY ACCESS · 15 CREDITS · 3-DAY TRIAL · NO CREDIT CARD
        </p>
      </div>
    </section>
  );
}

/* ───────────────────── Footer ───────────────────── */
function Footer() {
  return (
    <footer className="py-8 px-5" style={{ borderTop: '1px solid rgba(242,237,228,0.06)' }}>
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <RotovideLogo size="nav" />
        <div className="flex items-center gap-6">
          <Link to="/app/dashboard" className="text-sm hover:text-foreground transition-colors" style={{ color: 'rgba(242,237,228,0.5)' }}>Dashboard</Link>
          <a href="#pricing" className="text-sm hover:text-foreground transition-colors" style={{ color: 'rgba(242,237,228,0.5)' }}>Pricing</a>
          <a href="#how-it-works" className="text-sm hover:text-foreground transition-colors" style={{ color: 'rgba(242,237,228,0.5)' }}>How It Works</a>
          <a href="#faq" className="text-sm hover:text-foreground transition-colors" style={{ color: 'rgba(242,237,228,0.5)' }}>FAQ</a>
        </div>
        <p className="text-label" style={{ color: 'rgba(242,237,228,0.25)' }}>© 2026 ROTOVIDE. All rights reserved.</p>
      </div>
    </footer>
  );
}

/* ───────────────────── Landing Page ───────────────────── */
export default function LandingPage() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => { document.documentElement.style.scrollBehavior = ""; };
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#080808' }}>
      <Navbar />
      <Hero />
      <PainAgitation />
      <ProblemSolution />
      <FourTools />
      <KnowsRap />
      <HowItWorks />
      <CapCutComparison />
      <MusicOwnership />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
