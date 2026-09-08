import * as React from "react";
import { RotateCcw, Pencil } from "lucide-react";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import { AppButton } from "@/shared/components/common/AppButton";

interface Props {
  isAbandonmentOpen: boolean;
  onCloseAbandonment: () => void;
  onRetryPayment: () => void;
  onChangePaymentMethod: () => void;
}

/**
 * RazorpayModalHandler — abandonment recovery sheet shown when the
 * Razorpay modal is dismissed without completing payment. Offers an
 * explicit retry or a return to checkout to change method. Never
 * auto-retries: a second tap must be deliberate (no double charge).
 */
export function RazorpayModalHandler({
  isAbandonmentOpen,
  onCloseAbandonment,
  onRetryPayment,
  onChangePaymentMethod,
}: Props) {
  return (
    <BottomSheet
      open={isAbandonmentOpen}
      onOpenChange={(v) => {
        if (!v) onCloseAbandonment();
      }}
      title="Payment not completed"
      description="You closed the secure payment window before finishing. Your cart is saved — retry when ready."
    >
      <div className="flex flex-col gap-2 pt-1">
        <AppButton
          size="lg"
          onClick={onRetryPayment}
          iconLeft={<RotateCcw className="h-4 w-4" aria-hidden />}
        >
          Retry payment
        </AppButton>
        <AppButton size="lg" variant="outlined" onClick={onChangePaymentMethod} iconLeft={<Pencil className="h-4 w-4" aria-hidden />}>
          Change payment method
        </AppButton>
      </div>
    </BottomSheet>
  );
}
