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
        "relative overflow-hidden rounded-2xl border bg-surface shadow-xs transition-colors",
        applied
          ? "border-success bg-success/10 shadow-sm"
          : "border-divider hover:border-primary/50",
        className,
      )}
    >
      {/* Ticket Dotted Border Decorative Left Cutout */}
      <div className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-divider bg-background" />
      <div className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-divider bg-background" />

      <div className="space-y-4 p-4 sm:p-5">
        {/* Top Header: Badge, Code & Apply Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent px-2.5 py-1 text-sm font-semibold text-accent-foreground shadow-xs">
                {offer.discount.label || "PROMO"}
              </span>

              {offer.code && (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md border border-dashed border-primary bg-bg-secondary px-2.5 py-1 text-sm font-semibold text-primary-text transition-colors hover:bg-divider cursor-pointer"
                >
                  <span>{offer.code}</span>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
                  )}
                </button>
              )}
            </div>

            <h3 className="type-title-large pt-1 text-text">{offer.title}</h3>
            <p className="text-sm leading-relaxed text-text-secondary">{offer.description}</p>
          </div>

          <button
            type="button"
            onClick={handleApplyClick}
            className={cn(
              "min-h-11 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold shadow-xs transition-colors cursor-pointer",
              applied
                ? "border border-success/40 bg-success/10 text-success hover:bg-success/20"
                : isEligible
                  ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                  : "border border-divider bg-bg-secondary text-text-secondary cursor-not-allowed opacity-80",
            )}
          >
            {applied ? "Applied" : "Apply"}
          </button>
        </div>

        {/* Real-time MOV Progress Bar (if shortfall exists) */}
        {!isEligible && validation.progressToUnlock && (
          <div className="space-y-2 rounded-xl border border-divider bg-bg-secondary p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-warning">
                Add ₹{validation.progressToUnlock.shortfall} more to unlock
              </span>
              <span className="tabular-nums text-text-secondary">
                ₹{validation.progressToUnlock.current} / ₹{validation.progressToUnlock.required}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-divider">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${validation.progressToUnlock.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Metadata Footer & Terms Accordion Trigger */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3 text-sm text-text-secondary">
          <div className="flex flex-wrap items-center gap-3">
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
            className="flex min-h-11 items-center gap-0.5 font-semibold text-primary-text hover:underline cursor-pointer"
          >
            <span>T&amp;C</span>
            {showTerms ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        </div>

        {/* Expandable Terms & Conditions */}
        {showTerms && (
          <div className="animate-in space-y-1.5 rounded-xl border border-divider bg-bg-secondary p-3.5 text-sm leading-relaxed text-text-secondary fade-in duration-150">
            <div className="mb-1 font-semibold text-text">Terms &amp; Conditions:</div>
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
