import * as React from "react";
import { Bike, Store as StoreIcon, Utensils, Phone, Clock, MapPin } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { isSafeTelNumber } from "@/shared/utils/urlSafety";
import type { Fulfillment, Store } from "@/features/stores/models/Store";
import type { Address } from "@/features/addresses/models";

const FULFILLMENT_ORDER: readonly Fulfillment[] = ["delivery", "takeaway", "dinein"];

const FULFILLMENT_OPTIONS: Record<
  Fulfillment,
  { label: string; Icon: typeof Bike; description: string }
> = {
  delivery: {
    label: "Delivery",
    Icon: Bike,
    description: "To your selected address",
  },
  takeaway: {
    label: "Takeaway",
    Icon: StoreIcon,
    description: "Pick up at the outlet",
  },
  dinein: {
    label: "Dine-In",
    Icon: Utensils,
    description: "Eat at the outlet",
  },
};

interface FulfillmentDetailsCardProps {
  /**
   * The chosen mode, or `null` while the customer has not made a valid
   * choice. Never default this to "delivery" — an unselected mode must read as
   * unselected, not as a delivery order.
   */
  fulfillment: Fulfillment | null;
  store: Store | null;
  /** Modes the active outlet actually supports. */
  supportedModes: readonly Fulfillment[];
  selectedAddress: Address | null;
  tableNumber?: string;
  onTableNumberChange?: (table: string) => void;
  /** Only called with a mode the caller has already validated. */
  onSelectFulfillment?: (mode: Fulfillment) => void;
  className?: string;
}

export function FulfillmentDetailsCard({
  fulfillment,
  store,
  supportedModes,
  selectedAddress,
  tableNumber = "",
  onTableNumberChange,
  onSelectFulfillment,
  className,
}: FulfillmentDetailsCardProps) {
  // Defensive: a mode the outlet does not offer is not a selection. The
  // checkout passes `null` in that case, but the card must not fall back into
  // a mode branch on its own.
  const selectedMode =
    fulfillment && supportedModes.includes(fulfillment) ? fulfillment : null;
  const availableModes = FULFILLMENT_ORDER.filter((mode) => supportedModes.includes(mode));

  // Focus/announcement state lives above every branch (this component has no
  // early return, and must not gain one). A user's radio choice unmounts the
  // fieldset, so focus is moved to the resulting section heading AFTER the
  // parent confirms the selection — never on hydration or an automatic mode
  // change, where no request was recorded.
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const requestedModeRef = React.useRef<Fulfillment | null>(null);
  const pendingAnnouncementRef = React.useRef("");
  const [announcement, setAnnouncement] = React.useState("");

  React.useEffect(() => {
    const requested = requestedModeRef.current;
    if (!requested || selectedMode !== requested) return;
    requestedModeRef.current = null;
    // Announce only after the parent confirmed the selection, so a rejected
    // request is never read out as if it had been applied.
    setAnnouncement(pendingAnnouncementRef.current);
    pendingAnnouncementRef.current = "";
    headingRef.current?.focus();
  }, [selectedMode]);

  const chooseMode = (mode: Fulfillment) => {
    requestedModeRef.current = mode;
    pendingAnnouncementRef.current = `${FULFILLMENT_OPTIONS[mode].label} selected. Details updated below.`;
    onSelectFulfillment?.(mode);
  };

  const isDelivery = selectedMode === "delivery";
  const isTakeaway = selectedMode === "takeaway";
  const isDineIn = selectedMode === "dinein";

  const heading = isDelivery
    ? "1. Delivery Details"
    : isTakeaway
      ? "1. Pickup Location"
      : isDineIn
        ? "1. Dine-In Table Details"
        : "1. Fulfillment Details";

  return (
    <div className={cn("p-4 sm:p-5 rounded-2xl border border-divider bg-surface space-y-3 shadow-xs", className)}>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="flex items-center justify-between border-b border-divider pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0E4825]/10 text-[#0E4825] dark:text-[#4ADE80] flex items-center justify-center">
            {isDelivery ? (
              <Bike className="w-4 h-4" />
            ) : isTakeaway ? (
              <StoreIcon className="w-4 h-4" />
            ) : isDineIn ? (
              <Utensils className="w-4 h-4" />
            ) : (
              <MapPin className="w-4 h-4" />
            )}
          </div>
          <h4
            ref={headingRef}
            tabIndex={-1}
            className="text-xs font-bold uppercase tracking-wider text-text rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {heading}
          </h4>
        </div>

        {selectedMode && (
          <Link
            to="/cart"
            className="text-xs font-bold text-accent dark:text-accent-foreground hover:underline cursor-pointer"
          >
            Change Mode
          </Link>
        )}
      </div>

      {selectedMode === null ? (
        <div className="space-y-3">
          {store === null ? (
            <div className="flex items-center justify-between gap-3 py-1">
              <p className="text-xs text-text-secondary">
                Select an outlet to see delivery, takeaway, and dine-in options.
              </p>
              <Link
                to="/stores"
                className="shrink-0 text-xs font-bold text-accent dark:text-accent-foreground hover:underline"
              >
                Choose Outlet
              </Link>
            </div>
          ) : availableModes.length === 0 ? (
            <div className="flex items-center justify-between gap-3 py-1">
              <p className="text-xs text-text-secondary">
                This outlet is not offering delivery, takeaway, or dine-in right now.
              </p>
              <Link
                to="/stores"
                className="shrink-0 text-xs font-bold text-accent dark:text-accent-foreground hover:underline"
              >
                Choose Outlet
              </Link>
            </div>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-text">
                Choose how you&apos;d like your order
              </legend>
              <p className="text-[11px] text-text-secondary">
                Payment stays disabled until you choose a mode.
              </p>
              <div className="space-y-2">
                {availableModes.map((mode) => {
                  const option = FULFILLMENT_OPTIONS[mode];
                  const Icon = option.Icon;
                  return (
                    <label
                      key={mode}
                      className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-divider bg-surface px-3.5 py-2.5 text-xs font-bold text-text transition-colors hover:border-primary/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25"
                    >
                      <input
                        type="radio"
                        name="checkout-fulfillment-mode"
                        value={mode}
                        checked={false}
                        onChange={() => chooseMode(mode)}
                        className="h-4 w-4 shrink-0 accent-[#0E4825]"
                      />
                      <Icon className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                      <span>{option.label}</span>
                      <span className="ml-auto text-[11px] font-medium text-text-secondary">
                        {option.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      ) : isDelivery ? (
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
                className="text-xs font-bold text-accent dark:text-accent-foreground hover:underline"
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
            <span>
              {(store?.pickupEtaMinutes ?? store?.etaMinutes) != null
                ? `Ready for self-pickup in ~${store?.pickupEtaMinutes ?? store?.etaMinutes} mins after ordering`
                : "Ready for self-pickup after ordering"}
            </span>
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
            <label
              htmlFor="checkout-table-number"
              className="text-xs font-bold text-text-secondary"
            >
              Table / Booth Number (Required for dine-in)
            </label>
            <input
              id="checkout-table-number"
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
