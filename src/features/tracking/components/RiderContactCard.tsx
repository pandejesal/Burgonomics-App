import * as React from "react";
import { Phone, LifeBuoy, Store as StoreIcon } from "lucide-react";
import type { PorterLiveTracking } from "../usePorterLiveTracking";

interface Props {
  tracking: PorterLiveTracking;
  /** Real store phone from the order snapshot. Omit when unknown — never invent. */
  storePhone?: string | null;
  onOpenSupport: () => void;
}

/**
 * RiderContactCard — shows the assigned rider only when the backend
 * actually assigned one, and the store phone only when known. Falls
 * back to support escalation instead of invented contact details.
 */
export const RiderContactCard = React.memo(function RiderContactCard({
  tracking,
  storePhone,
  onOpenSupport,
}: Props) {
  const rider = tracking.snapshot?.deliveryPartner;
  const hasRider = Boolean(rider?.name || rider?.phone);

  return (
    <section aria-label="Delivery contact" className="rounded-3xl border border-divider bg-surface p-4 shadow-sm space-y-3">
      {hasRider ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Your rider</p>
            <p className="text-xs font-bold text-text truncate">{rider?.name ?? "Delivery partner"}</p>
            {rider?.vehicleNumber && (
              <p className="text-[11px] text-text-secondary">{rider.vehicleNumber}</p>
            )}
          </div>
          {rider?.phone && (
            <a
              href={`tel:${rider.phone}`}
              aria-label={`Call rider ${rider.name ?? ""}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0E4825] text-white"
            >
              <Phone className="h-4 w-4" aria-hidden />
            </a>
          )}
        </div>
      ) : (
        <p className="text-xs text-text-secondary">
          No rider assigned yet — we&apos;ll show contact details here once a partner picks up your order.
        </p>
      )}

      <div className="flex gap-2 border-t border-divider pt-3">
        {storePhone ? (
          <a
            href={`tel:${storePhone}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-divider py-2.5 text-xs font-bold text-text hover:border-primary/40"
          >
            <StoreIcon className="h-3.5 w-3.5" aria-hidden />
            Call store
          </a>
        ) : null}
        <button
          type="button"
          onClick={onOpenSupport}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#FF6600] py-2.5 text-xs font-extrabold uppercase tracking-wider text-white cursor-pointer"
        >
          <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
          Get help
        </button>
      </div>
    </section>
  );
});
