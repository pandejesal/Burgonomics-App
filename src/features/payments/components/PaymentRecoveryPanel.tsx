/**
 * PaymentRecoveryPanel — the honest waiting-state surface for money that the
 * client could not confirm (A08 B9 / lane C01).
 *
 * Replaces the generic "Complete the checkout inside the Razorpay secure
 * pop-up" spinner for every post-gateway outcome. It always states:
 *   - the exact gateway payment id when one is known from the callback
 *     (never a signature — those are never rendered or persisted),
 *   - an explicit "do not pay again" instruction,
 *   - a support deep link and an "existing order" recovery action,
 *   - no Retry / Pay button, so a new payment can never be started from here.
 *
 * State is carried by icon + text (not colour alone), the panel is a polite
 * live region, and both actions are AppButton (44px minimum targets).
 */
import * as React from "react";
import { AlertTriangle, LifeBuoy, ShoppingBag } from "lucide-react";

import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import {
  describePaymentRecovery,
  type RecoveryReason,
} from "@/features/payments/utils/paymentRecovery";

export interface PaymentRecoveryPanelProps {
  reason: RecoveryReason;
  /** Gateway payment id from the checkout callback — safe to display. */
  paymentId?: string | null;
  /** Gateway/internal order id when the payment id is unknown (post-reload). */
  orderId?: string | null;
  onContactSupport?: () => void;
  onCheckOrders?: () => void;
}

export function PaymentRecoveryPanel({
  reason,
  paymentId,
  orderId,
  onContactSupport,
  onCheckOrders,
}: PaymentRecoveryPanelProps) {
  const content = describePaymentRecovery(reason);
  const reference = paymentId || orderId || undefined;
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={content.title}
      className="rounded-xl border border-warning/40 bg-warning/10 p-4 shadow-sm"
      data-recovery-reason={reason}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <Text variant="titleMedium" className="font-bold text-text">
            {content.title}
          </Text>
          <Text variant="bodyMedium" tone="secondary" className="mt-1 leading-normal">
            {content.body}
          </Text>
          {reference ? (
            <Text variant="caption" className="mt-2 block">
              {paymentId ? "Payment ID " : "Order reference "}
              <span className="font-mono font-bold text-text-primary">{reference}</span>
            </Text>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <AppButton
              size="sm"
              onClick={onContactSupport}
              iconLeft={<LifeBuoy className="h-3.5 w-3.5" aria-hidden />}
            >
              Contact support
            </AppButton>
            <AppButton
              size="sm"
              variant="outlined"
              onClick={onCheckOrders}
              iconLeft={<ShoppingBag className="h-3.5 w-3.5" aria-hidden />}
            >
              Check my orders
            </AppButton>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PaymentRecoveryPanel;
