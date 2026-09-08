import * as React from "react";
import { PaymentMethodList } from "@/features/payments/components/PaymentMethodList";
import type { PaymentMethod } from "@/features/payments/models";

interface Props {
  selectedMethod: PaymentMethod;
  onSelectMethod: (m: PaymentMethod) => void;
  isDelivery: boolean;
  isTakeaway: boolean;
  disabled?: boolean;
}

/**
 * PaymentMethodSelector — checkout section 5. Wraps the shared
 * PaymentMethodList (which owns online/cash copy + the offline
 * force-cash rule) and adds the fulfillment-specific hint so COD
 * never reads as "pay securely online".
 */
export function PaymentMethodSelector({
  selectedMethod,
  onSelectMethod,
  isDelivery,
  isTakeaway,
  disabled,
}: Props) {
  const hint = isDelivery
    ? "Cash on Delivery is collected at your doorstep."
    : isTakeaway
      ? "Pay at the pickup counter when you collect."
      : "Pay at your table or the counter.";

  return (
    <div className="space-y-2.5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-text">
        Payment method
      </h2>
      <PaymentMethodList value={selectedMethod} onChange={onSelectMethod} disabled={disabled} />
      {selectedMethod === "cash" && (
        <p className="text-[11px] text-text-secondary">{hint}</p>
      )}
    </div>
  );
}
