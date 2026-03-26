/**
 * Dev-only floating debug panel.
 * Toggle with Ctrl+Shift+D.
 * Tabs: Errors | Health | Performance
 */
import { useState, useEffect, useCallback } from "react";
import {
  errorTracker,
  installGlobalErrorHandlers,
  type TrackedError,
  type ErrorCategory,
} from "@/lib/errorTracking";
import {
  apiHealthMonitor,
  type ServiceHealth,
} from "@/lib/apiHealthMonitor";

const CATEGORY_COLORS: Record<ErrorCategory, string> = {
  network: "bg-yellow-500",
  auth: "bg-red-500",
  render: "bg-purple-500",
  media: "bg-blue-500",
  ui: "bg-orange-500",
  edge_function: "bg-pink-500",
  unknown: "bg-gray-500",
};

const SEVERITY_BADGE: Record<string, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

function ErrorRow({ error }: { error: TrackedError }) {
  const age = Date.now() - error.timestamp;
  const ageStr =
    age < 60_000
      ? `${Math.floor(age / 1000)}s ago`
      : age < 3_600_000
        ? `${Math.floor(age / 60_000)}m ago`
        : `${Math.floor(age / 3_600_000)}h ago`;

  return (
    <div className="border-b border-gray-700 px-2 py-1.5 text-xs hover:bg-gray-800/50">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${CATEGORY_COLORS[error.category]}`}
          title={error.category}
        />
        <span className={`font-mono ${SEVERITY_BADGE[error.severity]}`}>
          {error.severity.toUpperCase()}
        </span>
        {error.count > 1 && (
          <span className="rounded bg-gray-700 px-1 text-[10px] text-gray-300">
            x{error.count}
          </span>
        )}
        <span className="ml-auto text-gray-500">{ageStr}</span>
      </div>
      <p className="mt-0.5 truncate text-gray-300">{error.message}</p>
    </div>
  );
}

function HealthRow({ name, health }: { name: string; health: ServiceHealth }) {
  const statusColor =
    health.status === "healthy"
      ? "bg-green-500"
      : health.status === "degraded"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2 border-b border-gray-700 px-2 py-1.5 text-xs">
      <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} />
      <span className="font-mono text-gray-200">{name}</span>
      {health.responseTime != null && (
        <span className="text-gray-500">{health.responseTime}ms</span>
      )}
      {health.consecutiveFailures > 0 && (
        <span className="text-red-400">
          {health.consecutiveFailures} fail{health.consecutiveFailures > 1 ? "s" : ""}
        </span>
      )}
      <span className="ml-auto text-gray-500">
        {health.lastChecked ? new Date(health.lastChecked).toLocaleTimeString() : "—"}
      </span>
    </div>
  );
}

type Tab = "errors" | "health";

export default function DebugPanel() {
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<Tab>("errors");
  const [errors, setErrors] = useState<TrackedError[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, ServiceHealth>>({});

  // Install global error handlers on mount
  useEffect(() => {
    const cleanup = installGlobalErrorHandlers();
    return cleanup;
  }, []);

  // Subscribe to error tracker
  useEffect(() => {
    setErrors([...errorTracker.getErrors()]);
    return errorTracker.subscribe(setErrors);
  }, []);

  // Subscribe to health monitor
  useEffect(() => {
    setHealthMap(apiHealthMonitor.getHealth());
    return apiHealthMonitor.subscribe(setHealthMap);
  }, []);

  // Toggle with Ctrl+Shift+D
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === "D") {
      e.preventDefault();
      setVisible((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const copyErrors = useCallback(() => {
    navigator.clipboard.writeText(errorTracker.toJSON());
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex w-[420px] max-h-[500px] flex-col rounded-lg border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur-sm"
      style={{ fontFamily: "monospace" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-1.5">
        <span className="text-xs font-bold text-gray-200">DEBUG PANEL</span>
        <div className="flex gap-1">
          <button
            onClick={copyErrors}
            className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-700 hover:text-white"
            title="Copy errors as JSON"
          >
            COPY
          </button>
          <button
            onClick={() => errorTracker.clear()}
            className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            CLEAR
          </button>
          <button
            onClick={() => setVisible(false)}
            className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            X
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {(["errors", "health"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-2 py-1 text-xs uppercase ${
              tab === t
                ? "border-b-2 border-blue-500 text-blue-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t}
            {t === "errors" && errors.length > 0 && (
              <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">
                {errors.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "errors" && (
          errors.length === 0 ? (
            <p className="p-4 text-center text-xs text-gray-500">
              No errors tracked yet.
            </p>
          ) : (
            errors.map((err) => <ErrorRow key={err.id} error={err} />)
          )
        )}

        {tab === "health" && (
          Object.keys(healthMap).length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500">
              <p>No health data yet.</p>
              <button
                onClick={() => apiHealthMonitor.checkAll()}
                className="mt-2 rounded bg-gray-700 px-2 py-1 text-gray-300 hover:bg-gray-600"
              >
                Run Health Check
              </button>
            </div>
          ) : (
            Object.entries(healthMap).map(([name, health]) => (
              <HealthRow key={name} name={name} health={health} />
            ))
          )
        )}
      </div>
    </div>
  );
}
