import React from "react";
import { Bike, Phone, MessageSquare, ShieldCheck, AlertCircle, ExternalLink } from "lucide-react";
import type { PorterTrackingState } from "../hooks/usePorterLiveTracking";
import { isSafeTelNumber } from "@/shared/utils/urlSafety";

interface RiderContactCardProps {
  tracking: PorterTrackingState;
  storePhone?: string;
  onOpenSupport?: () => void;
}

export function RiderContactCard({
  tracking,
  storePhone,
  onOpenSupport,
}: RiderContactCardProps) {
  const {
    riderName,
    riderPhone,
    riderVehicleNumber,
    partnerName,
    currentStage,
    isTakeawayOrDineIn,
    trackingUrl,
  } = tracking;

  // Loop 19/120: phone numbers come from order docs (staff-entered values
  // included) — only dialable shapes become one-tap tel: links.
  const safeStorePhone = storePhone && isSafeTelNumber(storePhone) ? storePhone : undefined;
  const safeRiderPhone = riderPhone && isSafeTelNumber(riderPhone) ? riderPhone : undefined;

  if (isTakeawayOrDineIn) {
    return (
      <div className="space-y-4 rounded-3xl border border-divider bg-primary/5 p-5 text-text">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-primary/25 bg-primary p-2 text-primary-foreground">
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold text-text">Self-Pickup Counter Order</span>
              <span className="text-sm leading-relaxed text-text-secondary">Collect directly from the express takeaway counter</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-3">
          {safeStorePhone ? (
          <a
            href={`tel:${safeStorePhone}`}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-divider bg-surface px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-bg-secondary"
          >
            <Phone className="h-3.5 w-3.5 text-primary-text" aria-hidden />
            <span>Call Restaurant ({safeStorePhone})</span>
          </a>
          ) : (
            <span className="text-sm italic text-text-secondary">Restaurant phone unavailable</span>
          )}

          {onOpenSupport && (
            <button
              type="button"
              onClick={onOpenSupport}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-divider bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-bg-secondary cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>Need help?</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-divider bg-surface p-5 text-text shadow-md">
      {/* Partner Badge & Header */}
      <div className="flex items-center justify-between gap-3 border-b border-divider pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-primary/25 bg-primary/10 p-2.5 text-primary-text">
            <Bike className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <span className="block type-label-medium text-text-secondary">
              Delivery partner
            </span>
            <span className="text-base font-semibold text-text">{partnerName}</span>
          </div>
        </div>

        {riderVehicleNumber && (
          <span className="rounded-xl border border-divider bg-bg-secondary px-2.5 py-1 text-sm font-semibold tabular-nums text-text">
            {riderVehicleNumber}
          </span>
        )}
      </div>

      {/* Rider Name & 1-Tap Calling CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm text-text-secondary">Assigned rider</span>
          <span className="text-base font-semibold text-text">{riderName || "Assigning Courier..."}</span>
        </div>

        {safeRiderPhone ? (
          <a
            href={`tel:${safeRiderPhone}`}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover active:scale-95 cursor-pointer"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            <span>Call Rider</span>
          </a>
        ) : (
          <span className="text-sm italic text-text-secondary">Contact available upon dispatch</span>
        )}
      </div>

      {/* Escalation CTAs */}
      <div className="grid grid-cols-2 gap-2.5 border-t border-divider pt-3">
        {safeStorePhone ? (
        <a
          href={`tel:${safeStorePhone}`}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-secondary py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface"
        >
          <Phone className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
          <span>Call Store</span>
        </a>
        ) : (
          <span className="self-center text-sm italic text-text-secondary">Store phone unavailable</span>
        )}

        {onOpenSupport ? (
          <button
            type="button"
            onClick={onOpenSupport}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-secondary py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5 text-accent" aria-hidden />
            <span>Report Issue</span>
          </button>
        ) : (
          <a
            href="/support"
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-secondary py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface"
          >
            <MessageSquare className="h-3.5 w-3.5 text-accent" aria-hidden />
            <span>Support</span>
          </a>
        )}
      </div>
    </div>
  );
}

export default RiderContactCard;
