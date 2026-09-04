import * as React from "react";
import { Receipt, Info, Sparkles, ShieldCheck } from "lucide-react";
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
 * BillBreakdown — Fully transparent financial bill breakdown for QSR orders.
 * Calculates composite 5% Restaurant GST (2.5% CGST + 2.5% SGST), packaging fees,
 * tiered delivery fees, coupon deductions, Loyalty Points redemption, and delivery tips.
 */
export function BillBreakdown({
  subtotal,
  discountAmount = 0,
  coinsRedeemed = 0,
  deliveryFee = 35,
  packagingFee = 15,
  gstAmount,
  tipAmount = 0,
  fulfillment = "delivery",
  className,
}: BillBreakdownProps) {
  const isDelivery = fulfillment === "delivery";
  const isDineIn = fulfillment === "dinein";

  // Packaging fee waived for Dine-In
  const actualPackagingFee = isDineIn ? 0 : packagingFee;

  // Delivery fee: Free for subtotal >= 349 or non-delivery orders
  const actualDeliveryFee = isDelivery ? (subtotal >= 349 ? 0 : deliveryFee) : 0;

  // 5% Restaurant GST composite (2.5% CGST + 2.5% SGST)
  const calculatedGST = gstAmount !== undefined ? gstAmount : Math.round(subtotal * 0.05);
  const cgst = (calculatedGST / 2).toFixed(1);
  const sgst = (calculatedGST / 2).toFixed(1);

  // Total Savings
  const totalSavings = discountAmount + coinsRedeemed;

  // Total "To Pay"
  const toPay = Math.max(
    0,
    subtotal - discountAmount - coinsRedeemed + calculatedGST + actualPackagingFee + actualDeliveryFee + tipAmount
  );

  return (
    <div className={cn("p-4 sm:p-5 rounded-2xl bg-surface border border-divider space-y-3.5 shadow-xs", className)}>
      <div className="flex items-center justify-between pb-2 border-b border-divider">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-[#0E4825] dark:text-[#4ADE80]" />
          <h4 className="text-sm font-bold text-text uppercase tracking-tight">
            Bill Details
          </h4>
        </div>
        <span className="text-[10px] text-text-secondary font-medium">
          Inclusive of all applicable taxes
        </span>
      </div>

      <div className="space-y-2 text-xs">
        {/* Item Total */}
        <div className="flex items-center justify-between text-text">
          <span>Item Total</span>
          <span className="font-mono font-bold">{formatINR(subtotal)}</span>
        </div>

        {/* Coupon Discount */}
        {discountAmount > 0 && (
          <div className="flex items-center justify-between text-[#4ADE80]">
            <span className="flex items-center gap-1 font-medium">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Coupon Discount</span>
            </span>
            <span className="font-mono font-bold">- {formatINR(discountAmount)}</span>
          </div>
        )}

        {/* Loyalty Points */}
        {coinsRedeemed > 0 && (
          <div className="flex items-center justify-between text-[#4ADE80]">
            <span className="font-medium">Loyalty Points Redeemed</span>
            <span className="font-mono font-bold">- {formatINR(coinsRedeemed)}</span>
          </div>
        )}

        {/* Taxes & Charges */}
        <div className="flex items-center justify-between text-text-secondary">
          <span
            className="cursor-help flex items-center gap-1 hover:text-text"
            title={`2.5% CGST (₹${cgst}) + 2.5% SGST (₹${sgst})`}
          >
            <span>Govt. GST (5%)</span>
            <Info className="w-3 h-3 opacity-60" />
          </span>
          <span className="font-mono font-bold">{formatINR(calculatedGST)}</span>
        </div>

        {/* Restaurant Packaging Fee */}
        {actualPackagingFee > 0 && (
          <div className="flex items-center justify-between text-text-secondary">
            <span>Restaurant Packaging</span>
            <span className="font-mono font-bold">{formatINR(actualPackagingFee)}</span>
          </div>
        )}

        {/* Delivery Fee */}
        {isDelivery && (
          <div className="flex items-center justify-between text-text-secondary">
            <span>Delivery Fee</span>
            <span className="font-mono font-bold">
              {actualDeliveryFee === 0 ? (
                <span className="text-[#4ADE80] uppercase text-[10px] font-black">
                  FREE
                </span>
              ) : (
                formatINR(actualDeliveryFee)
              )}
            </span>
          </div>
        )}

        {/* Delivery Partner Tip */}
        {tipAmount > 0 && (
          <div className="flex items-center justify-between text-text">
            <span>Delivery Partner Tip</span>
            <span className="font-mono font-bold">{formatINR(tipAmount)}</span>
          </div>
        )}

        {/* Total Savings Banner */}
        {totalSavings > 0 && (
          <div className="p-2.5 rounded-xl bg-[#0E4825]/15 border border-[#0E4825]/40 text-[#4ADE80] flex items-center justify-between font-bold text-xs">
            <span>Your Total Savings</span>
            <span className="font-mono">{formatINR(totalSavings)}</span>
          </div>
        )}

        {/* Final "To Pay" Row */}
        <div className="pt-2.5 border-t border-divider flex items-baseline justify-between text-sm sm:text-base font-black text-text">
          <span>To Pay</span>
          <span className="font-mono text-[#FF6600] font-black text-lg">
            {formatINR(toPay)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BillBreakdown;
