import * as React from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, ChevronDown, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModeSegmentedSwitch } from "./ModeSegmentedSwitch";
import { useStoreSelection, type Fulfillment } from "@/features/stores/state/storeStore";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses";
import { useNotificationsStore } from "@/features/notifications/state/notificationsStore";
import { HapticService } from "@/core/services/haptics";

interface BrandHeaderProps {
  className?: string;
}

/**
 * Compact brand strip, unboxed outlet row, then the 48px mode control.
 *
 * Search deliberately does not live here: it sits beside the Menu heading below
 * the promo, so the top of Home is brand + outlet + mode only.
 */
export function BrandHeader({ className }: BrandHeaderProps) {
  const activeStore = useStoreSelection((s) => s.activeStore);
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);

  const selectedAddress = useAddressStore(selectSelectedAddress);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  const handleModeChange = (mode: Fulfillment) => {
    setFulfillment(mode);
  };

  const outletDisplay = activeStore
    ? activeStore.name.replace("Burgonomics - ", "")
    : "Select outlet";

  const locationSubtitle =
    fulfillment === "delivery"
      ? selectedAddress
        ? `${selectedAddress.customLabel || selectedAddress.label} · ${selectedAddress.line1}`
        : "Tap to set delivery location"
      : activeStore
        ? activeStore.address.split(",")[0]
        : "Choose an outlet";

  return (
    <header className={cn("w-full bg-background px-4 pt-3 pb-3 text-text-primary", className)}>
      {/* Brand strip: mascot + company wordmark, notifications only */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Link
          to="/home"
          aria-label="Burgonomics Home"
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => void HapticService.selection()}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface p-0.5">
            <img src="/burgonomics-logo.png" alt="" className="h-full w-full object-contain" />
          </div>
          <span className="type-brand-heading min-w-0 break-words text-2xl text-primary-text">
            BURGONOMICS
          </span>
        </Link>

        <div className="shrink-0">
          <Link
            to="/profile/notifications"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent"
                aria-hidden="true"
              />
            )}
          </Link>
        </div>
      </div>

      {/* Outlet row: unboxed, city then outlet, wraps instead of clipping */}
      <Link
        to="/stores"
        onClick={() => void HapticService.selection()}
        className="mt-1 flex min-h-11 items-start gap-2.5 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <MapPin className="mt-1 h-5 w-5 shrink-0 text-text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm leading-snug text-text-secondary">
            {locationSubtitle}
          </span>
          <span className="mt-0.5 flex items-start gap-1">
            <span className="type-subheading min-w-0 break-words text-base leading-snug text-text-primary">
              {outletDisplay}
            </span>
            <ChevronDown
              className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
              aria-hidden="true"
            />
          </span>
        </span>
      </Link>

      {/* Single-row 3-mode control: 48px minimum, grows with text */}
      <div className="mt-3">
        <ModeSegmentedSwitch value={fulfillment} onChange={handleModeChange} />
      </div>
    </header>
  );
}
