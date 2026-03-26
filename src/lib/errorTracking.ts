/**
 * Runtime error tracking singleton for ROTOVIDE.
 * Captures, deduplicates, and exposes errors for the DebugPanel.
 */

export type ErrorCategory =
  | "network"
  | "auth"
  | "render"
  | "media"
  | "ui"
  | "edge_function"
  | "unknown";

export type ErrorSeverity = "low" | "medium" | "high" | "critical";

export interface TrackedError {
  id: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: number;
  stack?: string;
  context?: Record<string, unknown>;
  /** Number of times this exact error has occurred */
  count: number;
}

type Listener = (errors: TrackedError[]) => void;

let nextId = 1;

class ErrorTracker {
  private errors: TrackedError[] = [];
  private listeners = new Set<Listener>();
  private maxErrors = 200;

  track(
    message: string,
    category: ErrorCategory = "unknown",
    severity: ErrorSeverity = "medium",
    context?: Record<string, unknown>,
    stack?: string,
  ): TrackedError {
    // Deduplicate by message + category
    const existing = this.errors.find(
      (e) => e.message === message && e.category === category,
    );
    if (existing) {
      existing.count++;
      existing.timestamp = Date.now();
      if (context) existing.context = { ...existing.context, ...context };
      this.notify();
      return existing;
    }

    const error: TrackedError = {
      id: `err-${nextId++}`,
      message,
      category,
      severity,
      timestamp: Date.now(),
      stack,
      context,
      count: 1,
    };

    this.errors.unshift(error);

    // Cap stored errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    this.notify();
    return error;
  }

  getErrors(): readonly TrackedError[] {
    return this.errors;
  }

  getByCategory(category: ErrorCategory): TrackedError[] {
    return this.errors.filter((e) => e.category === category);
  }

  getBySeverity(severity: ErrorSeverity): TrackedError[] {
    return this.errors.filter((e) => e.severity === severity);
  }

  clear(): void {
    this.errors = [];
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toJSON(): string {
    return JSON.stringify(this.errors, null, 2);
  }

  get count(): number {
    return this.errors.length;
  }

  private notify(): void {
    const snapshot = [...this.errors];
    this.listeners.forEach((fn) => fn(snapshot));
  }
}

// Global singleton
export const errorTracker = new ErrorTracker();

// ── Convenience wrappers ────────────────────────────────────

export function trackNetworkError(
  message: string,
  context?: Record<string, unknown>,
): TrackedError {
  return errorTracker.track(message, "network", "medium", context);
}

export function trackEdgeFunctionError(
  functionName: string,
  error: unknown,
  context?: Record<string, unknown>,
): TrackedError {
  const msg =
    error instanceof Error ? error.message : String(error);
  return errorTracker.track(
    `[${functionName}] ${msg}`,
    "edge_function",
    "high",
    { functionName, ...context },
    error instanceof Error ? error.stack : undefined,
  );
}

export function trackMediaError(
  message: string,
  context?: Record<string, unknown>,
): TrackedError {
  return errorTracker.track(message, "media", "medium", context);
}

export function trackAuthError(
  message: string,
  context?: Record<string, unknown>,
): TrackedError {
  return errorTracker.track(message, "auth", "high", context);
}

export function trackRenderError(
  message: string,
  context?: Record<string, unknown>,
): TrackedError {
  return errorTracker.track(message, "render", "critical", context);
}

// ── Global error handlers ───────────────────────────────────

export function installGlobalErrorHandlers(): () => void {
  const handleError = (event: ErrorEvent) => {
    errorTracker.track(
      event.message || "Uncaught error",
      "ui",
      "high",
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      event.error?.stack,
    );
  };

  const handleRejection = (event: PromiseRejectionEvent) => {
    const msg =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
    errorTracker.track(
      `Unhandled rejection: ${msg}`,
      "unknown",
      "high",
      undefined,
      event.reason instanceof Error ? event.reason.stack : undefined,
    );
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
  };
}
