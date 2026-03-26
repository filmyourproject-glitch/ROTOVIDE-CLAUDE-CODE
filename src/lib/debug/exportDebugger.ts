/**
 * Export Debugger — tracks the full export lifecycle for debugging.
 * Phases: init -> trigger -> processing -> mux_upload -> mux_ready -> completed/failed
 */
import { errorTracker } from "@/lib/errorTracking";

export type ExportPhase =
  | "init"
  | "trigger"
  | "processing"
  | "mux_upload"
  | "mux_ready"
  | "completed"
  | "failed";

export interface ExportPhaseEntry {
  phase: ExportPhase;
  timestamp: number;
  duration?: number; // ms since previous phase
  data?: Record<string, unknown>;
  error?: string;
}

export interface ExportSession {
  exportId: string;
  projectId: string;
  startedAt: number;
  phases: ExportPhaseEntry[];
  currentPhase: ExportPhase;
  manifestClipCount?: number;
}

class ExportDebugger {
  private sessions = new Map<string, ExportSession>();
  private listeners = new Set<(sessions: ExportSession[]) => void>();

  /**
   * Start tracking a new export.
   */
  startSession(
    exportId: string,
    projectId: string,
    manifestClipCount?: number,
  ): void {
    const session: ExportSession = {
      exportId,
      projectId,
      startedAt: Date.now(),
      phases: [{ phase: "init", timestamp: Date.now() }],
      currentPhase: "init",
      manifestClipCount,
    };

    this.sessions.set(exportId, session);
    this.notify();

    if (import.meta.env.DEV) {
      console.log(`[ExportDebugger] Session started: ${exportId} (${manifestClipCount} clips)`);
    }
  }

  /**
   * Record a phase transition.
   */
  recordPhase(
    exportId: string,
    phase: ExportPhase,
    data?: Record<string, unknown>,
    error?: string,
  ): void {
    const session = this.sessions.get(exportId);
    if (!session) return;

    const prevPhase = session.phases[session.phases.length - 1];
    const duration = prevPhase ? Date.now() - prevPhase.timestamp : undefined;

    session.phases.push({
      phase,
      timestamp: Date.now(),
      duration,
      data,
      error,
    });
    session.currentPhase = phase;

    if (phase === "failed" && error) {
      errorTracker.track(
        `Export ${exportId} failed: ${error}`,
        "render",
        "critical",
        { exportId, projectId: session.projectId, phase: prevPhase?.phase },
      );
    }

    this.notify();

    if (import.meta.env.DEV) {
      const elapsed = Date.now() - session.startedAt;
      console.log(
        `[ExportDebugger] ${exportId}: ${phase}${duration ? ` (+${(duration / 1000).toFixed(1)}s)` : ""} [total: ${(elapsed / 1000).toFixed(1)}s]`,
      );
    }
  }

  /**
   * Get a session by export ID.
   */
  getSession(exportId: string): ExportSession | undefined {
    return this.sessions.get(exportId);
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): ExportSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get total time for a completed/failed export.
   */
  getTotalTime(exportId: string): number | null {
    const session = this.sessions.get(exportId);
    if (!session) return null;
    const lastPhase = session.phases[session.phases.length - 1];
    return lastPhase ? lastPhase.timestamp - session.startedAt : null;
  }

  /**
   * Get formatted timing report for an export.
   */
  getTimingReport(exportId: string): string[] {
    const session = this.sessions.get(exportId);
    if (!session) return ["No session found"];

    return session.phases.map((p) => {
      const rel = ((p.timestamp - session.startedAt) / 1000).toFixed(1);
      const dur = p.duration ? ` (+${(p.duration / 1000).toFixed(1)}s)` : "";
      const err = p.error ? ` [ERROR: ${p.error}]` : "";
      return `[${rel}s] ${p.phase}${dur}${err}`;
    });
  }

  clear(): void {
    this.sessions.clear();
    this.notify();
  }

  subscribe(listener: (sessions: ExportSession[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getAllSessions();
    this.listeners.forEach((fn) => fn(snapshot));
  }
}

/** Singleton instance */
export const exportDebugger = new ExportDebugger();
