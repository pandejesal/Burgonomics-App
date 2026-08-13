import { ShieldCheck, Zap } from "lucide-react";
import { Text } from "@/shared/components/common/Text";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { appConfig } from "@/core/config/env";

/** Reassurance and environment status strip shown on the payment screen. */
export function SecurePaymentBadge() {
  const isTestMode =
    !appConfig.integrations.razorpayKeyId ||
    appConfig.integrations.razorpayKeyId.startsWith("rzp_test_");

  return (
    <div className="space-y-2">
      {isTestMode && (
        <div className="flex items-center justify-between rounded-[var(--radius-large)] border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600 animate-pulse" aria-hidden />
            <Text variant="bodySmall" className="font-semibold text-amber-800 dark:text-amber-300">
              Razorpay Staging / Test Mode
            </Text>
          </div>
          <AppBadge tone="warning">TEST MODE</AppBadge>
        </div>
      )}
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
    </div>
  );
}
