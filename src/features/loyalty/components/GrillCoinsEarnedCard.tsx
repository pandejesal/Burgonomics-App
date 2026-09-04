import * as React from "react";
import { Coins, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { formatINR } from "@/core/utils/format";

interface GrillCoinsEarnedCardProps {
  coinsEarned?: number;
  pointsEarned?: number;
  totalSubtotal?: number;
  className?: string;
}

export function GrillCoinsEarnedCard({
  coinsEarned,
  pointsEarned,
  totalSubtotal,
  className,
}: GrillCoinsEarnedCardProps) {
  const earned = pointsEarned ?? coinsEarned ?? 0;
  if (earned <= 0) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-[#0E4825]/10 to-amber-500/5 p-4 shadow-sm select-none",
        className
      )}
    >
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-xs">
          <Coins className="w-6 h-6 stroke-[2.2px] animate-bounce" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Loyalty Rewards
            </span>
          </div>

          <p className="text-sm sm:text-base font-black text-text">
            +{earned} Loyalty Points Added!
          </p>

          <p className="text-xs text-text-secondary">
            You have earned <span className="font-bold text-[#0E4825] dark:text-[#4ADE80]">{formatINR(earned)} in wallet credit</span> (1 point = Rs.1). Use them to save on your next order.
          </p>

          <div className="pt-1.5 flex items-center gap-2">
            <Link
              to="/profile"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
            >
              <span>View Loyalty Wallet</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export const LoyaltyPointsEarnedCard = GrillCoinsEarnedCard;

export default GrillCoinsEarnedCard;
