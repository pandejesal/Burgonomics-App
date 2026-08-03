export function MenuSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-4 py-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-[var(--radius-medium)] border border-divider bg-surface p-3"
        >
          <div className="skeleton h-24 w-24 flex-none rounded-[var(--radius-medium)]" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="skeleton h-4 w-1/2 rounded" />
            <div className="skeleton h-3 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/3 rounded" />
            <div className="mt-auto skeleton h-8 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
