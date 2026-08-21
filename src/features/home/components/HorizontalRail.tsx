import * as React from "react";
import { cn } from "@/lib/utils";

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
  return (
    <div
      role={ariaLabel ? "list" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "flex gap-3 overflow-x-auto px-4 pb-1 scroll-smooth [touch-action:pan-x_pan-y] no-scrollbar",
        className,
      )}
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
