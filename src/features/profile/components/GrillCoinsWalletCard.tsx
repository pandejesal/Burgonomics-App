import * as React from "react";
import { Coins, Award } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import { formatINR } from "@/core/utils/format";
import { useLoyaltyStore, tierFor } from "@/features/loyalty/state/loyaltyStore";

interface GrillCoinsWalletCardProps {
  balance?: number;
  tier?: string;
  className?: string;
}

/**
 * LoyaltyPointsWalletCard (legacy name GrillCoinsWalletCard) — live Loyalty Points balance.
 * 1 point = Rs.1, redeemable up to 20% of subtotal. Balance is shared via loyaltyStore.
 */
export function GrillCoinsWalletCard({
  balance: balanceProp,
  tier: tierProp,
  className,
}: GrillCoinsWalletCardProps) {
  const storeBalance = useLoyaltyStore((s) => s.balance);
  const balance = balanceProp ?? storeBalance;
  const tier = tierProp ?? tierFor(balance);
  return (
    <Link
      to="/offers"
      onClick={() => void HapticService.selection()}
      className={cn(
        "relative block select-none overflow-hidden rounded-2xl border border-primary bg-primary p-5 text-primary-foreground shadow-md cursor-pointer",
        className
      )}
    >
      {/* Subtle Background Glow */}
      <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-accent/15 blur-2xl" aria-hidden />

      <div className="relative z-10 flex items-start justify-between gap-4">
        {/* Left Wallet Info */}
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 bg-white/15 text-primary-foreground">
              <Coins className="h-4 w-4" aria-hidden />
            </div>
            <span className="type-label-large text-primary-foreground">
              Loyalty Points
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2 pt-1">
            <span className="text-3xl font-semibold tabular-nums text-primary-foreground">
              {balance}
            </span>
            <span className="text-sm text-primary-foreground/85">
              pts ({formatINR(balance)} value)
            </span>
          </div>

          <p className="pt-1 text-sm leading-relaxed text-primary-foreground/85">
            Redeem on any order for up to 20% discount
          </p>
        </div>

        {/* Right Tier Badge */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-sm font-semibold text-primary-foreground">
            <Award className="h-3.5 w-3.5" aria-hidden />
            <span>{tier} Tier</span>
          </div>
          {/* P1-10: "2x Earn Rate" + chevron removed — no earn-rate program
              exists server-side; the card itself now links to /offers. */}
        </div>
      </div>
    </Link>
  );
}

export const LoyaltyPointsWalletCard = GrillCoinsWalletCard;

export default GrillCoinsWalletCard;
