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
  estimatedMinutes = 25,
  className,
}: EstimatedDeliveryCountdownProps) {
  const [remainingSeconds, setRemainingSeconds] = React.useState(estimatedMinutes * 60);

  React.useEffect(() => {
    setRemainingSeconds(estimatedMinutes * 60);
  }, [estimatedMinutes]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
  else if (status.code === "OUT_FOR_DELIVERY" || status.code === "READY_FOR_PICKUP") activeIndex = 3;

  const isDelivery = fulfillment === "delivery";

  return (
    <div className={cn("rounded-2xl border border-divider bg-surface p-4 sm:p-5 space-y-4 shadow-xs", className)}>
      {/* Header with Countdown */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#0E4825]/10 text-[#0E4825] dark:text-[#4ADE80] flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-text">
              {isDelivery ? "Estimated Delivery" : "Estimated Pickup"}
            </h3>
            <p className="text-[11px] text-text-secondary">
              {isDelivery ? "Arriving at your doorstep" : "Counter collection in store"}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="font-mono text-xl sm:text-2xl font-black text-[#FF6600]">
            {formattedCountdown}
          </span>
          <span className="block text-[10px] uppercase font-bold text-text-secondary">
            Mins Remaining
          </span>
        </div>
      </div>

      {/* Makeline 4-stage visual progress bar */}
      <div className="pt-2">
        <div className="relative flex items-center justify-between">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 w-full bg-bg-secondary -z-0 rounded-full">
            <div
              className="h-full bg-[#0E4825] rounded-full transition-all duration-500"
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
                    "w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all bg-surface",
                    isCompleted
                      ? "border-[#0E4825] bg-[#0E4825] text-white shadow-xs"
                      : "border-divider text-text-secondary",
                    isCurrent && "ring-4 ring-[#0E4825]/20 animate-pulse"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <span
                  className={cn(
                    "text-[9px] sm:text-[10px] font-bold text-center max-w-[65px] leading-tight",
                    isCompleted ? "text-text" : "text-text-secondary"
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
