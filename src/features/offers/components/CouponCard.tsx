import * as React from "react";
import { useState, useMemo } from "react";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";
import type { Offer } from "../models";
import { validateAndCalculateCoupon } from "../hooks/useCouponValidation";
import { useCartStore } from "@/features/cart/state/cartStore";

interface CouponCardProps {
  offer: Offer;
  applied?: boolean;
  onApply?: (offer: Offer) => void;
  onRemove?: (offer: Offer) => void;
  className?: string;
}

export function CouponCard({
  offer,
  applied = false,
  onApply,
  onRemove,
  className,
}: CouponCardProps) {
  const [copied, setCopied] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const lines = useCartStore((s) => s.lines);
  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  }, [lines]);

  const validation = validateAndCalculateCoupon(offer, subtotal, lines);
  const isEligible = validation.isValid;

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!offer.code) return;
    void HapticService.impact("light");
    navigator.clipboard.writeText(offer.code);
    setCopied(true);
    toast.success(`Coupon code ${offer.code} copied!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void HapticService.impact("medium");
    if (applied) {
      onRemove?.(offer);
    } else {
      if (!isEligible && validation.errorMessage) {
        toast.error(validation.errorMessage);
        return;
      }
      onApply?.(offer);
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-surface overflow-hidden shadow-xs transition-all",
        applied
          ? "border-emerald-500 bg-emerald-950/10 shadow-sm"
          : "border-divider hover:border-primary/50",
        className
      )}
    >
      {/* Ticket Dotted Border Decorative Left Cutout */}
      <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#0A0A0A] border border-divider" />
      <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#0A0A0A] border border-divider" />

      <div className="p-4 sm:p-5 space-y-3">
        {/* Top Header: Badge, Code & Apply Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#FF6600] text-white text-[10px] font-black uppercase tracking-wider shadow-xs">
                {offer.discount.label || "PROMO"}
              </span>

              {offer.code && (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg-secondary hover:bg-divider border border-dashed border-primary text-xs font-mono font-bold text-primary transition-colors cursor-pointer"
                >
                  <span>{offer.code}</span>
                  {copied ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3 text-text-secondary" />
                  )}
                </button>
              )}
            </div>

            <h3 className="text-sm font-bold text-text pt-1">{offer.title}</h3>
            <p className="text-xs text-text-secondary line-clamp-2">{offer.description}</p>
          </div>

          <button
            type="button"
            onClick={handleApplyClick}
            className={cn(
              "shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer",
              applied
                ? "bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900"
                : isEligible
                ? "bg-primary hover:bg-primary-hover text-white"
                : "bg-bg-secondary text-text-secondary border border-divider cursor-not-allowed opacity-80"
            )}
          >
            {applied ? "Applied" : "Apply"}
          </button>
        </div>

        {/* Real-time MOV Progress Bar (if shortfall exists) */}
        {!isEligible && validation.progressToUnlock && (
          <div className="p-2.5 bg-bg-secondary rounded-xl border border-divider space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-amber-400 font-bold">
                Add ₹{validation.progressToUnlock.shortfall} more to unlock
              </span>
              <span className="font-mono text-text-secondary">
                ₹{validation.progressToUnlock.current} / ₹{validation.progressToUnlock.required}
              </span>
            </div>
            <div className="w-full h-1.5 bg-divider rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FF6600] rounded-full transition-all duration-300"
                style={{ width: `${validation.progressToUnlock.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Metadata Footer & Terms Accordion Trigger */}
        <div className="pt-2 border-t border-divider flex items-center justify-between text-[11px] text-text-secondary">
          <div className="flex items-center gap-3">
            {offer.eligibility?.minOrderValue ? (
              <span>Min order: ₹{offer.eligibility.minOrderValue}</span>
            ) : (
              <span>No minimum order</span>
            )}
            {offer.discount?.maxDiscount && (
              <span>Max discount: ₹{offer.discount.maxDiscount}</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowTerms(!showTerms)}
            className="flex items-center gap-0.5 text-primary hover:underline font-bold cursor-pointer"
          >
            <span>T&C</span>
            {showTerms ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Expandable Terms & Conditions */}
        {showTerms && (
          <div className="p-3 bg-bg-secondary rounded-xl border border-divider text-[11px] text-text-secondary space-y-1 animate-in fade-in duration-150">
            <div className="font-bold text-text mb-1">Terms & Conditions:</div>
            <div>• Valid only on direct app orders at Burgonomics.</div>
            <div>• Cannot be combined with other promo codes.</div>
            {offer.discount?.maxDiscount && (
              <div>• Maximum discount capped at ₹{offer.discount.maxDiscount}.</div>
            )}
            <div>• Valid on all 100% Pure Vegetarian menu items.</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CouponCard;
