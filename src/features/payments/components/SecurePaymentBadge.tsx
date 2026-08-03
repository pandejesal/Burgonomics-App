import { ShieldCheck } from "lucide-react";
import { Text } from "@/shared/components/common/Text";

/** Reassurance strip shown above the pay button. Purely presentational. */
export function SecurePaymentBadge() {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-large)] border border-divider bg-surface-variant/40 p-3">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
      <div className="min-w-0">
        <Text variant="titleMedium">100% secure payments</Text>
        <Text variant="caption" tone="secondary">
          Payments are processed by Razorpay. Burgonomics never stores your card, UPI or bank
          details.
        </Text>
      </div>
    </div>
  );
}
