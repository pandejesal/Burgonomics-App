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
      <div className="rounded-3xl border border-red-500/30 bg-red-950/20 p-5 space-y-3">
        <div className="flex items-center gap-2.5 text-red-400 font-black text-sm">
          <AlertCircle className="w-5 h-5" />
          {/* Title from the state itself so CANCELLED and FAILED (and any
              future terminal state) render their own honest name instead of a
              hard-coded "Order Cancelled". */}
          <span>{stageName}</span>
        </div>
        <p className="text-xs text-neutral-400">{stageDescription}</p>
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
    <div className="rounded-3xl border border-divider bg-surface p-5 space-y-5 shadow-lg">
      {/* Tracker Status Banner & ETA */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-500 block mb-0.5">
            Live Order Progress
          </span>
          <h2 className="text-base sm:text-lg font-black tracking-tight text-text flex items-center gap-2">
            <span>{stageName}</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">{description}</p>
        </div>

        {isDelivered ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-1.5 text-right shrink-0">
            <span className="text-[9px] font-bold text-emerald-400 block uppercase">Order Status</span>
            <span className="font-mono font-black text-xs text-emerald-300">Complete ✓</span>
          </div>
        ) : etaMinutes == null ? (
          // No estimate on the order — say so rather than inventing a countdown.
          <div className="rounded-2xl border border-divider bg-bg-secondary px-3 py-1.5 text-right shrink-0">
            <span className="text-[9px] font-bold text-text-secondary block uppercase">Estimated ETA</span>
            <span className="font-mono font-black text-xs text-text-secondary">Estimate unavailable</span>
          </div>
        ) : (
          <div className="rounded-2xl border border-orange-500/30 bg-orange-950/30 px-3 py-1.5 text-right shrink-0">
            <span className="text-[9px] font-bold text-orange-400 block uppercase">Estimated ETA</span>
            <span className="font-mono font-black text-sm text-accent dark:text-accent-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{etaMinutes > 0 ? `${etaMinutes} mins` : "Due now"}</span>
            </span>
          </div>
        )}
      </div>

      {/* 4-Stage Stepper Progress Bar */}
      <div className="relative pt-2">
        {/* Background connector bar */}
        <div className="absolute top-[26px] left-6 right-6 h-1 bg-divider -z-0 rounded-full" />

        {/* Active progress fill */}
        <div
          className="absolute top-[26px] left-6 h-1 bg-gradient-to-r from-emerald-500 via-[#FF6600] to-emerald-400 -z-0 rounded-full transition-all duration-500"
          style={{
            width: `calc(${((currentStage - 1) / 3) * 100}% * (100% - 48px) / 100)`,
          }}
        />

        <div className="grid grid-cols-4 gap-2 relative z-10">
          {steps.map((step) => {
            const isCompleted = step.stage < currentStage;
            const isActive = step.stage === currentStage;
            const Icon = step.icon;

            return (
              <div key={step.stage} className="flex flex-col items-center text-center group">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-300 ${
                    isCompleted
                      ? "bg-[#0E4825] border-emerald-500 text-emerald-300 shadow-xs"
                      : isActive
                      ? "bg-[#FF6600] border-orange-400 text-white shadow-md scale-110 animate-bounce"
                      : "bg-bg-secondary border-divider text-text-secondary"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span
                  className={`text-xs font-black mt-2 leading-none ${
                    isActive ? "text-text font-bold" : isCompleted ? "text-emerald-500" : "text-text-secondary"
                  }`}
                >
                  {step.title}
                </span>
                <span className="text-[10px] text-text-secondary mt-0.5 leading-tight">{step.sub}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Developer Simulation Trigger */}
      {onAdvanceDevStatus && (
        <div className="pt-2 border-t border-divider flex items-center justify-between text-[11px] text-text-secondary">
          <span className="italic">Sandbox Demo: Advance lifecycle</span>
          <button
            type="button"
            onClick={onAdvanceDevStatus}
            className="px-2.5 py-1 rounded-lg bg-surface hover:bg-bg-secondary border border-divider text-text text-[11px] font-bold transition-colors cursor-pointer"
          >
            Advance Stage ➔
          </button>
        </div>
      )}
    </div>
  );
}

export default DeliveryStepTracker;
