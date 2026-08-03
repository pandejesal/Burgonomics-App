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
 * Each child is wrapped in an equal-width snap cell.
 */
export function HorizontalRail({ children, className, itemClassName, ariaLabel }: Props) {
  const items = React.Children.toArray(children);
  return (
    <div
      role={ariaLabel ? "list" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((child, i) => (
        <div
          key={i}
          role={ariaLabel ? "listitem" : undefined}
          className={cn("snap-start shrink-0", itemClassName)}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
