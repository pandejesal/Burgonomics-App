import * as React from "react";
import { Clock, XCircle } from "lucide-react";
import type { Fulfillment } from "@/features/stores/models/Store";
import type { OrderStatusMeta } from "@/features/orders/models";

interface Props {
  fulfillment: Fulfillment;
  status: OrderStatusMeta;
  estimatedMinutes: number;
}

/**
 * EstimatedDeliveryCountdown — counts down from the backend-provided
 * estimate. Labelled as an estimate throughout; terminal and cancelled
 * statuses render their own honest copy instead of a ticking clock.
 */
export const EstimatedDeliveryCountdown = React.memo(function EstimatedDeliveryCountdown({
  fulfillment,
  status,
  estimatedMinutes,
}: Props) {
  const [now, setNow] = React.useState(() => Date.now());
  const target = React.useMemo(
    () => Date.now() + Math.max(0, estimatedMinutes) * 60_000,
    [estimatedMinutes],
  );

  React.useEffect(() => {
    if (status.terminal) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [status.terminal]);

  if (status.kind === "cancelled" || status.kind === "failed") {
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl border border-error/40 bg-error/5 p-4">
        <XCircle className="h-5 w-5 shrink-0 text-error" aria-hidden />
        <p className="text-xs font-bold text-error">This order was {status.label.toLowerCase()}.</p>
      </div>
    );
  }

  if (status.terminal) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl border border-[#0E4825]/30 bg-[#0E4825]/5 p-4">
        <Clock className="h-5 w-5 shrink-0 text-[#0E4825] dark:text-[#4ADE80]" aria-hidden />
        <p className="text-xs font-bold text-text">{status.label} — enjoy your meal!</p>
      </div>
    );
  }

  const remaining = Math.max(0, Math.round((target - now) / 60_000));
  const noun = fulfillment === "delivery" ? "delivery" : fulfillment === "takeaway" ? "pickup" : "serving";

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-divider bg-surface p-4 shadow-xs">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6600]/10 text-[#FF6600]">
        <Clock className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <p className="font-mono text-lg font-black text-text">
          ~{remaining} min
        </p>
        <p className="text-[11px] text-text-secondary">
          Estimated {noun} time — the kitchen confirms live status on the tracking page.
        </p>
      </div>
    </div>
  );
});
