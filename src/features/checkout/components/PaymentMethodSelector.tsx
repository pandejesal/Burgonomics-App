import * as React from "react";
import { CreditCard, Banknote, ShieldCheck } from "lucide-react";
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CreditCard
            className="h-4 w-4 shrink-0 text-primary dark:text-primary-text"
            aria-hidden
          />
          <h4 className="type-title-medium text-text-primary">Payment Method</h4>
        </div>
        <span className="flex items-center gap-1 type-caption font-medium text-success">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          <span>100% Secure Checkout</span>
        </span>
      </div>

      <div role="radiogroup" aria-label="Payment method" className="space-y-2.5">
        {/* Razorpay Online */}
        <button
          type="button"
          role="radio"
          aria-checked={selectedMethod !== "cash"}
          onClick={() => {
            void HapticService.selection();
            onSelectMethod("upi");
          }}
          className={cn(
            "flex min-h-[64px] w-full cursor-pointer select-none items-center justify-between gap-3 rounded-[var(--radius-large)] border p-4 text-left transition-colors",
            selectedMethod !== "cash"
              ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
              : "border-divider bg-surface hover:border-primary/50",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-medium)] border border-success/30 bg-success/10 type-caption font-semibold text-success">
              UPI
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="type-body font-semibold text-text-primary break-words">
                Razorpay Online (UPI, Cards, NetBanking)
              </p>
              <p className="type-caption text-text-secondary break-words">
                Google Pay, PhonePe, Paytm, All Major Cards
              </p>
            </div>
          </div>

          <span
            aria-hidden
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              selectedMethod !== "cash"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-text-secondary/60",
            )}
          >
            {selectedMethod !== "cash" && (
              <span className="h-2 w-2 rounded-full bg-primary-foreground" />
            )}
          </span>
        </button>

        {/* Cash on Delivery / Pay at Counter */}
        <button
          type="button"
          role="radio"
          aria-checked={selectedMethod === "cash"}
          onClick={() => {
            void HapticService.selection();
            onSelectMethod("cash");
          }}
          className={cn(
            "flex min-h-[64px] w-full cursor-pointer select-none items-center justify-between gap-3 rounded-[var(--radius-large)] border p-4 text-left transition-colors",
            selectedMethod === "cash"
              ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
              : "border-divider bg-surface hover:border-primary/50",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-medium)] border border-warning/30 bg-warning/10 text-warning">
              <Banknote className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="type-body font-semibold text-text-primary break-words">
                {isDelivery
                  ? "Cash on Delivery"
                  : isTakeaway
                    ? "Pay at Pickup Counter"
                    : "Pay at Dine-In Counter"}
              </p>
              <p className="type-caption text-text-secondary break-words">
                Pay in cash or via QR upon receiving your order
              </p>
            </div>
          </div>

          <span
            aria-hidden
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              selectedMethod === "cash"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-text-secondary/60",
            )}
          >
            {selectedMethod === "cash" && (
              <span className="h-2 w-2 rounded-full bg-primary-foreground" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

export default PaymentMethodSelector;
