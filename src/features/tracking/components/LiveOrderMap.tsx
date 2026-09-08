import * as React from "react";
import { MapPin, Store as StoreIcon } from "lucide-react";
import type { PorterLiveTracking } from "../usePorterLiveTracking";

interface Props {
  tracking: PorterLiveTracking;
  storeName: string;
  customerAddressText: string;
}

/**
 * LiveOrderMap — honest placeholder. No live GPS feed is integrated, so
 * this renders the route endpoints (store → destination) with the
 * current stage instead of a fabricated map with invented pins.
 */
export const LiveOrderMap = React.memo(function LiveOrderMap({
  tracking,
  storeName,
  customerAddressText,
}: Props) {
  const currentLabel = tracking.cancelled
    ? "Cancelled"
    : (tracking.stages[tracking.stageIndex]?.label ?? "Tracking");

  return (
    <section aria-label="Delivery route" className="rounded-3xl border border-divider bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <StoreIcon className="h-4 w-4 mt-0.5 shrink-0 text-text-secondary" aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">From</p>
          <p className="text-xs font-bold text-text truncate">{storeName}</p>
        </div>
      </div>
      <div className="ml-2 h-5 w-0.5 bg-divider" aria-hidden />
      <div className="flex items-start gap-3">
        <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-text-secondary" aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">To</p>
          <p className="text-xs font-bold text-text leading-snug">{customerAddressText}</p>
        </div>
      </div>
      <p role="status" className="rounded-xl bg-bg-secondary px-3 py-2 text-[11px] text-text-secondary">
        Live GPS tracking isn&apos;t available yet — current stage:{" "}
        <span className="font-bold text-text">{currentLabel}</span>. Pull to refresh for updates.
      </p>
    </section>
  );
});
