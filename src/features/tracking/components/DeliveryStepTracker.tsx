import React from "react";
import { Check, Flame, Bike, PartyPopper, Clock, Utensils, AlertCircle } from "lucide-react";
import type { PorterTrackingState } from "../hooks/usePorterLiveTracking";

interface DeliveryStepTrackerProps {
  tracking: PorterTrackingState;
  onAdvanceDevStatus?: () => void;
}

export function DeliveryStepTracker({
  tracking,
  onAdvanceDevStatus,
}: DeliveryStepTrackerProps) {
  const {
    currentStage,
    stageName,
    stageDescription,
    etaMinutes,
    isTakeawayOrDineIn,
    isCancelled,
    isDelivered,
    riderName,
    riderPhone,
    riderVehicleNumber,
  } = tracking;

  if (isCancelled) {
    return (
      <div className="space-y-3 rounded-3xl border border-error/30 bg-error/10 p-5">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-error">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          {/* Title from the state itself so CANCELLED and FAILED (and any
              future terminal state) render their own honest name instead of a
              hard-coded "Order Cancelled". */}
          <span>{stageName}</span>
        </div>
        <p className="text-sm leading-relaxed text-text-secondary">{stageDescription}</p>
      </div>
    );
  }

  // Stage copy must not claim a courier exists before dispatch has actually
  // assigned one (DISPATCH / TRANSIT / READY land ahead of rider details).
  const hasCourierDetails = Boolean(riderName || riderPhone || riderVehicleNumber);
  const courierUnconfirmed = currentStage === 3 && !isTakeawayOrDineIn && !hasCourierDetails;
  const description = courierUnconfirmed
    ? "Out for delivery — courier details appear after dispatch"
    : stageDescription;

  const steps = [
    {
      stage: 1,
      title: "Placed",
      sub: "Confirmed",
      icon: Check,
    },
    {
      stage: 2,
      title: "Grilling",
      sub: "In Kitchen",
      icon: Flame,
    },
    {
      stage: 3,
      title: isTakeawayOrDineIn ? "Ready" : "On the Way",
      sub: isTakeawayOrDineIn ? "At Counter" : courierUnconfirmed ? "Out for delivery" : "With Courier",
      icon: isTakeawayOrDineIn ? Utensils : Bike,
    },
    {
      stage: 4,
      title: isTakeawayOrDineIn ? "Collected" : "Delivered",
      sub: "Enjoy Feast",
      icon: PartyPopper,
    },
  ];

  return (
    <div className="space-y-5 rounded-3xl border border-divider bg-surface p-5 shadow-lg">
      {/* Tracker Status Banner & ETA */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="mb-1 block type-label-medium text-primary-text">
            Live order progress
          </span>
          <h2 className="type-headline-medium flex flex-wrap items-center gap-2 text-text">
            <span>{stageName}</span>
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p>
        </div>

        {isDelivered ? (
          <div className="shrink-0 rounded-2xl border border-success/30 bg-success/10 px-3.5 py-2 text-right">
            <span className="block type-label-medium text-text-secondary">Order status</span>
            <span className="text-sm font-semibold tabular-nums text-success">Complete ✓</span>
          </div>
        ) : etaMinutes == null ? (
          // No estimate on the order — say so rather than inventing a countdown.
          <div className="shrink-0 rounded-2xl border border-divider bg-bg-secondary px-3.5 py-2 text-right">
            <span className="block type-label-medium text-text-secondary">Estimated ETA</span>
            <span className="text-sm font-medium text-text-secondary">Estimate unavailable</span>
          </div>
        ) : (
          <div className="shrink-0 rounded-2xl border border-accent/30 bg-accent/10 px-3.5 py-2 text-right">
            <span className="block type-label-medium text-text-secondary">Estimated ETA</span>
            <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-accent">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{etaMinutes > 0 ? `${etaMinutes} mins` : "Due now"}</span>
            </span>
          </div>
        )}
      </div>

      {/* 4-Stage Stepper Progress Bar */}
      <div className="relative pt-2">
        {/* Background connector bar */}
        <div className="absolute left-6 right-6 top-[26px] -z-0 h-1 rounded-full bg-divider" />

        {/* Active progress fill */}
        <div
          className="absolute left-6 top-[26px] -z-0 h-1 rounded-full bg-primary transition-all duration-500"
          style={{
            width: `calc(${((currentStage - 1) / 3) * 100}% * (100% - 48px) / 100)`,
          }}
        />

        <div className="relative z-10 grid grid-cols-4 gap-2">
          {steps.map((step) => {
            const isCompleted = step.stage < currentStage;
            const isActive = step.stage === currentStage;
            const Icon = step.icon;

            return (
              <div key={step.stage} className="group flex flex-col items-center text-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-300 ${
                    isCompleted
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : isActive
                      ? "scale-110 border-accent bg-accent text-accent-foreground shadow-md"
                      : "border-divider bg-bg-secondary text-text-secondary"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </div>
                <span
                  className={`mt-2 text-sm leading-tight ${
                    isActive ? "font-semibold text-text" : isCompleted ? "font-medium text-primary-text" : "font-medium text-text-secondary"
                  }`}
                >
                  {step.title}
                </span>
                {/* Four columns on a phone: the sub-label is the one genuinely
                    space-constrained slot, so it stays at 12px rather than 14px. */}
                <span className="mt-0.5 text-xs leading-tight text-text-secondary">{step.sub}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Developer Simulation Trigger */}
      {onAdvanceDevStatus && (
        <div className="flex items-center justify-between gap-3 border-t border-divider pt-3 text-sm text-text-secondary">
          <span className="italic">Sandbox Demo: Advance lifecycle</span>
          <button
            type="button"
            onClick={onAdvanceDevStatus}
            className="min-h-11 rounded-lg border border-divider bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-bg-secondary cursor-pointer"
          >
            Advance Stage ➔
          </button>
        </div>
      )}
    </div>
  );
}

export default DeliveryStepTracker;
