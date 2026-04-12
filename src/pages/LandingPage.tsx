import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RotovideLogo } from "@/components/ui/RotovideLogo";
import { supabase } from "@/integrations/supabase/client";
import "./LandingPage.css";

/* ═══════════════════════════════════════
   WAITLIST FORM — reused in Hero + CTA
   ═══════════════════════════════════════ */
function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: sbError } = await supabase
        .from("waitlist")
        .insert({
          email,
          source: "landing_page",
          agreed_to_terms: false,
          status: "pending",
        });
      if (sbError) {
        if (sbError.code === "23505") {
          setSubmitted(true);
        } else {
          setError("Something went wrong. Try again.");
        }
      } else {
        setSubmitted(true);
        supabase.functions.invoke("waitlist-confirmation", {
          body: { email },
        });
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <p style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, color: "var(--acc)", letterSpacing: 2, marginBottom: 6 }}>
          ✓ YOU'RE ON THE LIST!
        </p>
        <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "var(--fg60)", letterSpacing: 1 }}>
          Check your inbox — we just sent you a confirmation.
        </p>
      </div>
    );
  }

  return (
    <form className="rv-email" onSubmit={handleSubmit}>
      <input
        type="email"
        className="rv-input"
        placeholder="Enter your email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
      />
      <button type="submit" className="rv-btn" disabled={loading}>
        {loading ? "..." : "JOIN THE WAITLIST"}
      </button>
      {error && (
        <p style={{ fontSize: 13, color: "#FF4747", marginTop: 8, width: "100%", textAlign: "center", fontFamily: "'Space Mono', monospace" }}>
          {error}
        </p>
      )}
    </form>
  );
}

/* ═══════════════════════════════════════
   NAVBAR
   ═══════════════════════════════════════ */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav className={`rv-nav${scrolled ? " scrolled" : ""}`}>
      <div className="rv-nav-in">
        <RotovideLogo size="nav" />
        <div className="rv-nav-lk">
          <a href="#tools">Tools</a>
          <a href="#how">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="#wl" className="rv-nav-cta">JOIN WAITLIST</a>
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════
   HERO
   ═══════════════════════════════════════ */
