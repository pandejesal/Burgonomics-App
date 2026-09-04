import * as React from "react";
import { Coins, ChevronRight, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import { formatINR } from "@/core/utils/format";
import { useLoyaltyStore } from "@/features/loyalty/state/loyaltyStore";

interface GrillCoinsWalletCardProps {
  balance?: number;
  tier?: string;
  className?: string;
}

function tierFor(lifetimeEarned: number): string {
  if (lifetimeEarned >= 700) return "Gold";
  if (lifetimeEarned >= 300) return "Silver";
  return "Bronze";
}

/**
 * LoyaltyPointsWalletCard (legacy name GrillCoinsWalletCard) — live Loyalty Points balance.
 * 1 point = Rs.1, redeemable up to 50% of subtotal. Balance is shared via loyaltyStore.
 */
export function GrillCoinsWalletCard({
  balance: balanceProp,
  tier: tierProp,
  className,
}: GrillCoinsWalletCardProps) {
  const storeBalance = useLoyaltyStore((s) => s.balance);
  const lifetimeEarned = useLoyaltyStore((s) => s.lifetimeEarned);
  const balance = balanceProp ?? storeBalance;
  const tier = tierProp ?? tierFor(lifetimeEarned);
  return (
    <div
      onClick={() => void HapticService.selection()}
      className={cn(
        "p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#0E4825] to-[#082a16] text-white border border-[#0E4825]/40 shadow-md relative overflow-hidden select-none cursor-pointer",
        className
      )}
    >
      {/* Subtle Background Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        {/* Left Wallet Info */}
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Coins className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">
              Loyalty Points
            </span>
          </div>

          <div className="flex items-baseline gap-2 pt-1 flex-wrap">
            <span className="text-2xl sm:text-3xl font-black font-mono text-white">
              {balance}
            </span>
            <span className="text-xs text-emerald-200/80 font-medium">
              pts ({formatINR(balance)} value)
            </span>
          </div>

          <p className="text-[11px] text-emerald-100/70 pt-1">
            Redeem on any order for up to 50% discount
          </p>
        </div>

        {/* Right Tier Badge */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-wider">
            <Award className="w-3.5 h-3.5" />
            <span>{tier} Tier</span>
          </div>
          <span className="text-[10px] text-emerald-200/80 font-bold flex items-center gap-1">
            <span>2x Earn Rate</span>
            <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}

export const LoyaltyPointsWalletCard = GrillCoinsWalletCard;

export default GrillCoinsWalletCard;
