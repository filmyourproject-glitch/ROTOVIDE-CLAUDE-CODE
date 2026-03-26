/**
 * API Health Monitor — pings edge functions and tracks status.
 * Singleton consumed by DebugPanel.
 */

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ServiceHealth {
  status: HealthStatus;
  responseTime: number | null;
  lastChecked: number | null;
  consecutiveFailures: number;
  lastError?: string;
}

type HealthListener = (health: Record<string, ServiceHealth>) => void;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Edge functions to health-check via OPTIONS request */
const EDGE_FUNCTIONS = [
  "trigger-render",
  "create-mux-upload",
  "check-subscription",
  "ai-creative-director",
  "transcribe-lyrics",
  "generate-social-copy",
  "index-video",
];

class ApiHealthMonitor {
  private health: Record<string, ServiceHealth> = {};
  private listeners = new Set<HealthListener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Initialize all services with unknown state
    for (const fn of EDGE_FUNCTIONS) {
      this.health[fn] = {
        status: "unknown",
        responseTime: null,
        lastChecked: null,
        consecutiveFailures: 0,
      };
    }
  }

  /** Start periodic health checks (every intervalMs, default 60s) */
  start(intervalMs = 60_000): void {
    if (this.intervalId) return;
    this.checkAll(); // immediate first check
    this.intervalId = setInterval(() => this.checkAll(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Ping all edge functions concurrently */
  async checkAll(): Promise<void> {
    await Promise.allSettled(EDGE_FUNCTIONS.map((fn) => this.checkOne(fn)));
    this.notify();
  }

  /** Ping a single edge function via OPTIONS request */
  private async checkOne(functionName: string): Promise<void> {
    const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const start = performance.now();

    try {
      const resp = await fetch(url, {
        method: "OPTIONS",
        headers: {
          apikey: SUPABASE_ANON_KEY,
        },
        signal: AbortSignal.timeout(10_000),
      });

      const elapsed = Math.round(performance.now() - start);
      const prev = this.health[functionName];

      if (resp.ok || resp.status === 204) {
        this.health[functionName] = {
          status: elapsed > 3000 ? "degraded" : "healthy",
          responseTime: elapsed,
          lastChecked: Date.now(),
          consecutiveFailures: 0,
        };
      } else {
        const failures = (prev?.consecutiveFailures ?? 0) + 1;
        this.health[functionName] = {
          status: failures >= 3 ? "down" : "degraded",
          responseTime: elapsed,
          lastChecked: Date.now(),
          consecutiveFailures: failures,
          lastError: `HTTP ${resp.status}`,
        };
      }
    } catch (err) {
      const prev = this.health[functionName];
      const failures = (prev?.consecutiveFailures ?? 0) + 1;
      this.health[functionName] = {
        status: failures >= 3 ? "down" : "degraded",
        responseTime: null,
        lastChecked: Date.now(),
        consecutiveFailures: failures,
        lastError: err instanceof Error ? err.message : String(err),
      };
    }
  }

  getHealth(): Record<string, ServiceHealth> {
    return { ...this.health };
  }

  getServiceHealth(name: string): ServiceHealth | undefined {
    return this.health[name];
  }

  subscribe(listener: HealthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = { ...this.health };
    this.listeners.forEach((fn) => fn(snapshot));
  }
}

export const apiHealthMonitor = new ApiHealthMonitor();
