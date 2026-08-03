import * as React from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
}

const THRESHOLD = 72;
const MAX_PULL = 120;

/**
 * Lightweight touch-based pull-to-refresh. Only activates when the
 * document is scrolled to the top. Falls back to no-op on desktop.
 */
export function PullToRefresh({ children, onRefresh, disabled }: Props) {
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const startY = React.useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || refreshing) return;
    if (window.scrollY > 0) return;
    startY.current = e.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    // Damped pull so the surface feels rubbery.
    const damped = Math.min(MAX_PULL, dy * 0.5);
    setPull(damped);
  };

  const onTouchEnd = async () => {
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  const showTrigger = pull > 8 || refreshing;
  const indicatorOffset = refreshing ? THRESHOLD : pull;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className="relative"
    >
      <div
        aria-hidden={!showTrigger}
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center",
          "transition-opacity",
          showTrigger ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: `translateY(${indicatorOffset - 40}px)` }}
      >
        <div className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-[var(--shadow-medium)]">
          {refreshing ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          ) : (
            <ArrowDown
              className={cn(
                "h-5 w-5 text-primary transition-transform duration-200",
                pull >= THRESHOLD && "rotate-180",
              )}
              aria-hidden
            />
          )}
        </div>
      </div>
      <div
        style={{
          transform: refreshing
            ? `translateY(${THRESHOLD * 0.4}px)`
            : `translateY(${pull * 0.4}px)`,
          transition: startY.current == null ? "transform 200ms ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
