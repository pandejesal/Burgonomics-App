import * as React from "react";
import { Skeleton } from "@/shared/components/feedback/Skeleton";

export function HomeSkeleton() {
  return (
    <div className="space-y-6 pb-6" aria-busy="true" aria-label="Loading home">
      {/* Store header */}
      <div className="px-4 pt-3">
        <Skeleton className="h-20 w-full rounded-[var(--radius-large)]" />
      </div>

      {/* Greeting + search */}
      <div className="space-y-3 px-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>

      {/* Banner */}
      <div className="px-4">
        <Skeleton className="h-[148px] w-full rounded-[var(--radius-large)]" />
      </div>

      {/* Categories */}
      <div className="grid grid-cols-3 gap-3 px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-[var(--radius-large)]" />
        ))}
      </div>

      {/* Rails */}
      {Array.from({ length: 2 }).map((_, r) => (
        <div key={r} className="space-y-3">
          <div className="px-4">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="flex gap-3 overflow-hidden px-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-[180px] shrink-0 rounded-[var(--radius-large)]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
