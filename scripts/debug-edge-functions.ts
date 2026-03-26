#!/usr/bin/env npx tsx
/**
 * Edge Function Health Check Script
 * Usage: npm run debug:edge
 *
 * Tests each Supabase edge function with an OPTIONS request to verify:
 * - Function is deployed and reachable
 * - CORS headers are returned
 * - Response time is acceptable
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
  console.error("Set them via .env or environment before running.");
  process.exit(1);
}

interface FunctionCheck {
  name: string;
  /** Expected auth type */
  auth: "jwt" | "render_secret" | "stripe_sig" | "mux_sig" | "none";
  /** Human description */
  purpose: string;
}

const EDGE_FUNCTIONS: FunctionCheck[] = [
  { name: "trigger-render", auth: "jwt", purpose: "Trigger FFmpeg render on Railway" },
  { name: "create-mux-upload", auth: "jwt", purpose: "Create Mux direct upload" },
  { name: "check-subscription", auth: "jwt", purpose: "Validate Stripe subscription" },
  { name: "create-checkout", auth: "jwt", purpose: "Create Stripe checkout session" },
  { name: "ai-creative-director", auth: "jwt", purpose: "Claude Haiku creative editing" },
  { name: "parallel-edit-gen", auth: "jwt", purpose: "Generate 3 edit style variants" },
  { name: "transcribe-lyrics", auth: "jwt", purpose: "Lyrics transcription" },
  { name: "generate-social-copy", auth: "jwt", purpose: "AI social media captions" },
  { name: "fetch-mux-audio", auth: "jwt", purpose: "Fetch Mux audio rendition" },
  { name: "mux-generate-clips", auth: "jwt", purpose: "Create Mux clip assets" },
  { name: "index-video", auth: "jwt", purpose: "Gemini video scene analysis" },
  { name: "youtube-ingest", auth: "jwt", purpose: "Import video from YouTube" },
  { name: "stripe-webhook", auth: "stripe_sig", purpose: "Stripe payment events" },
  { name: "mux-webhook", auth: "mux_sig", purpose: "Mux asset-ready events" },
  { name: "render-db-proxy", auth: "render_secret", purpose: "Railway DB bridge" },
  { name: "send-notification", auth: "jwt", purpose: "Send notifications" },
  { name: "sync-clips", auth: "jwt", purpose: "Railway waveform sync" },
];

interface TestResult {
  name: string;
  status: "pass" | "fail" | "warn";
  httpStatus: number | null;
  responseTime: number;
  hasCors: boolean;
  error?: string;
}

async function testFunction(fn: FunctionCheck): Promise<TestResult> {
  const url = `${SUPABASE_URL}/functions/v1/${fn.name}`;
  const start = performance.now();

  try {
    const resp = await fetch(url, {
      method: "OPTIONS",
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(10_000),
    });

    const elapsed = Math.round(performance.now() - start);
    const cors = resp.headers.get("access-control-allow-origin");

    return {
      name: fn.name,
      status: resp.ok || resp.status === 204 ? (elapsed > 3000 ? "warn" : "pass") : "fail",
      httpStatus: resp.status,
      responseTime: elapsed,
      hasCors: !!cors,
      error: resp.ok ? undefined : `HTTP ${resp.status}`,
    };
  } catch (err) {
    const elapsed = Math.round(performance.now() - start);
    return {
      name: fn.name,
      status: "fail",
      httpStatus: null,
      responseTime: elapsed,
      hasCors: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log("\n=== ROTOVIDE Edge Function Health Check ===\n");
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Functions to test: ${EDGE_FUNCTIONS.length}\n`);

  const results = await Promise.all(EDGE_FUNCTIONS.map(testFunction));

  // Print table
  const nameWidth = Math.max(...results.map((r) => r.name.length)) + 2;

  console.log(
    "Name".padEnd(nameWidth) +
      "Status".padEnd(8) +
      "HTTP".padEnd(6) +
      "Time".padEnd(8) +
      "CORS".padEnd(6) +
      "Error"
  );
  console.log("-".repeat(nameWidth + 8 + 6 + 8 + 6 + 20));

  for (const r of results) {
    const statusIcon = r.status === "pass" ? "\x1b[32mPASS\x1b[0m" : r.status === "warn" ? "\x1b[33mWARN\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    console.log(
      r.name.padEnd(nameWidth) +
        statusIcon.padEnd(8 + 9) + // extra chars for ANSI codes
        (r.httpStatus?.toString() || "---").padEnd(6) +
        `${r.responseTime}ms`.padEnd(8) +
        (r.hasCors ? "yes" : "no").padEnd(6) +
        (r.error || "")
    );
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const warned = results.filter((r) => r.status === "warn").length;
  const failed = results.filter((r) => r.status === "fail").length;

  console.log(`\nSummary: ${passed} passed, ${warned} warnings, ${failed} failed out of ${results.length}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
