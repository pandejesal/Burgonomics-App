import * as React from "react";
import { Coins, Sparkles, Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

interface GrillCoinsRedemptionProps {
  availableCoins: number;
  subtotal: number;
  redeemedCoins: number;
  onToggleRedemption: (redeem: boolean, coinsToRedeem: number) => void;
  className?: string;
}

/**
 * LoyaltyPointsRedemption (legacy name GrillCoinsRedemption) — 1-tap Loyalty Points redemption.
 * Enforces a strict 20% subtotal redemption ceiling (1 point = Rs.1 discount).
 */
export function GrillCoinsRedemption({
  availableCoins = 250,
  subtotal,
  redeemedCoins,
  onToggleRedemption,
  className,
}: GrillCoinsRedemptionProps) {
  // Max redeemable: up to 20% of subtotal, 1 coin = ₹1 (matches server cap —
  // showing more would overcharge vs display at the gateway).
  const maxRedeemable = Math.min(availableCoins, Math.floor(subtotal * 0.2));
  const isApplied = redeemedCoins > 0;

  const handleToggle = () => {
    void HapticService.selection();
    if (isApplied) {
      onToggleRedemption(false, 0);
    } else {
      if (maxRedeemable > 0) {
        onToggleRedemption(true, maxRedeemable);
      }
    }
  };

  if (availableCoins <= 0) return null;

  return (
    <div
      onClick={maxRedeemable > 0 ? handleToggle : undefined}
      className={cn(
        "p-4 rounded-2xl border transition-all select-none cursor-pointer flex items-center justify-between gap-4 shadow-xs",
        isApplied
          ? "border-[#0E4825] bg-[#0E4825]/10"
          : "border-divider bg-surface hover:border-primary/40",
        maxRedeemable <= 0 && "opacity-60 cursor-not-allowed",
        className
      )}
    >
      {/* Left Icon & Information */}
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 mt-0.5 shadow-xs">
          <Coins className="w-4.5 h-4.5 text-amber-500" />
        </div>

        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs sm:text-sm font-bold text-text">
              Loyalty Points
            </h4>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-black font-mono">
              {availableCoins} pts
            </span>
          </div>

          <p className="text-[11px] text-text-secondary leading-tight">
            {maxRedeemable > 0
              ? isApplied
                ? `Redeeming ${redeemedCoins} pts for Rs.${redeemedCoins} instant discount`
                : `Use ${maxRedeemable} pts for flat Rs.${maxRedeemable} off (Max 20% of bill)`
              : "Add items worth more to unlock points redemption"}
          </p>
        </div>
      </div>

      {/* Right Switch / Checkmark */}
      <div className="shrink-0">
        <div
          role="switch"
          aria-checked={isApplied}
          aria-label="Redeem Loyalty Points"
          className={cn(
            "w-11 h-6 rounded-full transition-colors p-0.5 flex items-center",
            isApplied ? "bg-[#0E4825]" : "bg-divider"
          )}
        >
          <div
            className={cn(
              "w-5 h-5 rounded-full bg-white shadow-sm transition-transform transform",
              isApplied ? "translate-x-5" : "translate-x-0"
            )}
          />
        </div>
      </div>
    </div>
  );
}

export const LoyaltyPointsRedemption = GrillCoinsRedemption;

export default GrillCoinsRedemption;
