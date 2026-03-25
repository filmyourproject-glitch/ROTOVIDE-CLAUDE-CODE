import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Logo mark */}
            <div
              className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "hsl(var(--primary) / 0.15)" }}
            >
              <span
                className="text-2xl font-bold"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  color: "hsl(var(--primary))",
                  letterSpacing: 2,
                }}
              >
                R
              </span>
            </div>

            <div className="space-y-2">
              <h1
                className="text-2xl text-foreground tracking-wider"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                SOMETHING WENT WRONG
              </h1>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Your work has been saved.
              </p>
            </div>

            {/* Error detail */}
            {this.state.error?.message && (
              <div
                className="rounded-lg px-4 py-3 text-left"
                style={{
                  background: "hsl(0 0% 7%)",
                  border: "1px solid hsl(0 0% 15%)",
                }}
              >
                <p
                  className="text-xs text-muted-foreground break-words"
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  {this.state.error.message}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))",
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: 2,
                  fontSize: 14,
                }}
              >
                RELOAD PAGE
              </button>
              <a
                href="/app/dashboard"
                className="px-6 py-2.5 rounded-lg text-sm font-semibold border transition-colors hover:bg-muted/30"
                style={{
                  borderColor: "hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: 2,
                  fontSize: 14,
                }}
              >
                GO TO DASHBOARD
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
