import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Branded spinner — animated BURGONOMICS mascot inside a rotating
 * orange ring. Falls back gracefully when a text label is needed.
 */
export function Spinner({
  className,
  size = 32,
  label = "Loading",
}: {
  className?: string;
  size?: number;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin"
      />
      <img
        src="/burgonomics-logo.png"
        alt=""
        aria-hidden
        className="animate-mascot-float object-contain"
        style={{ width: size * 0.62, height: size * 0.62 }}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullScreenLoader({ label = "Firing up the grill" }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={72} label={label} />
        <p className="type-body-medium text-text-secondary">{label}…</p>
      </div>
    </div>
  );
}
