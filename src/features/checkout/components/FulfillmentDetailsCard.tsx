import * as React from "react";
import { Bike, Store as StoreIcon, Utensils, Phone, Clock, MapPin, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { isSafeTelNumber } from "@/shared/utils/urlSafety";
import type { Fulfillment, Store } from "@/features/stores/models/Store";
import type { Address } from "@/features/addresses/models";

interface FulfillmentDetailsCardProps {
  fulfillment: Fulfillment;
  store: Store | null;
  selectedAddress: Address | null;
  tableNumber?: string;
  onTableNumberChange?: (table: string) => void;
  className?: string;
}

export function FulfillmentDetailsCard({
  fulfillment,
  store,
  selectedAddress,
  tableNumber = "",
  onTableNumberChange,
  className,
}: FulfillmentDetailsCardProps) {
  const isDelivery = fulfillment === "delivery";
  const isTakeaway = fulfillment === "takeaway";
  const isDineIn = fulfillment === "dinein";

  return (
    <div className={cn("p-4 sm:p-5 rounded-2xl border border-divider bg-surface space-y-3 shadow-xs", className)}>
      <div className="flex items-center justify-between border-b border-divider pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0E4825]/10 text-[#0E4825] dark:text-[#4ADE80] flex items-center justify-center">
            {isDelivery ? (
              <Bike className="w-4 h-4" />
            ) : isTakeaway ? (
              <StoreIcon className="w-4 h-4" />
            ) : (
              <Utensils className="w-4 h-4" />
            )}
          </div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text">
            {isDelivery ? "1. Delivery Details" : isTakeaway ? "1. Pickup Location" : "1. Dine-In Table Details"}
          </h4>
        </div>

        <Link
          to="/cart"
          className="text-xs font-bold text-[#FF6600] hover:underline cursor-pointer"
        >
          Change Mode
        </Link>
      </div>

      {isDelivery ? (
        <div className="space-y-2">
          {selectedAddress ? (
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-[#0E4825]/15 text-[#0E4825] dark:text-[#4ADE80] text-[10px] font-black uppercase">
                    {selectedAddress.customLabel || selectedAddress.label}
                  </span>
                  <span className="text-xs font-bold text-text truncate">
                    {selectedAddress.line1}
                  </span>
                </div>
                <p className="text-[11px] text-text-secondary truncate">
                  {selectedAddress.line2 || selectedAddress.city} • {selectedAddress.pincode}
                </p>
              </div>

              <Link
                to="/profile/addresses"
                className="text-xs font-bold text-primary hover:underline shrink-0"
              >
                Change
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between py-1">
              <p className="text-xs text-text-secondary">No delivery address selected</p>
              <Link
                to="/profile/addresses"
                className="text-xs font-bold text-[#FF6600] hover:underline"
              >
                + Add Address
              </Link>
            </div>
          )}
        </div>
      ) : isTakeaway ? (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-xs sm:text-sm font-bold text-text truncate">
                {store?.name ?? "Burgonomics Outlet"}
              </p>
              <p className="text-[11px] text-text-secondary">
                {store?.address ?? "Ahmedabad, Gujarat"}
              </p>
              {store?.phone && isSafeTelNumber(store.phone) && (
                <a
                  href={`tel:${store.phone}`}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0E4825] dark:text-[#4ADE80] hover:underline pt-0.5"
                >
                  <Phone className="w-3 h-3" />
                  <span>{store.phone}</span>
                </a>
              )}
            </div>

            <Link
              to="/stores"
              className="text-xs font-bold text-primary hover:underline shrink-0"
            >
              Change Outlet
            </Link>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
            <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Ready for self-pickup in ~{store?.pickupEtaMinutes ?? 15} mins after ordering</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs sm:text-sm font-bold text-text truncate">
                {store?.name ?? "Burgonomics Flagship Outlet"}
              </p>
              <p className="text-[11px] text-text-secondary">
                {store?.address ?? "Ahmedabad, Gujarat"}
              </p>
            </div>

            <Link
              to="/stores"
              className="text-xs font-bold text-primary hover:underline shrink-0"
            >
              Change Outlet
            </Link>
          </div>

          {/* Table Number Input */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-secondary">
              Table / Booth Number (Required for dine-in)
            </label>
            <input
              type="text"
              placeholder="e.g. Table 4 or Booth B"
              value={tableNumber}
              onChange={(e) => onTableNumberChange?.(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-bg-secondary border border-divider text-xs font-medium text-text outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2 p-2 rounded-xl bg-[#0E4825]/10 text-[#0E4825] dark:text-[#4ADE80] text-xs font-medium">
            <Utensils className="w-3.5 h-3.5 shrink-0" />
            <span>Your order will be transmitted directly to the kitchen POS</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default FulfillmentDetailsCard;
