import * as React from "react";
import { Bike, ChevronDown, ShoppingBag, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Fulfillment } from "@/features/stores/models/Store";

interface Props {
  value: Fulfillment | null;
  onClick: () => void;
  className?: string;
}

const META: Record<Fulfillment, { label: string; Icon: typeof Bike }> = {
  delivery: { label: "Delivery", Icon: Bike },
  takeaway: { label: "Takeaway", Icon: ShoppingBag },
  dinein: { label: "Dine-In", Icon: Utensils },
};

/**
 * Compact, tappable chip that surfaces the current fulfillment method
 * and re-opens the FulfillmentSheet on tap. Used in the Home header
 * and anywhere else the current fulfillment needs to be visible.
 */
export function FulfillmentChip({ value, onClick, className }: Props) {
  const meta = value ? META[value] : null;
  const Icon = meta?.Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={meta ? `Fulfillment: ${meta.label}. Tap to change.` : "Choose fulfillment method"}
      className={cn(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-full",
        "border border-primary/30 bg-primary/5 px-3 py-1 text-primary",
        "hover:bg-primary/10 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
      <span className="type-label-large font-medium">{meta?.label ?? "Choose fulfillment"}</span>
      <ChevronDown className="h-4 w-4" aria-hidden />
    </button>
  );
}
