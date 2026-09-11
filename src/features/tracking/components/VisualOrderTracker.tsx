import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, Clock, Flame, Bike, ShoppingBag, Utensils, Phone, Sparkles, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSafeTelNumber } from "@/shared/utils/urlSafety";
import { formatINR } from "@/core/utils/format";
import { HapticService } from "@/core/services/haptics";
import type { Order } from "@/features/orders";

interface VisualOrderTrackerProps {
  order: Order;
  onAdvanceDevStatus?: () => void;
  className?: string;
}

export function VisualOrderTracker({
  order,
  onAdvanceDevStatus,
  className,
}: VisualOrderTrackerProps) {
  const fulfillment = typeof order.fulfillment === "string" ? order.fulfillment : (order.fulfillment as any)?.type || "delivery";
  const isDelivery = fulfillment === "delivery";
  const isTakeaway = fulfillment === "takeaway";
  const isDineIn = fulfillment === "dinein";

  // Map order status code to numeric step index (1 to 4)
  const getStepIndex = (code: string) => {
    switch (code) {
      case "ORDER_PLACED":
      case "PAYMENT_CONFIRMED":
      case "ACCEPTED_BY_STORE":
        return 1;
      case "KITCHEN_PREPARING":
      case "COOKING":
        return 2;
      case "OUT_FOR_DELIVERY":
      case "READY_FOR_PICKUP":
      case "READY_FOR_DINING":
        return 3;
      case "DELIVERED":
      case "COMPLETED":
        return 4;
      default:
        return 2;
    }
  };

  const currentStep = getStepIndex(order.status.code);

  const steps = [
    {
      id: 1,
      label: "Order Confirmed",
      subtitle: "POS & Kitchen Acknowledged",
      Icon: CheckCircle2,
    },
    {
      id: 2,
      label: "Grilling in Kitchen",
      subtitle: "Smash patties & farm buns grilling fresh",
      Icon: Flame,
    },
    {
      id: 3,
      label: isDelivery ? "Out for Delivery" : isTakeaway ? "Ready at Counter" : "Ready for Dine-In",
      subtitle: isDelivery
        ? "Assigned to Porter Delivery Partner"
        : "Show 4-digit PIN at pickup counter",
      Icon: isDelivery ? Bike : isTakeaway ? ShoppingBag : Utensils,
    },
    {
      id: 4,
      label: "Order Enjoyed",
      subtitle: "Delivered fresh & hot",
      Icon: Sparkles,
    },
  ];

  // Dynamic Pickup PIN (derive from order ID or document)
  const pickupPin = (order as any).pickupPin || (order.id ? order.id.slice(-4).toUpperCase() : "7419");

  // Loop 19/120: rider identity comes from the live order doc (partner
  // writes riderName/riderPhone on dispatch). Never invent a courier: with
  // no assigned rider, show an honest assigning state with no call button.
  const liveRiderName = (order as any)?.riderName as string | undefined;
  const liveRiderPhone = (order as any)?.riderPhone as string | undefined;
  const liveRiderVehicle = (order as any)?.riderVehicleNumber as string | undefined;
  const porterDriver = liveRiderName
    ? { name: liveRiderName, phone: liveRiderPhone ?? "", vehicle: liveRiderVehicle ?? "" }
    : null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Dynamic Circular Countdown Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0E4825] via-[#145830] to-[#0A371C] p-6 text-white text-center shadow-high border border-white/10">
        <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-accent/20 blur-3xl pointer-events-none" />

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold uppercase tracking-wider text-amber-300 backdrop-blur-sm mb-3">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          {currentStep === 4 ? "Delivered" : "Live Kitchen Tracking"}
        </span>

        <div className="my-2">
          <span className="font-display text-4xl font-black text-white tracking-tight">
            {currentStep === 4 ? "Order Complete! 🎉" : "14 Mins"}
          </span>
          {currentStep !== 4 && (
            <p className="text-xs text-white/80 mt-1 font-medium">
              Estimated arrival at your location
            </p>
          )}
        </div>

        {/* 4-Digit Pickup PIN Card for Takeaway & Dine-In */}
        {(isTakeaway || isDineIn) && currentStep < 4 && (
          <div className="mt-4 inline-flex flex-col items-center rounded-2xl bg-white/15 border border-white/20 px-6 py-3 backdrop-blur-md">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
              Your Counter Pickup PIN
            </span>
            <span className="font-mono text-2xl font-black tracking-[0.3em] text-white mt-0.5">
              {pickupPin}
            </span>
          </div>
        )}
      </div>

      {/* Porter Driver Card for Delivery Orders */}
      {isDelivery && currentStep >= 3 && currentStep < 4 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-low"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-lg">
              🛵
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-sans text-xs font-bold text-text-primary">
                  {porterDriver ? porterDriver.name : "Assigning courier…"}
                </span>
              </div>
              <p className="text-[11px] text-text-secondary">
                {porterDriver
                  ? `Porter Delivery Partner${porterDriver.vehicle ? ` • ${porterDriver.vehicle}` : ""}`
                  : "Your rider details appear here on dispatch"}
              </p>
            </div>
          </div>
          {porterDriver && porterDriver.phone && isSafeTelNumber(porterDriver.phone) ? (
            <a
              href={`tel:${porterDriver.phone}`}
              onClick={() => void HapticService.impact("light")}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition"
              aria-label="Call Porter driver"
            >
              <Phone className="h-4.5 w-4.5" />
            </a>
          ) : null}
        </motion.div>
      )}

      {/* Visual Animated Progress Stepper */}
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-low">
        <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-text-secondary mb-4">
          Preparation Progress
        </h3>

        <div className="relative pl-6 space-y-6 before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
          {steps.map((step) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            const isPending = currentStep < step.id;

            return (
              <div key={step.id} className="relative flex items-start gap-3.5">
                {/* Step Circle Indicator */}
                <div
                  className={cn(
                    "absolute -left-6 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-300",
                    isCompleted
                      ? "border-primary bg-primary text-white"
                      : isCurrent
                        ? "border-accent bg-accent text-white ring-4 ring-accent/20 animate-pulse"
                        : "border-border bg-surface text-text-secondary",
                  )}
                >
                  <step.Icon className="h-3 w-3" />
                </div>

                {/* Step Text Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        "font-sans text-xs font-bold leading-tight",
                        isCurrent
                          ? "text-accent font-extrabold"
                          : isCompleted
                            ? "text-text-primary"
                            : "text-text-secondary",
                      )}
                    >
                      {step.label}
                    </p>
                    {isCurrent && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-extrabold uppercase text-accent">
                        In Progress
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-secondary mt-0.5 leading-snug">
                    {step.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DEV Status Advance Stepper Toggle */}
      {onAdvanceDevStatus && (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-3 text-center">
          <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">
            ⚙️ Developer Demo Mode
          </p>
          <button
            type="button"
            onClick={onAdvanceDevStatus}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-primary-hover active:scale-95 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Simulate Advance Next Status ({currentStep}/4)</span>
          </button>
        </div>
      )}
    </div>
  );
}