function Hero() {
  return (
    <section className="rv-hero">
      <div className="rv-badge">
        <span className="dot" />
        AI MUSIC VIDEO EDITOR FOR INDEPENDENT ARTISTS
      </div>
      <h1>
        YOUR MUSIC DESERVES<br />
        TO BE SEEN.<br />
        <span className="a">VIDEO MAKES IT HAPPEN.</span>
      </h1>
      <p className="rv-hero-sub">
        You made a song that could change someone's life — but without video,{" "}
        <em>it never reaches them.</em> ROTOVIDE turns your footage and track into a
        beat-synced music video, social clips, and captions. Same day. No editing
        skills. Any genre.
      </p>
      <WaitlistForm />
      <div className="rv-trust">
        <span>✓ 5 EXPORTS ON SIGNUP</span>
        <span>✓ 3-DAY TRIAL</span>
        <span>✓ NO CREDIT CARD</span>
        <span>✓ CANCEL ANYTIME</span>
      </div>
      <div className="rv-stats">
        <div className="rv-stat">
          <div className="rv-stat-v">40%+</div>
          <div className="rv-stat-l">of music streams come from independent artists</div>
        </div>
        <div className="rv-stat">
          <div className="rv-stat-v">$500M+</div>
          <div className="rv-stat-l">spent on music video production annually by indie artists</div>
        </div>
        <div className="rv-stat">
          <div className="rv-stat-v">78%</div>
          <div className="rv-stat-l">of fans say video drives them to stream a new artist</div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   PAIN SECTION
   ═══════════════════════════════════════ */
function Pain() {
  return (
    <section className="rv-sec" style={{ background: "var(--sf)" }}>
      <div className="rv-w">
        <span className="rv-lbl rv-r">THE REAL PROBLEM</span>
        <h2 className="rv-r">
          THE SONG DROPPED.<br />
          THE <span className="a">FEED IS EMPTY.</span>
        </h2>
        <p className="rv-sub rv-r">
          You recorded something real. You've got footage sitting on your phone. But
          between editing, captions, reformatting, and posting —{" "}
          <em>nothing goes up.</em> The algorithm rewards whoever shows up every day.
          Your music can't reach anyone if it never gets posted.
        </p>

        {/* Artist quotes */}
        <div className="g3 sg" style={{ marginBottom: 28 }}>
          <div className="rv-c rv-q rv-r">
            <span className="qm">"</span>
            <blockquote>
              I know my music's fire — I just need people to see it.
            </blockquote>
            <cite>— Independent artist</cite>
          </div>
          <div className="rv-c rv-q rv-r">
            <span className="qm">"</span>
            <blockquote>I can't keep editing till 2 AM for 10 likes.</blockquote>
            <cite>— Independent artist</cite>
          </div>
          <div className="rv-c rv-q rv-r">
            <span className="qm">"</span>
            <blockquote>
              The sheer volume of release and content demands on artists can be
              overwhelmingly crippling.
            </blockquote>
            <cite>— Music Managers Forum, Digital Burnout Report</cite>
          </div>
        </div>

        {/* Problem stats */}
        <div className="g3 sg">
          <div className="rv-c rv-ps rv-r">
            <div className="rv-ps-i">💸</div>
            <div className="rv-ps-l">YOU'RE PAYING</div>
            <div className="rv-ps-v">$1,000+</div>
            <div className="rv-ps-d">
              Per music video. To a videographer who takes weeks and still doesn't
              capture the energy of your track.
            </div>
          </div>
          <div className="rv-c rv-ps rv-r">
            <div className="rv-ps-i">📱</div>
            <div className="rv-ps-l">YOU NEED TO POST</div>
            <div className="rv-ps-v">12–16×</div>
            <div className="rv-ps-d">
              Per song drop to stay visible on TikTok, Reels, and Shorts. One post and
              done means one post and forgotten.
            </div>
          </div>
          <div className="rv-c rv-ps rv-r">
            <div className="rv-ps-i">⚡</div>
            <div className="rv-ps-l">ROTOVIDE DELIVERS</div>
            <div className="rv-ps-v">SAME DAY</div>
            <div className="rv-ps-d">
              Music video, social clips, and AI captions. Upload in the morning. Post
              before midnight. Blow up by tomorrow.
            </div>
          </div>
        </div>

        {/* Permission card */}
        <div className="rv-perm rv-r" style={{ marginTop: 36 }}>
          <h3>NOBODY BLOWS UP BY STAYING QUIET.</h3>
          <p>
            You know your music is good. Your friends know. Your producer knows. But
            the algorithm doesn't care about talent — it cares about volume. The artists
            passing you aren't better. They're just posting more. ROTOVIDE gives you the
            output to match the talent you already have.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   VS COMPARISON
   ═══════════════════════════════════════ */
function VsComparison() {
  return (
    <section className="rv-sec">
      <div className="rv-w">
        <span className="rv-lbl rv-r">THERE'S A BETTER WAY</span>
        <div className="rv-vs rv-s">
          <div className="rv-vs-o">
            <div className="rv-vs-h d">DOING IT ALONE</div>
            <div className="rv-vs-i"><span className="xr">✗</span> Paying $1,000+ to a videographer who takes weeks</div>
            <div className="rv-vs-i"><span className="xr">✗</span> Posting one video when you needed twelve</div>
            <div className="rv-vs-i"><span className="xr">✗</span> Manually syncing multi-cam footage for hours</div>
            <div className="rv-vs-i"><span className="xr">✗</span> Re-explaining your creative vision every time</div>
            <div className="rv-vs-i"><span className="xr">✗</span> Captions that are wrong, late, or don't exist</div>
            <div className="rv-vs-i"><span className="xr">✗</span> That app owning a license to your music</div>
            <div className="rv-vs-i"><span className="xr">✗</span> One camera angle looped the entire song</div>
          </div>
          <div className="rv-vs-n">
            <div className="rv-vs-h ac">ROTOVIDE</div>
            <div className="rv-vs-i"><span className="ck">✓</span> Full beat-synced music video — same day you upload</div>
            <div className="rv-vs-i"><span className="ck">✓</span> 8–16 social clips auto-generated from one video</div>
            <div className="rv-vs-i"><span className="ck">✓</span> Frame-perfect lip sync — mouth matches every word</div>
            <div className="rv-vs-i"><span className="ck">✓</span> Multi-cam angles auto-distributed across the timeline</div>
            <div className="rv-vs-i"><span className="ck">✓</span> Word-by-word AI captions — choose your style, burned in</div>
            <div className="rv-vs-i"><span className="ck">✓</span> Zero rights claimed. Your music stays yours. Forever.</div>
            <div className="rv-vs-i"><span className="ck">✓</span> Section-aware pacing — verse breathes, chorus fires</div>
            <div className="rv-vs-i"><span className="ck">✓</span> Director Chat — type changes in plain English, AI handles the rest</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   WHO IT'S FOR
   ═══════════════════════════════════════ */
function WhoItsFor() {
  return (
    <section className="rv-sec" style={{ background: "var(--sf)" }}>
      <div className="rv-w">
        <span className="rv-lbl rv-r">BUILT FOR EVERY GENRE. EVERY GRIND. EVERY ARTIST.</span>
        <h2 className="rv-r">
          IF YOU MAKE MUSIC AND NEED VIDEO,<br />
          <span className="a">THIS IS FOR YOU.</span>
        </h2>
        <p className="rv-sub rv-r">
          Rapper, singer, producer, band — the genre is different, but the struggle is
          the same.
        </p>
        <div className="g3 sg">
          <div className="rv-c rv-au rv-r">
            <div className="rv-au-e">🎤</div>
            <h3>HIP-HOP & RAP</h3>
            <p>
              Hard-hitting visuals that match the energy of your bars. Beat-synced cuts
              that hit on every snare.
            </p>
          </div>
          <div className="rv-c rv-au rv-r">
            <div className="rv-au-e">🎸</div>
            <h3>ROCK & ALTERNATIVE</h3>
            <p>
              Cinematic performance footage cut with the intensity your sound demands.
            </p>
          </div>
          <div className="rv-c rv-au rv-r">
            <div className="rv-au-e">🎵</div>
            <h3>R&B & SOUL</h3>
            <p>
              Smooth, mood-driven edits that let the vocal and the vibe breathe.
            </p>
          </div>
          <div className="rv-c rv-au rv-r">
            <div className="rv-au-e">🌎</div>
            <h3>LATIN & AFROBEATS</h3>
            <p>
              Culture-forward visuals with rhythmic cutting that rides the groove.
            </p>
          </div>
          <div className="rv-c rv-au rv-r">
            <div className="rv-au-e">⛪</div>
            <h3>GOSPEL & WORSHIP</h3>
            <p>
              Turn your worship moments into shareable video that reaches people beyond
              Sunday morning.
            </p>
          </div>
          <div className="rv-c rv-au rv-r">
            <div className="rv-au-e">🎧</div>
            <h3>POP & EDM</h3>
            <p>
              High-energy cuts synced to drops, builds, and breakdowns. Content that
              moves as fast as your sound.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   FOUR TOOLS
   ═══════════════════════════════════════ */
function FourTools() {
  return (
    <section className="rv-sec" id="tools">
      <div className="rv-w">
        <span className="rv-lbl rv-r">NO EDITOR NEEDED.</span>
        <h2 className="rv-r">
          <span className="a">SEVEN TOOLS.</span> ONE SUBSCRIPTION.
        </h2>
        <p className="rv-sub rv-r">
          Whether you recorded on your phone in your living room or filmed a session at
          the studio — upload your footage, drop your track, and ROTOVIDE handles
          everything else.
        </p>
        <div className="g3 sg" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className="rv-c rv-tc rv-r">
            <div className="rv-tn">01</div>
            <div className="rv-tb">RAW FOOTAGE → FINISHED VIDEO</div>
            <h3>MUSIC VIDEO</h3>
            <p>
              Upload performance clips and the final song. AI detects BPM, maps verse
              and chorus, builds the edit — beat-synced with frame-perfect lip sync and
              multi-cam distribution. Export 9:16 and 16:9.
            </p>
            <div className="rv-tags">
              <span className="rv-tag">Beat Sync</span>
              <span className="rv-tag">Lip Sync</span>
              <span className="rv-tag">Multi-Cam</span>
              <span className="rv-tag">9:16 + 16:9</span>
            </div>
          </div>
          <div className="rv-c rv-tc rv-r">
            <div className="rv-tn">02</div>
            <div className="rv-tb">OFFICIAL VIDEO → 8–16 CLIPS</div>
            <h3>LONG TO SHORTS</h3>
            <p>
              Upload a finished music video. AI finds every drop, chorus hit, and
              high-energy moment — cuts them into social clips, auto-reframed to 9:16.
              One video becomes a month of content.
            </p>
            <div className="rv-tags">
              <span className="rv-tag">Drop Detection</span>
              <span className="rv-tag">Auto-Reframe</span>
              <span className="rv-tag">Batch Export</span>
              <span className="rv-tag">8–16 Clips</span>
            </div>
          </div>
          <div className="rv-c rv-tc rv-r">
            <div className="rv-tn">03</div>
            <div className="rv-tb">ANY VIDEO → CAPTIONS BURNED IN</div>
            <h3>AI CAPTIONS</h3>
            <p>
              Upload any video. AI transcribes every word with exact timestamps. Browse
              caption styles and pick the look that fits — bold, minimal, animated,
              colorful. Preview it live, tweak it, export with captions burned in
              permanently.
            </p>
            <div className="rv-tags">
              <span className="rv-tag">Word-Level Timing</span>
              <span className="rv-tag">Style Picker</span>
              <span className="rv-tag">Live Preview</span>
              <span className="rv-tag">Burned-In Export</span>
            </div>
          </div>
          <div className="rv-c rv-tc rv-r">
            <div className="rv-tn">04</div>
            <div className="rv-tb">16:9 → 9:16 AUTOMATICALLY</div>
            <h3>AI REFRAME</h3>
            <p>
              Face detection tracks the artist frame by frame and keeps them centered
              while converting horizontal footage to vertical. No manual cropping. No
              heads cut off. Automatic on every clip.
            </p>
            <div className="rv-tags">
              <span className="rv-tag">Face Detection</span>
              <span className="rv-tag">Auto-Center</span>
              <span className="rv-tag">9:16 Output</span>
              <span className="rv-tag">No Manual Crop</span>
            </div>
          </div>
          <div className="rv-c rv-tc rv-r">
            <div className="rv-tn">05</div>
            <div className="rv-tb">ANY VIDEO → SPOTIFY-READY LOOP</div>
            <h3>LOOP VISUALIZER</h3>
            <p>
              Upload any video clip and ROTOVIDE turns it into a seamless looping
              visualizer — ready to upload directly to Spotify, Apple Music, and
              YouTube Music. Give every track on your album a visual presence without
              shooting new footage. One clip. Every platform.
            </p>
            <div className="rv-tags">
              <span className="rv-tag">Seamless Loop</span>
              <span className="rv-tag">Spotify Ready</span>
              <span className="rv-tag">Apple Music</span>
              <span className="rv-tag">YouTube Music</span>
            </div>
          </div>
          <div className="rv-c rv-tc rv-r">
            <div className="rv-tn">06</div>
            <div className="rv-tb">TYPE IT. AI DOES THE REST.</div>
            <h3>DIRECTOR CHAT</h3>
            <p>
              Don't like the pacing on the chorus? Type it. "Make the chorus cuts
              faster." "Swap the clip at 0:45." "The drop needs more energy." The AI
              reads your instruction, rebuilds the edit, and shows you exactly what
              changed. No timeline. No drag handles. Just tell it what you want.
            </p>
            <div className="rv-tags">
              <span className="rv-tag">Natural Language</span>
              <span className="rv-tag">Real-Time Rebuild</span>
              <span className="rv-tag">Change Summary</span>
              <span className="rv-tag">Unlimited Revisions</span>
            </div>
          </div>
          <div className="rv-c rv-tc rv-r">
            <div className="rv-tn">07</div>
            <div className="rv-tb">RAW FOOTAGE → CINEMATIC GRADE</div>
            <h3>FILM LUTs</h3>
            <p>
              Apply cinema-grade color grading to your entire video with one click.
              Browse a library of film LUTs — warm golden hour, cold desaturated mood,
              vintage film grain, high-contrast editorial. Preview each look live on
              your footage and lock in the look before you export.
            </p>
            <div className="rv-tags">
              <span className="rv-tag">LUT Library</span>
              <span className="rv-tag">Live Preview</span>
              <span className="rv-tag">One-Click Grade</span>
              <span className="rv-tag">Cinematic Color</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   DEEP FEATURES
   ═══════════════════════════════════════ */
function DeepFeatures() {
  return (
    <section className="rv-sec" id="how" style={{ background: "var(--sf)" }}>
      <div className="rv-w">
        <span className="rv-lbl rv-r">UNDER THE HOOD</span>
        <h2 className="rv-r">
          IT DOESN'T JUST SYNC.<br />
          <span className="a">IT DIRECTS.</span>
        </h2>
        <p className="rv-sub rv-r">
          Most tools match tempo and call it editing. ROTOVIDE reads the song structure
          — intro, verse, chorus, bridge, drop — and makes a different creative decision
          in each section. That's a full creative team, not a template.
        </p>
        <div className="g3 sg" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div className="rv-c rv-r" style={{ borderTop: "3px solid var(--bdr-acc)" }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🎵</div>
            <h3>FRAME-PERFECT LIP SYNC</h3>
            <p style={{ fontSize: 13, color: "var(--fg60)", lineHeight: 1.65 }}>
              Audio cross-correlation aligns the camera mic against the master track
              down to the frame. Every syllable. Every lyric. Every line. Exactly.
              Automatically.
            </p>
          </div>
          <div className="rv-c rv-r" style={{ borderTop: "3px solid var(--bdr-acc)" }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>💬</div>
            <h3>WORD-BY-WORD AI CAPTIONS</h3>
            <p style={{ fontSize: 13, color: "var(--fg60)", lineHeight: 1.65 }}>
              AI transcribes every word with word-level timestamps. Browse a library of
              caption styles — pick the look that fits, preview it live, and export with
              captions burned in permanently.
            </p>
          </div>
          <div className="rv-c rv-r" style={{ borderTop: "3px solid var(--bdr-acc)" }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>⚡</div>
            <h3>SECTION-AWARE CUTTING</h3>
            <p style={{ fontSize: 13, color: "var(--fg60)", lineHeight: 1.65 }}>
              Verse holds 4–8 seconds. Chorus fires every 1–2 seconds. Beat drops get
              the fastest cuts. ROTOVIDE detects every section and changes pace at every
              transition.
            </p>
          </div>
          <div className="rv-c rv-r" style={{ borderTop: "3px solid var(--bdr-acc)" }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🎬</div>
            <h3>MULTI-CAM + AUTO-REFRAME</h3>
            <p style={{ fontSize: 13, color: "var(--fg60)", lineHeight: 1.65 }}>
              Upload 3–5 angles — ROTOVIDE distributes them so no angle repeats back to
              back. Face detection keeps the artist centered in 9:16. One upload, every
              format.
            </p>
          </div>
          <div className="rv-c rv-r" style={{ borderTop: "3px solid var(--bdr-acc-h)" }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>🗣️</div>
            <h3>
              DIRECTOR CHAT{" "}
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                letterSpacing: 2,
                color: "#080808",
                background: "var(--acc)",
                padding: "3px 8px",
                borderRadius: 4,
                marginLeft: 6,
                verticalAlign: "middle",
              }}>PRO</span>
            </h3>
            <p style={{ fontSize: 13, color: "var(--fg60)", lineHeight: 1.65 }}>
              Just tell the AI what you want changed — in plain English. "Make the cuts
              faster from 0:30 to 0:40." "Hold the wide shot longer during the bridge."
              No timeline. No editing skills. Just describe it and ROTOVIDE makes it
              happen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   DIRECTOR CHAT SECTION
   ═══════════════════════════════════════ */
function DirectorChatSection() {
  const exchanges = [
    {
      user: "Make the chorus cuts faster — it needs more energy",
      director:
        "Updated. Chorus now cuts every beat instead of every 2. Drop section gets flash cuts at the peak. Playback updated.",
    },
    {
      user: "The opening verse feels too fast — slow it down",
      director:
        "Done. Verse pacing pulled back to 4-second holds. Intro extended by one clip. The hook hits harder because of it.",
    },
    {
      user: "Swap the clip at 0:45 — I want a wide shot there",
      director:
        "Replaced. Clip at 0:45 is now your wide angle. Lip sync rechecked — still frame-perfect.",
    },
  ];

  return (
    <section className="rv-sec" style={{ background: "var(--bg)" }}>
      <div className="rv-w">
        <span className="rv-lbl rv-r">AI CREATIVE DIRECTOR — BUILT INTO EVERY EDIT</span>
        <h2 className="rv-r">
          TELL IT WHAT<br />
          <span className="a">YOU WANT.</span>
        </h2>
        <p className="rv-sub rv-r">
          Most tools give you a timeline and expect you to figure it out. ROTOVIDE gives
          you a Director. Type what you want in plain English — the AI reads the song
          structure, looks at your clips, and rebuilds the edit to match your vision. No
          handles. No keyframes. No learning curve.
        </p>

        {/* Chat mockup */}
        <div className="rv-chat rv-s">
          <div className="rv-chat-hdr">
            <span>💬</span>
            <span>DIRECTOR CHAT</span>
            <span className="live-dot" />
            <span className="live-txt">LIVE</span>
          </div>
          <div className="rv-chat-body">
            {exchanges.map((ex, i) => (
              <div key={i}>
                <div className="rv-chat-msg">
                  <span className="rv-chat-role user">YOU</span>
                  <div className="rv-chat-bubble user-bubble">{ex.user}</div>
                </div>
                <div className="rv-chat-msg" style={{ marginTop: 10 }}>
                  <span className="rv-chat-role director">DIRECTOR</span>
                  <div className="rv-chat-bubble dir-bubble">{ex.director}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pills */}
        <div className="rv-tags rv-r" style={{ justifyContent: "center", marginTop: 20 }}>
          <span className="rv-tag">Natural Language Commands</span>
          <span className="rv-tag">Real-Time Edit Rebuild</span>
          <span className="rv-tag">Change Summary on Every Reply</span>
          <span className="rv-tag">Works on Any Section</span>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   THAT APP COMPARISON TABLE
   ═══════════════════════════════════════ */
function ThatApp() {
  return (
    <section className="rv-sec">
      <div className="rv-w">
        <span className="rv-lbl rv-r">BUILT FOR ARTISTS WHO CREATE. NOT EDITORS WHO EDIT.</span>
        <h2 className="rv-r">
          YOU KNOW WHICH<br />
          <span className="a">APP WE MEAN.</span>
        </h2>
        <p className="rv-sub rv-r">
          That app is great for people who want to spend hours editing. ROTOVIDE is for
          artists who want a finished video and an empty queue — so they can get back to
          making music.
        </p>
        <div className="rv-s">
          <table className="rv-tbl">
            <thead>
              <tr>
                <th></th>
                <th>THAT APP</th>
                <th>ROTOVIDE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Editing time</td>
                <td>3+ hours per video, manually</td>
                <td>Full music video built in minutes</td>
              </tr>
              <tr>
                <td>Audio sync</td>
                <td>Manually sync frame by frame</td>
                <td>Frame-perfect lip sync via waveform cross-correlation</td>
              </tr>
              <tr>
                <td>Captions</td>
                <td>Type your own or pay a service</td>
                <td>Word-by-word AI captions — every line, perfectly timed</td>
              </tr>
              <tr>
                <td>Camera angles</td>
                <td>One angle repeated the entire song</td>
                <td>Multi-cam auto-distributed across sections</td>
              </tr>
              <tr>
                <td>Content volume</td>
                <td>One video and call it a campaign</td>
                <td>Music video + 8–16 clips + captions from one upload</td>
              </tr>
              <tr>
                <td>Making changes</td>
                <td>Re-edit manually every time</td>
                <td>Director Chat — type what you want changed in plain English</td>
              </tr>
              <tr>
                <td>Rights</td>
                <td>Royalty-free worldwide license to your content</td>
                <td>Zero rights claimed. Music stays yours.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="rv-r" style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 12,
          color: "var(--fg45)",
          marginTop: 12,
          fontStyle: "italic",
          letterSpacing: .5,
        }}>
          We don't need to say the name. You already know.
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   MUSIC RIGHTS
   ═══════════════════════════════════════ */
function MusicRights() {
  return (
    <section className="rv-sec" style={{ background: "var(--sf)" }}>
      <div className="rv-w">
        <span className="rv-lbl rv-r">MUSIC STAYS YOURS</span>
        <h2 className="rv-r">
          THE LYRICS. THE VISION.<br />
          <span className="a">THE RIGHTS. PROTECTED.</span>
        </h2>
        <p className="rv-sub rv-r">
          The song you spent months writing, the lyrics that came from a real place,
          the melody that's yours and nobody else's —{" "}
          <em>they claim rights to it the moment you upload to that other app.</em>
        </p>
        <p className="rv-r" style={{
          fontSize: 14,
          color: "var(--fg)",
          marginBottom: 24,
          maxWidth: 600,
          marginLeft: "auto",
          marginRight: "auto",
        }}>
          ROTOVIDE never claims any rights to your music or footage. Not a license. Not
          a royalty share. Nothing. Upload, edit, export, walk away. It's yours.
        </p>
        <div className="rv-rts sg">
          <div className="rv-rc rv-rb rv-r">
            <div className="rv-ri">❌</div>
            <h4>THAT OTHER APP</h4>
            <p>Perpetual, royalty-free worldwide license to your content</p>
          </div>
          <div className="rv-rc rv-rg rv-r">
            <div className="rv-ri">✓</div>
            <h4>ROTOVIDE</h4>
            <p>Zero rights claimed. Your music is yours. Period.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   PRICING
   ═══════════════════════════════════════ */
function Pricing() {
  return (
    <section className="rv-sec" id="pricing">
      <div className="rv-w" style={{ textAlign: "center" }}>
        <span className="rv-lbl rv-r">PRICING</span>
        <h2 className="rv-r" style={{ maxWidth: "none", marginLeft: "auto", marginRight: "auto" }}>
          LESS THAN ONE<br />
          <span className="a">HOUR WITH AN EDITOR.</span>
        </h2>
        <p className="rv-sub rv-r" style={{ marginLeft: "auto", marginRight: "auto" }}>
          Everything you need to post like a professional. Cancel anytime.
        </p>
        <div className="sg" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          maxWidth: 840,
          margin: "32px auto 0",
        }}>
          {/* FREE */}
          <div className="rv-pr rv-r">
            <div className="rv-pr-n">FREE</div>
            <div className="rv-pr-v">$0</div>
            <div className="rv-pr-p">/month</div>
            <div className="rv-pr-c">5 EXPORT CREDITS / MONTH</div>
            <ul className="rv-pr-l">
              <li>5 export credits per month</li>
              <li>AI beat-sync music video</li>
              <li>Long to Shorts — 8–16 clips</li>
              <li>AI Captions — full style library</li>
              <li>Multi-cam auto-distribution</li>
              <li>AI Reframe (16:9 → 9:16)</li>
              <li>Batch 9:16 + 16:9 export</li>
              <li className="off">Exports are watermarked</li>
              <li className="off">Director Chat</li>
            </ul>
          </div>

          {/* STARTER */}
          <div className="rv-pr rv-r">
            <div className="rv-pr-n">STARTER</div>
            <div className="rv-pr-v">$10.99</div>
            <div className="rv-pr-p">/month</div>
            <div className="rv-pr-c">30 CREDITS / MONTH</div>
            <ul className="rv-pr-l">
              <li>30 credits per month</li>
              <li>No watermark</li>
              <li>Exports never expire</li>
              <li>AI beat-sync music video</li>
              <li>Long to Shorts — 8–16 clips</li>
              <li>AI Captions — full style library</li>
              <li>Multi-cam auto-distribution</li>
              <li>Batch 9:16 + 16:9 export</li>
              <li className="off">Director Chat</li>
            </ul>
          </div>

          {/* PRO */}
          <div className="rv-pr ft rv-r">
            <div className="rv-pr-n">PRO</div>
            <div className="rv-pr-v">$24.99</div>
            <div className="rv-pr-p">/month</div>
            <div className="rv-pr-c">60 CREDITS · $14.99/MO ANNUALLY — SAVE 40%</div>
            <ul className="rv-pr-l">
              <li>60 credits per month</li>
              <li>No watermark — ever</li>
              <li>Exports never expire</li>
              <li>AI beat-sync music video</li>
              <li>Long to Shorts — 8–16 clips</li>
              <li>AI Captions — full style library</li>
              <li>Multi-cam auto-distribution</li>
              <li>Batch 9:16 + 16:9 export</li>
              <li>Director Chat — edit with words, not timelines</li>
              <li>Buy credit top-ups anytime</li>
            </ul>
          </div>
        </div>
        <p className="rv-r" style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 12,
          color: "var(--fg45)",
          marginTop: 16,
          letterSpacing: .5,
        }}>
          TRY IT FREE · 3-DAY TRIAL · NO CREDIT CARD REQUIRED
        </p>
        <p style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 12,
          color: "var(--fg45)",
          marginTop: 4,
          letterSpacing: .5,
        }}>
          NEED MORE CREDITS? BUY A TOP-UP FROM $9 →
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   FINAL CTA
   ═══════════════════════════════════════ */
function FinalCTA() {
  return (
    <section className="rv-fin" id="wl">
      <div className="rv-w">
        <h2 className="rv-r">
          READY TO REACH<br />
          <span className="a">THE WORLD?</span>
        </h2>
        <WaitlistForm />
        <div className="rv-trust rv-r" style={{ marginTop: 10 }}>
          <span>EARLY ACCESS</span>
          <span>·</span>
          <span>5 EXPORTS TO START</span>
          <span>·</span>
          <span>3-DAY TRIAL</span>
          <span>·</span>
          <span>NO CREDIT CARD</span>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════ */
function Footer() {
  return (
    <footer className="rv-ft">
      <div className="rv-ft-in">
        <RotovideLogo size="nav" />
        <div className="rv-ft-lk">
          <a href="#tools">Tools</a>
          <a href="#pricing">Pricing</a>
          <a href="#how">How It Works</a>
          <Link to="/auth/login">Log In</Link>
        </div>
        <p className="rv-ft-cp">© 2026 ROTOVIDE. ALL RIGHTS RESERVED.</p>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════
   SCROLL REVEAL HOOK
   ═══════════════════════════════════════ */
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("v");
          }
        });
      },
      { threshold: 0.07, rootMargin: "0px 0px -30px 0px" }
    );
    document.querySelectorAll(".rv-page .rv-r, .rv-page .rv-s").forEach((el) => {
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
}

/* ═══════════════════════════════════════
   PAGE ROOT
   ═══════════════════════════════════════ */
export default function LandingPage() {
  useScrollReveal();
  return (
    <div className="rv-page">
      <Navbar />
      <Hero />
      <Pain />
      <VsComparison />
      <WhoItsFor />
      <FourTools />
      <DeepFeatures />
      <DirectorChatSection />
      <ThatApp />
      <MusicRights />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  );
}
