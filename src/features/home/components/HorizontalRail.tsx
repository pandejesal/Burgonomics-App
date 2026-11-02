import * as React from "react";
import { cn } from "@/lib/utils";
import { useDirectionalScroll } from "@/shared/hooks/useDirectionalScroll";

interface Props {
  children: React.ReactNode;
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
}

/**
 * Horizontal scroll rail with snap points and hidden scrollbars.
 * Features native momentum scroll-snap and contained overscroll to prevent chain-scrolling.
 */
export function HorizontalRail({ children, className, itemClassName, ariaLabel }: Props) {
  const items = React.Children.toArray(children);
  const containerRef = React.useRef<HTMLDivElement>(null);
  useDirectionalScroll(containerRef);

  return (
    <div
      ref={containerRef}
      role={ariaLabel ? "list" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "flex gap-3 overflow-x-auto px-4 pb-1 touch-pan-y overscroll-x-contain no-scrollbar",
        className,
      )}
      // `.no-scrollbar` (styles.css) is UNLAYERED and sets
      // `overscroll-behavior: contain` on BOTH axes, so a Tailwind
      // `overscroll-y-auto` utility would lose to it. That blanket
      // containment is the bug: `overflow-x: auto` makes this element a
      // vertical scroll container too (CSS Overflow §3 computes the visible
      // axis to `auto`), so `contain` stopped the vertical gesture from
      // chaining to the document — the page could not scroll at all when the
      // finger started on a rail. Keep X contained (the rail must not fling
      // the page sideways) and hand Y back to the browser.
      style={{ overscrollBehaviorY: "auto" }}
    >
      {items.map((child, i) => (
        <div
          key={i}
          role={ariaLabel ? "listitem" : undefined}
          className={cn("shrink-0", itemClassName)}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
