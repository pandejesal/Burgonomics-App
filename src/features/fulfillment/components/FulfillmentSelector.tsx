import * as React from "react";
import { Bike, ShoppingBag, UtensilsCrossed, ChevronDown } from "lucide-react";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import type { Fulfillment } from "@/features/stores/models/Store";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

interface FulfillmentSelectorProps {
  className?: string;
  onOpenStorePicker?: () => void;
}

export function FulfillmentSelector({
  className,
  onOpenStorePicker,
}: FulfillmentSelectorProps) {
  const fulfillment = useStoreSelection((s) => s.fulfillment) || "delivery";
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);
  const activeStore = useStoreSelection((s) => s.activeStore);

  const options: { id: Fulfillment; label: string; icon: React.ReactNode }[] = [
    {
      id: "delivery",
      label: "Delivery",
      icon: <Bike className="w-3.5 h-3.5" />,
    },
    {
      id: "takeaway",
      label: "Takeaway",
      icon: <ShoppingBag className="w-3.5 h-3.5" />,
    },
    {
      id: "dinein",
      label: "Dine-In",
      icon: <UtensilsCrossed className="w-3.5 h-3.5" />,
    },
  ];

  const handleSelect = (mode: Fulfillment) => {
    void HapticService.selection();
    setFulfillment(mode);
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-30 w-full bg-surface/95 backdrop-blur-md border-b border-divider py-2 px-4 shadow-xs",
        className
      )}
    >
      <div className="mx-auto max-w-[520px] flex items-center justify-between gap-2">
        {/* 3-Way Segmented Mode Switch */}
        <div className="flex items-center p-1 bg-bg-secondary rounded-xl border border-divider">
          {options.map((opt) => {
            const isSelected = fulfillment === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  isSelected
                    ? "bg-primary text-white shadow-xs"
                    : "text-text-secondary hover:text-text"
                )}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Store Context Link */}
        {activeStore && (
          <button
            type="button"
            onClick={onOpenStorePicker}
            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-hover transition-colors truncate max-w-[150px] cursor-pointer"
          >
            <span className="truncate">{activeStore.name}</span>
            <ChevronDown className="w-3 h-3 shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}

export default FulfillmentSelector;
