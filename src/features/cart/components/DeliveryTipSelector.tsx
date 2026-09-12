import * as React from "react";
import { Heart, Smile, Check } from "lucide-react";
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
    <div className={cn("p-4 rounded-2xl bg-surface border border-divider space-y-3 shadow-xs", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#FF6600]/10 flex items-center justify-center">
            <Heart className="w-4 h-4 text-[#FF6600] fill-[#FF6600]/20" />
          </div>
          <h4 className="text-xs sm:text-sm font-bold text-text">
            Tip your delivery partner
          </h4>
        </div>
        {selectedTip > 0 && (
          <button
            type="button"
            onClick={() => onSelectTip(0)}
            className="text-[11px] font-bold text-[#FF6600] hover:underline transition-colors cursor-pointer"
          >
            Clear Tip
          </button>
        )}
      </div>

      <p className="text-[11px] text-text-secondary">
        100% of your tip goes directly to your delivery partner.
      </p>

      {/* Preset Tip Buttons */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {TIP_OPTIONS.map((amount) => {
          const isSelected = selectedTip === amount && !customActive;
          return (
            <button
              key={amount}
              type="button"
              onClick={() => handleTipClick(amount)}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer select-none text-center min-h-[38px]",
                isSelected
                  ? "border-[#0E4825] bg-[#0E4825] text-white shadow-xs"
                  : "border-divider bg-bg-secondary text-text hover:border-primary/40"
              )}
            >
              ₹{amount}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setCustomActive(true)}
          className={cn(
            "py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer select-none whitespace-nowrap min-h-[38px]",
            customActive || (selectedTip > 0 && !TIP_OPTIONS.includes(selectedTip))
              ? "border-[#0E4825] bg-[#0E4825] text-white"
              : "border-divider bg-bg-secondary text-text-secondary hover:text-text"
          )}
        >
          {selectedTip > 0 && !TIP_OPTIONS.includes(selectedTip) ? `₹${selectedTip}` : "Custom"}
        </button>
      </div>

      {/* Custom Tip Input */}
      {customActive && (
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-2 pt-1">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-text-secondary">
              ₹
            </span>
            <input
              type="number"
              min="1"
              max="500"
              placeholder="Enter amount"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              className="w-full pl-7 pr-3 py-2 rounded-xl bg-bg-secondary border border-divider text-xs font-mono font-bold text-text outline-none focus:border-primary"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-[#0E4825] text-white text-xs font-bold shadow-xs cursor-pointer hover:bg-[#0b381d]"
          >
            Apply
          </button>
        </form>
      )}
    </div>
  );
}

export default DeliveryTipSelector;
