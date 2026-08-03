import * as React from "react";
import { cn } from "@/lib/utils";

/** VegIndicator — accessible veg/non-veg icon per Design System §22.6 */
export function VegIndicator({ veg, className }: { veg: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center border-[1.5px]",
        veg ? "border-veg" : "border-nonveg",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", veg ? "bg-veg" : "bg-nonveg")} />
    </span>
  );
}
