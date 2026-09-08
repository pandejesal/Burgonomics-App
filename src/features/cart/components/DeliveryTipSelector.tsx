import * as React from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/core/utils/format";
import { HapticService } from "@/core/services/haptics";

interface Props {
  selectedTip: number;
  onSelectTip: (tip: number) => void;
  className?: string;
}

const TIP_PRESETS = [0, 10, 20, 30];

/**
 * DeliveryTipSelector — presentational tip picker. The selected rupee
 * value is owned by the caller (persisted to checkout state so it
 * reaches the order + payment payloads — never local-only).
 */
export function DeliveryTipSelector({ selectedTip, onSelectTip, className }: Props) {
  return (
    <section aria-label="Delivery partner tip" className={cn("space-y-2", className)}>
      <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
        Thank Your Delivery Partner
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {TIP_PRESETS.map((tip) => {
          const selected = selectedTip === tip;
          return (
            <button
              key={tip}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                void HapticService.selection();
                onSelectTip(tip);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 min-h-[44px] text-xs font-medium border transition-all cursor-pointer",
                selected
                  ? "bg-[#0E4825] text-white border-[#0E4825] shadow-xs font-bold"
                  : "bg-surface text-text-secondary border-divider hover:border-primary/40",
              )}
            >
              {tip === 0 ? (
                "No tip"
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3 w-3" aria-hidden />
                  {formatINR(tip)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-text-secondary">
        100% of the tip goes to your delivery partner.
      </p>
    </section>
  );
}
