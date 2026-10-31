import * as React from "react";
import { Receipt, Info, Sparkles } from "lucide-react";
import { formatINR } from "@/core/utils/format";
import { cn } from "@/lib/utils";
import type { Fulfillment } from "@/features/stores/models/Store";

export interface BillBreakdownProps {
  subtotal: number;
  discountAmount?: number;
  coinsRedeemed?: number;
  deliveryFee?: number;
  packagingFee?: number;
  gstAmount?: number;
  tipAmount?: number;
  fulfillment?: Fulfillment;
  className?: string;
}

/**
 * BillBreakdown — PRESENTATIONAL ONLY. Renders exactly the numbers the
 * caller passes (which come from the canonical pricing engine via
 * cartRepository.calculateTotals). It never recomputes delivery fees,
 * GST, or thresholds itself: a second schedule here once showed FREE
 * over ₹349 while the footer charged ₹40. Single source of truth is
 * DEFAULT_PRICING_CONFIG (free delivery over ₹499, ₹40 flat fee).
 */
export function BillBreakdown({
  subtotal,
  discountAmount = 0,
  coinsRedeemed = 0,
  deliveryFee = 0,
  packagingFee = 0,
  gstAmount = 0,
  tipAmount = 0,
  fulfillment = "delivery",
  className,
}: BillBreakdownProps) {
  const isDelivery = fulfillment === "delivery";
  const isDineIn = fulfillment === "dinein";

  // Display-only mirroring of caller-provided values: dine-in never shows
  // packaging, non-delivery never shows a delivery fee.
  const actualPackagingFee = isDineIn ? 0 : packagingFee;
  const actualDeliveryFee = isDelivery ? deliveryFee : 0;

  // GST is passed post-discount from the engine — never recompute here.
  // MT-09: display-only. The bill shows the tax component that already sits
  // inside the GST-inclusive item total; it is never added to the payable.
  const calculatedGST = gstAmount;
  const cgst = (calculatedGST / 2).toFixed(1);
  const sgst = (calculatedGST / 2).toFixed(1);

  // Total Savings
  const totalSavings = discountAmount + coinsRedeemed;

  // Total "To Pay".
  // MT-09: menu prices are GST-INCLUSIVE (CGST 2.5% + SGST 2.5% already sit
  // inside `subtotal`), so `gstAmount` is display-only here. Adding it on top
  // of the item total double-charges the 5% GST the customer already paid.
  const toPay = Math.max(
    0,
    subtotal - discountAmount - coinsRedeemed + actualPackagingFee + actualDeliveryFee + tipAmount,
  );

  return (
    <div className={cn("space-y-4 border-t border-divider py-5", className)}>
      <div className="flex flex-col gap-1 border-b border-divider pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 shrink-0 text-primary dark:text-primary-text" aria-hidden />
          <h4 className="type-title-medium text-text-primary">Bill Details</h4>
        </div>
        <span className="type-caption text-text-secondary">Inclusive of all taxes (5% GST)</span>
      </div>

      <div className="space-y-2.5 type-caption">
        <div className="flex items-start justify-between gap-3 text-text-primary">
          <span className="min-w-0">Item Total</span>
          <span className="type-price shrink-0 whitespace-nowrap text-right">
            {formatINR(subtotal)}
          </span>
        </div>

        {discountAmount > 0 && (
          <div className="flex items-start justify-between gap-3 text-success">
            <span className="flex min-w-0 items-center gap-1 font-medium">
              <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>Coupon Discount</span>
            </span>
            <span className="type-price shrink-0 whitespace-nowrap text-right">
              - {formatINR(discountAmount)}
            </span>
          </div>
        )}

        {coinsRedeemed > 0 && (
          <div className="flex items-start justify-between gap-3 text-success">
            <span className="min-w-0 font-medium">Loyalty Points Redeemed</span>
            <span className="type-price shrink-0 whitespace-nowrap text-right">
              - {formatINR(coinsRedeemed)}
            </span>
          </div>
        )}

        <div className="flex items-start justify-between gap-3 text-text-secondary">
          <span
            className="flex min-w-0 cursor-help items-center gap-1 hover:text-text-primary"
            title={`2.5% CGST (₹${cgst}) + 2.5% SGST (₹${sgst}) — already part of Item Total`}
          >
            <span>Govt. GST (5% included)</span>
            <Info className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          </span>
          <span className="type-price shrink-0 whitespace-nowrap text-right">
            {formatINR(calculatedGST)}
          </span>
        </div>

        {actualPackagingFee > 0 && (
          <div className="flex items-start justify-between gap-3 text-text-secondary">
            <span className="min-w-0">Restaurant Packaging</span>
            <span className="type-price shrink-0 whitespace-nowrap text-right">
              {formatINR(actualPackagingFee)}
            </span>
          </div>
        )}

        {isDelivery && (
          <div className="flex items-start justify-between gap-3 text-text-secondary">
            <span className="min-w-0">Delivery Fee</span>
            <span className="type-price shrink-0 whitespace-nowrap text-right">
              {actualDeliveryFee === 0 ? (
                <span className="text-success font-semibold">FREE</span>
              ) : (
                formatINR(actualDeliveryFee)
              )}
            </span>
          </div>
        )}

        {tipAmount > 0 && (
          <div className="flex items-start justify-between gap-3 text-text-primary">
            <span className="min-w-0">Delivery Partner Tip</span>
            <span className="type-price shrink-0 whitespace-nowrap text-right">
              {formatINR(tipAmount)}
            </span>
          </div>
        )}

        {totalSavings > 0 && (
          <div className="flex items-start justify-between gap-3 rounded-[var(--radius-medium)] border border-primary/30 bg-primary/10 px-3 py-2.5 text-primary-text">
            <span className="min-w-0 font-semibold">Your Total Savings</span>
            <span className="type-price shrink-0 whitespace-nowrap text-right">
              {formatINR(totalSavings)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-divider pt-3">
          <span className="type-title-medium text-text-primary">To Pay</span>
          <span className="type-price whitespace-nowrap text-right text-lg text-text-primary sm:text-xl">
            {formatINR(toPay)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BillBreakdown;
