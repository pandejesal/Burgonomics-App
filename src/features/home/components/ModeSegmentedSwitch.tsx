import * as React from "react";
import { motion } from "motion/react";
import { Bike, ShoppingBag, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import type { Fulfillment } from "@/features/stores/models/Store";

interface ModeSegmentedSwitchProps {
  value: Fulfillment | null;
  onChange: (mode: Fulfillment) => void;
  className?: string;
}

interface ModeOption {
  id: Fulfillment;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  etaText: string;
}

const MODES: ModeOption[] = [
  { id: "delivery", label: "Delivery", Icon: Bike, etaText: "25-30 min" },
  { id: "takeaway", label: "Takeaway", Icon: ShoppingBag, etaText: "Ready in 12 min" },
  { id: "dinein", label: "Dine-In", Icon: Utensils, etaText: "In-Store" },
];

export function ModeSegmentedSwitch({
  value = "delivery",
  onChange,
  className,
}: ModeSegmentedSwitchProps) {
  const current = value || "delivery";

  return (
    <div
      role="radiogroup"
      aria-label="Fulfillment Mode"
      className={cn(
        "relative flex w-full items-center justify-between rounded-full bg-black/20 p-1 backdrop-blur-sm",
        className,
      )}
    >
      {MODES.map(({ id, label, Icon }) => {
        const isSelected = current === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => {
              if (!isSelected) {
                void HapticService.selection();
                onChange(id);
              }
            }}
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors duration-200 outline-none",
              isSelected
                ? "text-primary font-bold"
                : "text-white/80 hover:text-white",
            )}
          >
            {isSelected && (
              <motion.div
                layoutId="activeModePill"
                className="absolute inset-0 z-[-1] rounded-full bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <Icon className={cn("h-3.5 w-3.5", isSelected ? "text-primary stroke-[2.5px]" : "text-white/80")} />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
