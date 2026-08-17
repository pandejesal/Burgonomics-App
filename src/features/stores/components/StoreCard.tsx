import * as React from "react";
import {
  MapPin,
  Clock,
  Bike,
  Copy,
  Share2,
  Map,
  Check,
  Phone,
  Navigation,
  Info,
  ChevronRight,
  Store as StoreIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import type { Store } from "@/features/stores/models/Store";
import { closesSoon, formatDistance } from "@/features/stores/utils/distance";
import { getPermanentMapUrl, openDirections } from "@/features/stores/utils/navigation";
import { toast } from "sonner";
import { HapticService } from "@/core/services/haptics";

interface StoreCardProps {
  store: Store;
  selected?: boolean;
  onSelect?: (store: Store) => void;
  className?: string;
}

export function StoreCard({ store, selected, onSelect, className }: StoreCardProps) {
  const [showDetail, setShowDetail] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const closingSoon = store.isOpen && closesSoon(store.hours.close);

  // Dynamic travel time calculation based on distance (avg speed 25 km/h + traffic buffer)
  const travelTimeMinutes = store.distanceKm
    ? Math.max(4, Math.ceil(store.distanceKm * 2.4) + 3)
    : undefined;

  const deliveryRadiusKm = 5.0;

  const label = `${store.name}, ${store.area}. ${
    store.isOpen ? `Open now, closes at ${store.hours.close}` : "Closed"
  }. Delivery in ${store.etaMinutes} minutes. ${formatDistance(store.distanceKm)} away.`;

  const handleOpenInMaps = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const url = getPermanentMapUrl(store.lat, store.lng);
    window.open(url, "_blank");
  };

  const handleNavigate = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    openDirections(store.name, store.lat, store.lng);
  };

  const handleCall = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (store.phone) {
      window.open(`tel:${store.phone}`, "_blank");
    } else {
      toast.error("Phone number not available for this store");
    }
  };

  const handleCopyAddress = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(store.address);
      setCopied(true);
      toast.success("Address copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Could not copy address");
    }
  };

  const handleShare = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const shareText = `Burgonomics Kitchen - ${store.name}\n📍 ${store.address}\n📞 Phone: ${store.phone}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Burgonomics ${store.name}`,
          text: shareText,
          url: window.location.origin,
        });
      } catch (err) {
        // Ignored cancellation
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${window.location.origin}`);
        toast.success("Details copied to clipboard to share!");
      } catch (err) {
        toast.error("Could not copy details");
      }
    }
  };

  return (
    <>
      <div
        className={cn(
          "w-full rounded-[var(--radius-medium)] border bg-surface transition-all duration-150 relative overflow-hidden",
          selected
            ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
            : "border-divider hover:border-primary/40 hover:bg-bg-secondary/40 shadow-none",
          className,
        )}
      >
        <div className="flex items-center justify-between p-3 gap-3">
          {/* Main Tappable Row Area */}
          <button
            type="button"
            onClick={() => {
              void HapticService.impact("light");
              onSelect?.(store);
            }}
            aria-label={label}
            aria-pressed={selected || undefined}
            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer focus:outline-none select-none active:opacity-80"
          >
            {/* 48px Circular Store Initial / Icon */}
            <div className="h-12 w-12 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg shadow-sm">
              {store.name.charAt(0) || "🍔"}
            </div>

            {/* 2-line Content */}
            <div className="min-w-0 flex-1">
              {/* Line 1: Store Name + Open/Closed status */}
              <div className="flex items-center gap-2 min-w-0">
                <Text
                  as="h3"
                  variant="titleMedium"
                  className={cn("truncate font-bold text-text-primary", selected && "text-primary")}
                >
                  {store.name}
                </Text>
                <AppBadge
                  tone={store.isOpen ? "success" : "neutral"}
                  className="text-[10px] px-1.5 py-0 shrink-0 font-semibold"
                >
                  {store.isOpen ? (closingSoon ? "Closes Soon" : "Open") : "Closed"}
                </AppBadge>
                {selected && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0 text-[10px] font-bold text-emerald-700 shrink-0">
                    <Check className="h-3 w-3" /> Selected
                  </span>
                )}
              </div>

              {/* Line 2: Area · Distance · Delivery in N min */}
              <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-text-secondary text-xs truncate">
                <span className="truncate">{store.area}</span>
                {store.distanceKm !== undefined && (
                  <>
                    <span>·</span>
                    <span className="font-semibold text-accent whitespace-nowrap">
                      {formatDistance(store.distanceKm)}
                    </span>
                  </>
                )}
                {store.supports.delivery && (
                  <>
                    <span>·</span>
                    <span className="whitespace-nowrap text-text-secondary">
                      Delivery in {store.etaMinutes} min
                    </span>
                  </>
                )}
              </div>
            </div>
          </button>

          {/* Right-side Actions: Info button & Chevron */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void HapticService.impact("light");
                setShowDetail(true);
              }}
              title="Store info & actions"
              aria-label={`View info and actions for ${store.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-bg-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                void HapticService.impact("light");
                onSelect?.(store);
              }}
              aria-hidden="true"
              tabIndex={-1}
              className="flex h-9 w-6 items-center justify-center text-text-secondary/60 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Store Detail Bottom Sheet */}
      <BottomSheet
        open={showDetail}
        onOpenChange={setShowDetail}
        title={store.name}
        description={store.area}
      >
        <div className="space-y-4 pt-1 pb-4">
          {/* Address info */}
          <div className="rounded-[var(--radius-medium)] bg-bg-secondary p-3.5 flex items-start gap-3">
            <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <Text variant="caption" tone="secondary" className="font-medium">
                Store Address
              </Text>
              <Text variant="bodyMedium" className="mt-0.5 text-text-primary">
                {store.address}
              </Text>
            </div>
          </div>

          {/* Timing & Fulfillment badges */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[var(--radius-medium)] border border-divider p-3">
              <div className="flex items-center gap-1.5 text-text-secondary text-xs">
                <Clock className="h-3.5 w-3.5" />
                <span>Operating Hours</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                {store.hours.open} – {store.hours.close}
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {store.isOpen ? (closingSoon ? "Closing soon" : "Open now") : "Currently closed"}
              </p>
            </div>

            <div className="rounded-[var(--radius-medium)] border border-divider p-3">
              <div className="flex items-center gap-1.5 text-text-secondary text-xs">
                <Bike className="h-3.5 w-3.5" />
                <span>Delivery Details</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-text-primary">
                ~{store.etaMinutes} mins
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Radius: {deliveryRadiusKm.toFixed(1)} km{" "}
                {store.distanceKm ? `(${formatDistance(store.distanceKm)} away)` : ""}
              </p>
            </div>
          </div>

          {/* Fulfillment options */}
          <div className="flex flex-wrap gap-1.5">
            {store.supports.delivery && (
              <AppBadge tone="success" className="px-2 py-0.5 text-xs font-semibold">
                ✓ Delivery Available
              </AppBadge>
            )}
            {store.supports.takeaway && (
              <AppBadge tone="primary" className="px-2 py-0.5 text-xs font-semibold">
                ✓ Takeaway Available
              </AppBadge>
            )}
            {store.supports.dineIn && (
              <AppBadge tone="neutral" className="px-2 py-0.5 text-xs font-semibold">
                ✓ Dine-in Available
              </AppBadge>
            )}
            {travelTimeMinutes !== undefined && (
              <AppBadge tone="neutral" className="px-2 py-0.5 text-xs">
                🚗 ~{travelTimeMinutes} min drive
              </AppBadge>
            )}
          </div>

          {/* Quick Actions Grid */}
          <div className="pt-2 border-t border-divider">
            <Text
              variant="caption"
              tone="secondary"
              className="mb-2 uppercase tracking-wider font-semibold text-[10px]"
            >
              Store Actions
            </Text>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleOpenInMaps}
                className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-medium)] bg-bg-secondary p-3 text-xs font-medium text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              >
                <Map className="h-4 w-4" />
                <span>Open Map</span>
              </button>
              <button
                type="button"
                onClick={handleNavigate}
                className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-medium)] bg-bg-secondary p-3 text-xs font-medium text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              >
                <Navigation className="h-4 w-4" />
                <span>Directions</span>
              </button>
              {store.phone ? (
                <button
                  type="button"
                  onClick={handleCall}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-medium)] bg-bg-secondary p-3 text-xs font-medium text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                >
                  <Phone className="h-4 w-4" />
                  <span>Call Store</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-medium)] bg-bg-secondary p-3 text-xs font-medium text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span>{copied ? "Copied" : "Copy Addr"}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={handleCopyAddress}
                className="flex items-center justify-center gap-2 rounded-[var(--radius-medium)] border border-divider p-2.5 text-xs font-medium text-text-secondary hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copied ? "Address Copied!" : "Copy Full Address"}</span>
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex items-center justify-center gap-2 rounded-[var(--radius-medium)] border border-divider p-2.5 text-xs font-medium text-text-secondary hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share Details</span>
              </button>
            </div>
          </div>

          {/* Select this store button */}
          <button
            type="button"
            onClick={() => {
              setShowDetail(false);
              void HapticService.impact("light");
              onSelect?.(store);
            }}
            className="w-full mt-2 py-3 px-4 rounded-[var(--radius-medium)] bg-primary text-white font-bold text-sm shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Select This Kitchen
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
