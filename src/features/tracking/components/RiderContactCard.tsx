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
      <div className="p-4 rounded-3xl border border-neutral-800 bg-[#0E4825]/10 space-y-3 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#0E4825] border border-emerald-500/40 text-emerald-300">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-xs block text-white">Self-Pickup Counter Order</span>
              <span className="text-[11px] text-neutral-400">Collect directly from the express takeaway counter</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-neutral-800">
          {safeStorePhone ? (
          <a
            href={`tel:${safeStorePhone}`}
            className="flex-1 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span>Call Restaurant ({safeStorePhone})</span>
          </a>
          ) : (
            <span className="text-neutral-500 italic text-[11px]">Restaurant phone unavailable</span>
          )}

          {onOpenSupport && (
            <button
              type="button"
              onClick={onOpenSupport}
              className="py-2.5 px-3.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-orange-400" />
              <span>Need Help?</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-3xl border border-neutral-800 bg-[#0D0D0D] space-y-4 text-white shadow-md">
      {/* Partner Badge & Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-2xl bg-cyan-950 border border-cyan-500/40 text-cyan-300">
            <Bike className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
              Delivery Partner
            </span>
            <span className="font-black text-sm text-white">{partnerName}</span>
          </div>
        </div>

        {riderVehicleNumber && (
          <span className="font-mono text-xs px-2.5 py-1 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 font-bold">
            {riderVehicleNumber}
          </span>
        )}
      </div>

      {/* Rider Name & 1-Tap Calling CTA */}
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-neutral-400 block text-[11px]">Assigned Rider</span>
          <span className="font-black text-sm text-white">{riderName || "Assigning Courier..."}</span>
        </div>

        {safeRiderPhone ? (
          <a
            href={`tel:${safeRiderPhone}`}
            className="px-4 py-2 rounded-xl bg-[#0E4825] hover:bg-[#135d30] border border-emerald-500/40 text-emerald-300 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Call Rider</span>
          </a>
        ) : (
          <span className="text-neutral-500 italic text-[11px]">Contact available upon dispatch</span>
        )}
      </div>

      {/* Escalation CTAs */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800/80 text-xs">
        {safeStorePhone ? (
        <a
          href={`tel:${safeStorePhone}`}
          className="py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white font-bold text-center flex items-center justify-center gap-1.5 transition-colors"
        >
          <Phone className="w-3.5 h-3.5 text-neutral-400" />
          <span>Call Store</span>
        </a>
        ) : (
          <span className="text-neutral-500 italic text-[11px] self-center">Store phone unavailable</span>
        )}

        {onOpenSupport ? (
          <button
            type="button"
            onClick={onOpenSupport}
            className="py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#FF6600]" />
            <span>Report Issue</span>
          </button>
        ) : (
          <a
            href="/support"
            className="py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#FF6600]" />
            <span>Support</span>
          </a>
        )}
      </div>
    </div>
  );
}

export default RiderContactCard;
