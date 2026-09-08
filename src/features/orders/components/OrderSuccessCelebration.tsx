import * as React from "react";
import { CheckCircle2 } from "lucide-react";

interface Props {
  orderNumber: string;
}

/**
 * OrderSuccessCelebration — confirmation header. Celebrates the placed
 * order number only; no promises about timing live here.
 */
export const OrderSuccessCelebration = React.memo(function OrderSuccessCelebration({
  orderNumber,
}: Props) {
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0E4825]/10 text-[#0E4825] dark:text-[#4ADE80]">
        <CheckCircle2 className="h-8 w-8" aria-hidden />
      </span>
      <h1 className="text-lg font-black text-text">Order confirmed!</h1>
      <p className="text-xs text-text-secondary">
        Order <span className="font-mono font-bold text-text">{orderNumber}</span> is with the kitchen.
      </p>
    </div>
  );
});
