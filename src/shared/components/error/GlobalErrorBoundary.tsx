import React, { Component, useState, useEffect } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Home,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import { classifyError, type ClassifiedErrorDetails } from "@/core/errors/errorClassifier";
import { logger } from "@/core/logging/logger";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { BrandMascot } from "@/shared/components/common/BrandMascot";

export interface GlobalErrorFallbackProps {
  error: unknown;
  resetErrorBoundary?: () => void;
  title?: string;
  description?: string;
  compact?: boolean;
  showDiagnostics?: boolean;
}

export function GlobalErrorFallback({
  error,
  resetErrorBoundary,
  title,
  description,
  compact = false,
  showDiagnostics = true,
}: GlobalErrorFallbackProps) {
  const details: ClassifiedErrorDetails = classifyError(error);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      if (resetErrorBoundary) {
        resetErrorBoundary();
      } else {
        window.location.reload();
      }
      setIsRetrying(false);
    }, 400);
  };

  const handleCopyDiagnostics = () => {
    const info = `BURGONOMICS ERROR DIAGNOSTICS
Category: ${details.category}
Error Code: ${details.errorCode || "N/A"}
Message: ${details.originalMessage}
Timestamp: ${new Date().toISOString()}
Online Status: ${online ? "Online" : "Offline"}
User Agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "N/A"}

Technical Details:
${details.technicalDetails || "None provided"}`;

    navigator.clipboard.writeText(info).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const IconComponent = details.Icon;
  const displayTitle = title || details.title;
  const displayDescription = description || details.description;

  if (compact) {
    return (
      <div
        role="alert"
        className="my-4 rounded-2xl border border-border/80 bg-card/95 p-5 shadow-sm backdrop-blur"
      >
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-error/10 text-error">
            <IconComponent className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${details.badgeColor}`}
              >
                {details.badgeLabel}
              </span>
              {details.errorCode && (
                <span className="text-[11px] font-mono text-text-tertiary">
                  {details.errorCode}
                </span>
              )}
            </div>
            <h3 className="type-title-medium mt-1 font-semibold text-text-primary">
              {displayTitle}
            </h3>
            <p className="type-body-small mt-1 text-text-secondary">{displayDescription}</p>

            <div className="mt-4 flex items-center gap-2">
              {resetErrorBoundary && (
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-primary px-4 type-label-medium text-white transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                  <span>Try again</span>
                </button>
              )}
              <a
                href="/home"
                className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-border px-4 type-label-medium text-text-primary transition-all hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Home className="h-3.5 w-3.5" />
                <span>Home</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="app-shell flex min-h-[100dvh] w-full items-center justify-center bg-background px-4 py-12"
    >
      <div className="w-full max-w-lg rounded-3xl border border-border/80 bg-card p-6 shadow-2xl backdrop-blur-md md:p-8">
        <div className="flex flex-col items-center text-center">
          {/* Mascot / Icon Illustration */}
          <div className="relative mb-2">
            <BrandMascot size={120} float />
            <div className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-card border border-border shadow-lg text-error">
              <IconComponent className="h-5 w-5" />
            </div>
          </div>

          {/* Badge & Code */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${details.badgeColor}`}
            >
              {details.badgeLabel}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium ${
                online
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {online ? (
                <>
                  <Wifi className="h-3.5 w-3.5" /> Online
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5" /> Offline
                </>
              )}
            </span>
          </div>

          {/* Headline */}
          <h1 className="type-headline-medium mt-4 font-bold text-text-primary">{displayTitle}</h1>

          {/* Description */}
          <p className="type-body-medium mt-2 text-text-secondary leading-relaxed max-w-md">
            {displayDescription}
          </p>

          {/* Helpful Suggestion */}
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5 text-xs text-text-secondary text-left w-full border border-border/50">
            <AlertCircle className="h-4 w-4 shrink-0 text-primary" />
            <span>{details.suggestion}</span>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-orange-gradient px-7 type-label-large text-primary-foreground shadow-[var(--shadow-brand)] hover:brightness-105 active:scale-95 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
              <span>{isRetrying ? "Reconnecting..." : "Try Again"}</span>
            </button>

            <a
              href="/home"
              className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-border px-6 type-label-large text-text-primary hover:bg-muted/80 transition-all active:scale-95"
            >
              <Home className="h-4 w-4" />
              <span>Take Me Home</span>
            </a>
          </div>

          {/* Collapsible Technical Diagnostics */}
          {showDiagnostics && details.technicalDetails && (
            <div className="mt-6 w-full text-left border-t border-border/60 pt-4">
              <button
                type="button"
                onClick={() => setShowTechDetails(!showTechDetails)}
                className="flex w-full items-center justify-between text-xs font-semibold text-text-tertiary hover:text-text-primary transition-colors py-1"
              >
                <span>Technical Diagnostic Details</span>
                {showTechDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showTechDetails && (
                <div className="mt-3 rounded-xl bg-black/90 p-3.5 text-xs text-gray-200 font-mono shadow-inner border border-gray-800">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800">
                    <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">
                      Error Log
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyDiagnostics}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy Info</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-gray-300">
                    {details.technicalDetails}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((props: { error: unknown; reset: () => void }) => React.ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
  compact?: boolean;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

export class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): GlobalErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error("GlobalErrorBoundary.caught", error, {
      componentStack: errorInfo.componentStack,
    });
    reportLovableError(error, {
      boundary: "GlobalErrorBoundary",
      componentStack: errorInfo.componentStack,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  resetErrorBoundary = (): void => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === "function") {
          return this.props.fallback({
            error: this.state.error,
            reset: this.resetErrorBoundary,
          });
        }
        return this.props.fallback;
      }

      return (
        <GlobalErrorFallback
          error={this.state.error}
          resetErrorBoundary={this.resetErrorBoundary}
          compact={this.props.compact}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Higher Order Component (HOC) for wrapping any React component with the GlobalErrorBoundary.
 */
export function withGlobalErrorBoundary<P extends object>(
  ComponentToWrap: React.ComponentType<P>,
  boundaryProps?: Omit<GlobalErrorBoundaryProps, "children">,
) {
  const WrappedWithBoundary = (props: P) => (
    <GlobalErrorBoundary {...boundaryProps}>
      <ComponentToWrap {...props} />
    </GlobalErrorBoundary>
  );

  WrappedWithBoundary.displayName = `withGlobalErrorBoundary(${
    ComponentToWrap.displayName || ComponentToWrap.name || "Component"
  })`;

  return WrappedWithBoundary;
}
