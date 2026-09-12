import * as React from "react";
import { CreditCard, Banknote, ShieldCheck, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import type { PaymentMethod } from "@/features/payments/models";

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod;
  onSelectMethod: (method: PaymentMethod) => void;
  isDelivery?: boolean;
  isTakeaway?: boolean;
  className?: string;
}

export function PaymentMethodSelector({
  selectedMethod,
  onSelectMethod,
  isDelivery = true,
  isTakeaway = false,
  className,
}: PaymentMethodSelectorProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#0E4825] dark:text-[#4ADE80]" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Payment Method
          </h4>
        </div>
        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>100% Secure Checkout</span>
        </span>
      </div>

      <div className="space-y-2.5">
        {/* Razorpay Online */}
        <div
          onClick={() => {
            void HapticService.selection();
            onSelectMethod("upi");
          }}
          className={cn(
            "p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 min-h-[52px]",
            selectedMethod !== "cash"
              ? "border-[#0E4825] bg-[#0E4825]/5 ring-1 ring-[#0E4825] shadow-xs"
              : "border-divider bg-surface hover:border-primary/40"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-black text-xs shrink-0">
              UPI
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs sm:text-sm font-bold text-text truncate">
                Razorpay Online (UPI, Cards, NetBanking)
              </p>
              <p className="text-[11px] text-text-secondary truncate">
                Google Pay, PhonePe, Paytm, All Major Cards
              </p>
            </div>
          </div>

          <span
            className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              selectedMethod !== "cash"
                ? "border-[#0E4825] bg-[#0E4825] text-white"
                : "border-divider"
            )}
          >
            {selectedMethod !== "cash" && <span className="w-2 h-2 rounded-full bg-white" />}
          </span>
        </div>

        {/* Cash on Delivery / Pay at Counter */}
        <div
          onClick={() => {
            void HapticService.selection();
            onSelectMethod("cash");
          }}
          className={cn(
            "p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 min-h-[52px]",
            selectedMethod === "cash"
              ? "border-[#0E4825] bg-[#0E4825]/5 ring-1 ring-[#0E4825] shadow-xs"
              : "border-divider bg-surface hover:border-primary/40"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 shrink-0">
              <Banknote className="w-5 h-5 text-amber-600" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs sm:text-sm font-bold text-text truncate">
                {isDelivery ? "Cash on Delivery" : isTakeaway ? "Pay at Pickup Counter" : "Pay at Dine-In Counter"}
              </p>
              <p className="text-[11px] text-text-secondary truncate">
                Pay in cash or via QR upon receiving your order
              </p>
            </div>
          </div>

          <span
            className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              selectedMethod === "cash"
                ? "border-[#0E4825] bg-[#0E4825] text-white"
                : "border-divider"
            )}
          >
            {selectedMethod === "cash" && <span className="w-2 h-2 rounded-full bg-white" />}
          </span>
        </div>
      </div>
    </div>
  );
}

export default PaymentMethodSelector;
