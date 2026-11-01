import * as React from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

const TIP_OPTIONS = [10, 20, 30, 50];

interface DeliveryTipSelectorProps {
  selectedTip: number;
  onSelectTip: (tipAmount: number) => void;
  className?: string;
}

/**
 * DeliveryTipSelector — Lets customers add tips for delivery riders.
 * 100% of tips are passed directly to the rider payout ledger.
 */
export function DeliveryTipSelector({
  selectedTip,
  onSelectTip,
  className,
}: DeliveryTipSelectorProps) {
  const [customActive, setCustomActive] = React.useState(false);
  const [customValue, setCustomValue] = React.useState("");

  const handleTipClick = (amount: number) => {
    void HapticService.selection();
    setCustomActive(false);
    if (selectedTip === amount) {
      onSelectTip(0);
    } else {
      onSelectTip(amount);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customValue, 10);
    if (!isNaN(val) && val > 0 && val <= 500) {
      void HapticService.impact("light");
      onSelectTip(val);
      setCustomActive(false);
    }
  };

  return (
    <div
      className={cn(
        "space-y-3 rounded-[var(--radius-large)] border border-divider bg-surface p-4 shadow-xs sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-medium)] bg-accent/10">
            <Heart className="h-4 w-4 text-accent" aria-hidden />
          </div>
          <h4 className="type-title-medium text-text-primary">Tip your delivery partner</h4>
        </div>
        {selectedTip > 0 && (
          <button
            type="button"
            onClick={() => onSelectTip(0)}
            className="-mr-2 inline-flex min-h-[44px] items-center px-2 type-caption font-semibold text-primary-text hover:underline transition-colors cursor-pointer"
          >
            Clear Tip
          </button>
        )}
      </div>

      <p className="type-caption text-text-secondary">
        100% of your tip goes directly to your delivery partner.
      </p>

      {/* Preset Tip Buttons */}
      <div className="overflow-x-auto no-scrollbar">
        <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-5">
          {TIP_OPTIONS.map((amount) => {
            const isSelected = selectedTip === amount && !customActive;
            return (
              <button
                key={amount}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleTipClick(amount)}
                className={cn(
                  "min-h-[44px] rounded-[var(--radius-medium)] border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer select-none text-center",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-divider bg-bg-secondary text-text-primary hover:border-primary/50",
                )}
              >
                ₹{amount}
              </button>
            );
          })}

          <button
            type="button"
            aria-pressed={customActive || (selectedTip > 0 && !TIP_OPTIONS.includes(selectedTip))}
            onClick={() => setCustomActive(true)}
            className={cn(
              "min-h-[44px] rounded-[var(--radius-medium)] border px-3 py-2 text-sm font-semibold transition-colors cursor-pointer select-none min-[400px]:whitespace-nowrap",
              customActive || (selectedTip > 0 && !TIP_OPTIONS.includes(selectedTip))
                ? "border-primary bg-primary text-primary-foreground"
                : "border-divider bg-bg-secondary text-text-secondary hover:text-text-primary",
            )}
          >
            {selectedTip > 0 && !TIP_OPTIONS.includes(selectedTip) ? `₹${selectedTip}` : "Custom"}
          </button>
        </div>
      </div>

      {/* Custom Tip Input */}
      {customActive && (
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-2 pt-1">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-secondary">
              ₹
            </span>
            <input
              type="number"
              min="1"
              max="500"
              placeholder="Enter amount"
              aria-label="Custom tip amount"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="min-h-[44px] w-full rounded-[var(--radius-medium)] border border-border bg-bg-secondary py-2 pl-7 pr-3 text-base font-semibold text-text-primary outline-none transition-colors focus:border-primary"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[var(--radius-medium)] bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover cursor-pointer"
          >
            Apply
          </button>
        </form>
      )}
    </div>
  );
}

export default DeliveryTipSelector;
