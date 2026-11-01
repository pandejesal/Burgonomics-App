import * as React from "react";
import { Clock, Flame, ChefHat, CheckCircle2, Bike, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Fulfillment } from "@/features/stores/models/Store";
import type { OrderStatusMeta } from "../models";

interface EstimatedDeliveryCountdownProps {
  fulfillment: Fulfillment;
  status: OrderStatusMeta;
  estimatedMinutes?: number;
  className?: string;
}

const STAGES = [
  { key: "placed", label: "Order Placed", icon: CheckCircle2 },
  { key: "accepted", label: "Kitchen Accepted", icon: ChefHat },
  { key: "preparing", label: "On The Grill", icon: Flame },
  { key: "dispatched", label: "On The Way / Ready", icon: Bike },
];

export function EstimatedDeliveryCountdown({
  fulfillment,
  status,
  estimatedMinutes,
  className,
}: EstimatedDeliveryCountdownProps) {
  // P1-3: no fabricated default — an unknown estimate renders as
  // "Estimate unavailable" instead of a confident ticking countdown.
  const hasEstimate =
    typeof estimatedMinutes === "number" &&
    Number.isFinite(estimatedMinutes) &&
    estimatedMinutes >= 0;
  const [remainingSeconds, setRemainingSeconds] = React.useState(
    hasEstimate ? (estimatedMinutes as number) * 60 : 0,
  );

  React.useEffect(() => {
    setRemainingSeconds(hasEstimate ? (estimatedMinutes as number) * 60 : 0);
  }, [estimatedMinutes, hasEstimate]);

  React.useEffect(() => {
    if (!hasEstimate) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [hasEstimate]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedCountdown = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  // Determine active stage index
  const statusKind = status.kind;
  let activeIndex = 0;
  if (statusKind === "in_progress") activeIndex = 2;
  else if (statusKind === "completed") activeIndex = 3;
  else if (status.code === "CONFIRMED" || status.code === "PLACED") activeIndex = 1;
  else if (status.code === "PREPARING") activeIndex = 2;
  else if (status.code === "OUT_FOR_DELIVERY" || status.code === "READY_FOR_PICKUP")
    activeIndex = 3;

  const isDelivery = fulfillment === "delivery";

  return (
    <div
      className={cn(
        "space-y-5 rounded-2xl border border-divider bg-surface p-5 shadow-xs",
        className,
      )}
    >
      {/* Header with Countdown */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary-text">
            <Clock className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="type-title-large text-text">
              {isDelivery ? "Estimated Delivery" : "Estimated Pickup"}
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              {isDelivery ? "Arriving at your doorstep" : "Counter collection in store"}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          {hasEstimate ? (
            <>
              <span className="text-2xl font-semibold tabular-nums text-accent">
                {formattedCountdown}
              </span>
              <span className="block text-sm font-medium text-text-secondary">
                Minutes remaining
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold text-text-secondary">Estimate unavailable</span>
          )}
        </div>
      </div>

      {/* Makeline 4-stage visual progress bar */}
      <div className="pt-2">
        <div className="relative flex items-center justify-between">
          <div className="absolute left-0 top-1/2 -z-0 h-1 w-full -translate-y-1/2 rounded-full bg-bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${Math.min(100, (activeIndex / 3) * 100)}%`,
              }}
            />
          </div>

          {STAGES.map((stage, idx) => {
            const isCompleted = activeIndex >= idx;
            const isCurrent = activeIndex === idx;
            const Icon = stage.key === "dispatched" && !isDelivery ? Store : stage.icon;

            return (
              <div key={stage.key} className="relative z-10 flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 bg-surface transition-all",
                    isCompleted
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-divider text-text-secondary",
                    isCurrent && "ring-4 ring-primary/20 animate-pulse",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                {/* Four stage labels share one phone row: 12px is the floor
                    here, still well above the previous 9px. */}
                <span
                  className={cn(
                    "max-w-[65px] text-center text-xs leading-tight",
                    isCompleted ? "font-medium text-text" : "font-medium text-text-secondary",
                  )}
                >
                  {stage.key === "dispatched"
                    ? isDelivery
                      ? "On The Way"
                      : "Ready at Counter"
                    : stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default EstimatedDeliveryCountdown;
