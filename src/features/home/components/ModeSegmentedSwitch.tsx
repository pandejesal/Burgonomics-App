import * as React from "react";
import { Bike, Store as StoreIcon, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Fulfillment } from "@/features/stores/state/storeStore";
import { HapticService } from "@/core/services/haptics";

interface Props {
  value: Fulfillment | null;
  onChange: (mode: Fulfillment) => void;
  className?: string;
}

const MODES: Array<{ id: Fulfillment; label: string; Icon: typeof Bike }> = [
  { id: "delivery", label: "Delivery", Icon: Bike },
  { id: "takeaway", label: "Takeaway", Icon: StoreIcon },
  { id: "dinein", label: "Dine-In", Icon: UtensilsCrossed },
];

/**
 * ModeSegmentedSwitch — 3-mode fulfillment switch (Delivery / Takeaway /
 * Dine-In). Selection only; the store writes through to the shared
 * store-selection state.
 */
export const ModeSegmentedSwitch = React.memo(function ModeSegmentedSwitch({
  value,
  onChange,
  className,
}: Props) {
  return (
    <div role="radiogroup" aria-label="Fulfillment mode" className={cn("grid grid-cols-3 gap-1 rounded-2xl bg-black/20 p-1 backdrop-blur-xs", className)}>
      {MODES.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              void HapticService.selection();
              onChange(id);
            }}
            className={cn(
              "flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wide transition-all cursor-pointer",
              active ? "bg-white text-[#0E4825] shadow-sm" : "text-white/70 hover:text-white",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
});
