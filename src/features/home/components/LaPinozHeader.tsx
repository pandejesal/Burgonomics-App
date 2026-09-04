import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { MapPin, ChevronDown, Search, Bell, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModeSegmentedSwitch } from "./ModeSegmentedSwitch";
import { useStoreSelection, type Fulfillment } from "@/features/stores/state/storeStore";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses";
import { useLoyaltyStore } from "@/features/loyalty/state/loyaltyStore";
import { HapticService } from "@/core/services/haptics";

interface LaPinozHeaderProps {
  onSearchClick?: () => void;
  className?: string;
}

export function LaPinozHeader({ onSearchClick, className }: LaPinozHeaderProps) {
  const navigate = useNavigate();
  const activeStore = useStoreSelection((s) => s.activeStore);
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const setFulfillment = useStoreSelection((s) => s.setFulfillment);

  const selectedAddress = useAddressStore(selectSelectedAddress);
  const loyaltyBalance = useLoyaltyStore((s) => s.balance);

  const handleModeChange = (mode: Fulfillment) => {
    setFulfillment(mode);
  };

  const outletDisplay = activeStore
    ? activeStore.name.replace("Burgonomics - ", "")
    : "Select Outlet";

  const locationSubtitle =
    fulfillment === "delivery"
      ? selectedAddress
        ? `${selectedAddress.customLabel || selectedAddress.label.toUpperCase()} • ${selectedAddress.line1}`
        : "Tap to set delivery location"
      : activeStore
        ? activeStore.address.split(",")[0]
        : "Ahmedabad, Gujarat";

  return (
    <header
      className={cn(
        "relative w-full bg-primary text-white pt-3 pb-6 px-4 rounded-b-3xl shadow-medium transition-all duration-300",
        className,
      )}
    >
      {/* Top Brand Bar */}
      <div className="flex items-center justify-between gap-2 mb-3">
        {/* Mascot + Brand Title */}
        <Link
          to="/home"
          className="flex items-center gap-2 focus:outline-none shrink-0"
          onClick={() => void HapticService.selection()}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white p-0.5 shadow-sm ring-2 ring-white/30 shrink-0">
            <img
              src="/burgonomics-logo.png"
              alt="Burgonomics Mascot"
              className="h-full w-full object-contain"
            />
          </div>
          <span className="font-display text-lg font-black tracking-tight text-white uppercase">
            BURGONOMICS
          </span>
        </Link>

        {/* Right action group: Loyalty Points + Notifications */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            to="/offers"
            aria-label="Loyalty Points"
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-bold text-amber-300 transition-colors shrink-0"
          >
            <Sparkles className="h-3 w-3 text-amber-300" />
            <span>{loyaltyBalance} pts</span>
          </Link>

          <Link
            to="/profile/notifications"
            aria-label="Notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/15 border border-white/25 hover:bg-white/25 transition-colors text-white shrink-0"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent ring-1.5 ring-primary" />
          </Link>
        </div>
      </div>

      {/* Outlet & Location Selector Pill */}
      <div className="mb-3.5">
        <Link
          to="/stores"
          onClick={() => void HapticService.selection()}
          className="flex items-center gap-2.5 rounded-full bg-white/15 border border-white/20 px-3.5 py-2 hover:bg-white/20 transition-all text-left backdrop-blur-xs shadow-xs active:scale-[0.99]"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-xs">
            <MapPin className="h-3.5 w-3.5 stroke-[2.5px]" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="font-sans text-xs font-black text-white truncate">
                {outletDisplay}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-white/80 shrink-0" />
            </div>
            <p className="text-[10px] text-white/80 font-medium truncate">
              {locationSubtitle}
            </p>
          </div>
        </Link>
      </div>

      {/* 3-Mode Fulfillment Segmented Switch */}
      <div className="mb-3.5">
        <ModeSegmentedSwitch
          value={fulfillment}
          onChange={handleModeChange}
        />
      </div>

      {/* Full-width Search Bar */}
      <div>
        <button
          type="button"
          onClick={() => {
            void HapticService.selection();
            if (onSearchClick) onSearchClick();
            else void navigate({ to: "/search" });
          }}
          className="flex w-full items-center gap-2.5 rounded-full bg-white px-4 py-2.5 text-left text-xs text-text-secondary shadow-md hover:shadow-lg transition-all active:scale-[0.99]"
        >
          <Search className="h-4 w-4 text-primary shrink-0 stroke-[2.5px]" />
          <span className="flex-1 truncate text-gray-500 font-medium">
            Search delicious burgers, combos, wraps...
          </span>
          <span className="flex h-4 w-4 items-center justify-center rounded-[3px] border border-emerald-600 p-[1px] shrink-0">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
          </span>
        </button>
      </div>
    </header>
  );
}
