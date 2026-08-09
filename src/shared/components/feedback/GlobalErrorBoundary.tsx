import * as React from "react";
import { RefreshCw, RotateCcw, AlertTriangle } from "lucide-react";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[BURGONOMICS] Global Error Boundary caught error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetStorage = () => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* ignore storage clear exception */
    }
    if (
      window.location.protocol === "file:" ||
      window.location.pathname.includes("android_asset")
    ) {
      window.location.hash = "/";
      window.location.reload();
    } else {
      window.location.href = "/";
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-background px-6 py-12 text-center"
        >
          <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-error/10 text-error">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <Text variant="headlineMedium" as="h1">
                Something went wrong
              </Text>
              <Text variant="bodyMedium" tone="secondary">
                The application encountered an unexpected state. Tap below to refresh or restore the
                app.
              </Text>
            </div>

            {this.state.error?.message && (
              <div className="w-full rounded-[var(--radius-medium)] border border-divider bg-surface p-3 text-left">
                <Text variant="caption" tone="secondary" className="font-mono break-all">
                  {this.state.error.message}
                </Text>
              </div>
            )}

            <div className="flex w-full flex-col gap-3 pt-2">
              <AppButton
                variant="primary"
                fullWidth
                size="lg"
                onClick={this.handleReload}
                iconLeft={<RefreshCw className="h-4 w-4" />}
              >
                Reload App
              </AppButton>
              <AppButton
                variant="outlined"
                fullWidth
                size="md"
                onClick={this.handleResetStorage}
                iconLeft={<RotateCcw className="h-4 w-4" />}
              >
                Clear Cache & Reset
              </AppButton>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
