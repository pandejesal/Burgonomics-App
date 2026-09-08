import * as React from "react";
import { Check, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PorterLiveTracking } from "../usePorterLiveTracking";

interface Props {
  tracking: PorterLiveTracking;
}

/**
 * DeliveryStepTracker — renders the 4-stage order progress from the
 * tracking view-model. Status-driven only; no dev-simulation controls.
 */
export const DeliveryStepTracker = React.memo(function DeliveryStepTracker({ tracking }: Props) {
  if (tracking.cancelled) {
    return (
      <div role="status" className="flex items-center gap-3 rounded-3xl border border-error/40 bg-error/5 p-4">
        <XCircle className="h-5 w-5 text-error shrink-0" aria-hidden />
        <div>
          <p className="text-xs font-black text-error">Order cancelled</p>
          <p className="text-[11px] text-text-secondary">This order will not be prepared or delivered.</p>
        </div>
      </div>
    );
  }

  return (
    <ol aria-label="Order progress" className="rounded-3xl border border-divider bg-surface p-4 shadow-sm">
      {tracking.stages.map((stage, i) => (
        <li key={stage.code} className="relative flex gap-3 pb-5 last:pb-0">
          {i < tracking.stages.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-0.5",
                stage.done ? "bg-[#0E4825]" : "bg-divider",
              )}
            />
          )}
          <span
            aria-hidden
            className={cn(
              "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
              stage.done || stage.current
                ? "border-[#0E4825] bg-[#0E4825] text-white"
                : "border-divider bg-bg-secondary text-text-secondary",
            )}
          >
            {stage.done ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <span className="text-[11px] font-black">{i + 1}</span>
            )}
          </span>
          <div className="pt-0.5">
            <p className={cn("text-xs font-bold", stage.current ? "text-text" : stage.done ? "text-text" : "text-text-secondary")}>
              {stage.label}
              {stage.current && (
                <span className="ml-2 rounded-full bg-[#0E4825]/10 px-2 py-0.5 text-[10px] font-black uppercase text-[#0E4825] dark:text-[#4ADE80]">
                  Current
                </span>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
});
