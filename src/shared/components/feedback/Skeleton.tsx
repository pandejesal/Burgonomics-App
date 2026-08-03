import * as React from "react";
import { cn } from "@/lib/utils";

/** Skeleton — pulsing block used inside skeleton loaders. */
export function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden {...rest} />;
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-large)] border border-divider bg-surface p-3">
      <Skeleton className="mb-3 aspect-square w-full" />
      <Skeleton className="mb-2 h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/**
 * ListSkeleton — generic vertical list placeholder used by cart, orders,
 * notifications, favorites, addresses and other list-driven screens.
 * Keeping this in one place ensures consistent perceived-loading behaviour
 * across every feature.
 */
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn("space-y-3 px-4 py-4", className)}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-medium)] border border-divider bg-surface p-4"
        >
          <Skeleton className="mb-2 h-4 w-1/2" />
          <Skeleton className="mb-1 h-3 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
