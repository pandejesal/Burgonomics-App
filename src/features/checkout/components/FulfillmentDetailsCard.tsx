import * as React from "react";
import { Bike, Store as StoreIcon, Utensils, Phone, Clock } from "lucide-react";
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
    <div
      className={cn(
        "space-y-3 rounded-[var(--radius-large)] border border-divider bg-surface p-4 shadow-xs sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-medium)] bg-primary/10 text-primary dark:text-primary-text">
            {isDelivery ? (
              <Bike className="h-4 w-4" aria-hidden />
            ) : isTakeaway ? (
              <StoreIcon className="h-4 w-4" aria-hidden />
            ) : (
              <Utensils className="h-4 w-4" aria-hidden />
            )}
          </div>
          <h4 className="type-title-medium min-w-0 text-text-primary">
            {isDelivery
              ? "1. Delivery Details"
              : isTakeaway
                ? "1. Pickup Location"
                : "1. Dine-In Table Details"}
          </h4>
        </div>

        <Link
          to="/cart"
          className="-mr-2 inline-flex min-h-[44px] items-center px-2 type-caption font-semibold text-primary-text hover:underline cursor-pointer"
        >
          Change Mode
        </Link>
      </div>

      {isDelivery ? (
        <div className="space-y-2">
          {selectedAddress ? (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 type-caption font-semibold text-primary-text">
                    {selectedAddress.customLabel || selectedAddress.label}
                  </span>
                  <span className="type-body font-semibold text-text-primary break-words">
                    {selectedAddress.line1}
                  </span>
                </div>
                <p className="type-caption text-text-secondary break-words">
                  {selectedAddress.line2 || selectedAddress.city} • {selectedAddress.pincode}
                </p>
              </div>

              <Link
                to="/profile/addresses"
                className="-mr-2 inline-flex min-h-[44px] items-center px-2 type-caption font-semibold text-primary-text hover:underline shrink-0"
              >
                Change
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 py-1">
              <p className="type-body-medium text-text-secondary">No delivery address selected</p>
              <Link
                to="/profile/addresses"
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-primary px-4 type-button-sm text-primary-foreground"
              >
                + Add Address
              </Link>
            </div>
          )}
        </div>
      ) : isTakeaway ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="type-body font-semibold text-text-primary break-words">
                {store?.name ?? "Burgonomics Outlet"}
              </p>
              <p className="type-caption text-text-secondary break-words">
                {store?.address ?? "Outlet address unavailable"}
              </p>
              {store?.phone && isSafeTelNumber(store.phone) && (
                <a
                  href={`tel:${store.phone}`}
                  className="inline-flex min-h-[44px] items-center gap-1 type-caption font-semibold text-primary-text hover:underline"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  <span>{store.phone}</span>
                </a>
              )}
            </div>

            <Link
              to="/stores"
              className="-mr-2 inline-flex min-h-[44px] items-center px-2 type-caption font-semibold text-primary-text hover:underline shrink-0"
            >
              Change Outlet
            </Link>
          </div>

          <div className="flex items-start gap-2 rounded-[var(--radius-medium)] bg-success/10 p-3 type-caption text-success">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 break-words">
              {(store?.pickupEtaMinutes ?? store?.etaMinutes) != null
                ? `Ready for self-pickup in ~${store?.pickupEtaMinutes ?? store?.etaMinutes} mins after ordering`
                : "Ready for self-pickup after ordering"}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="type-body font-semibold text-text-primary break-words">
                {store?.name ?? "Burgonomics Outlet"}
              </p>
              <p className="type-caption text-text-secondary break-words">
                {store?.address ?? "Outlet address unavailable"}
              </p>
            </div>

            <Link
              to="/stores"
              className="-mr-2 inline-flex min-h-[44px] items-center px-2 type-caption font-semibold text-primary-text hover:underline shrink-0"
            >
              Change Outlet
            </Link>
          </div>

          {/* Table Number Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="dinein-table-number"
              className="type-caption font-medium text-text-primary"
            >
              Table / Booth Number (Required for dine-in)
            </label>
            <input
              id="dinein-table-number"
              type="text"
              placeholder="e.g. Table 4 or Booth B"
              value={tableNumber}
              onChange={(e) => onTableNumberChange?.(e.target.value)}
              className="min-h-[44px] w-full rounded-[var(--radius-medium)] border border-border bg-bg-secondary px-3.5 py-2.5 text-base font-medium text-text-primary outline-none transition-colors focus:border-primary"
            />
          </div>

          <div className="flex items-start gap-2 rounded-[var(--radius-medium)] bg-primary/10 p-3 type-caption text-primary-text">
            <Utensils className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              Your order will be transmitted directly to the kitchen POS
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default FulfillmentDetailsCard;
