import * as React from "react";
import { cn } from "@/lib/utils";

interface BrandMascotProps {
  size?: number;
  className?: string;
  float?: boolean;
  alt?: string;
}

/**
 * BURGONOMICS mascot — the branded burger character used across
 * splash, empty states, error screens, and marketing surfaces.
 */
export function BrandMascot({
  size = 160,
  className,
  float = false,
  alt = "BURGONOMICS mascot",
}: BrandMascotProps) {
  return (
    <img
      src="/burgonomics-logo.png"
      alt={alt}
      width={size}
      height={size}
      className={cn(
        "select-none object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]",
        float && "animate-mascot-float",
        className,
      )}
      draggable={false}
    />
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <span className="type-display-large tracking-[0.08em] text-primary-foreground">
        BURGONOMICS
      </span>
      <span className="type-caption uppercase text-primary">The House of DAMN GOOD BURGERS!!</span>
    </div>
  );
}
