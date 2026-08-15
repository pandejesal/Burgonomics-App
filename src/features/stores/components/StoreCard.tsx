import * as React from "react";
import {
  MapPin,
  Clock,
  Bike,
  Compass,
  Copy,
  Share2,
  Map,
  Check,
  Eye,
  Phone,
  Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
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
  const [copied, setCopied] = React.useState(false);
  const closingSoon = store.isOpen && closesSoon(store.hours.close);

  // Dynamic travel time calculation based on distance (avg speed 25 km/h + traffic buffer)
  const travelTimeMinutes = store.distanceKm
    ? Math.max(4, Math.ceil(store.distanceKm * 2.4) + 3)
    : undefined;

  // Delivery radius: defaults to 5.0 km for all kitchen stores
  const deliveryRadiusKm = 5.0;

  const label = `${store.name}, ${store.area}. ${
    store.isOpen ? `Open now, closes at ${store.hours.close}` : "Closed"
  }. Delivery in ${store.etaMinutes} minutes. ${formatDistance(store.distanceKm)} away.`;

  const handleOpenInMaps = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = getPermanentMapUrl(store.lat, store.lng);
    window.open(url, "_blank");
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    openDirections(store.name, store.lat, store.lng);
  };

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (store.phone) {
      window.open(`tel:${store.phone}`, "_blank");
    } else {
      toast.error("Phone number not available for this store");
    }
  };

  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(store.address);
      setCopied(true);
      toast.success("Address copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Could not copy address");
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
    <div
      className={cn(
        "w-full rounded-[var(--radius-large)] border bg-surface p-4 block float-interactive",
        selected
          ? "border-primary shadow-medium ring-1 ring-primary"
          : "border-divider hover:border-primary/40 shadow-low",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          void HapticService.impact("light");
          onSelect?.(store);
        }}
        aria-label={label}
        aria-pressed={selected || undefined}
        className="w-full text-left cursor-pointer active:scale-[0.97] active:opacity-80 transition-all duration-150 ease-out touch-manipulation select-none focus:outline-none"
        style={{ touchAction: "manipulation" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <Text as="h3" variant="titleLarge" className="truncate font-bold text-primary">
                {store.name}
              </Text>
              {selected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> Selected
                </span>
              )}
              {store.distanceKm !== undefined && (
                <Text
                  variant="caption"
                  tone="secondary"
                  className="whitespace-nowrap font-semibold text-accent"
                >
                  · {formatDistance(store.distanceKm)}
                </Text>
              )}
            </div>
            <div className="mt-1 flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden />
              <Text variant="bodyMedium" tone="secondary" className="line-clamp-2">
                {store.address}
              </Text>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {store.isOpen ? (
            <AppBadge tone="success" className="font-semibold">
              Open Now (closes {store.hours.close})
            </AppBadge>
          ) : (
            <AppBadge tone="neutral">Closed (opens {store.hours.open})</AppBadge>
          )}
          {closingSoon && <AppBadge tone="warning">Closes Soon</AppBadge>}
          {store.isBusy && <AppBadge tone="warning">Busy</AppBadge>}
          {store.isRecentlyOpened && <AppBadge tone="primary">New Kitchen</AppBadge>}
          <AppBadge tone="neutral" className="bg-bg-secondary text-text-secondary">
            Radius: {deliveryRadiusKm.toFixed(1)} km
          </AppBadge>
          {travelTimeMinutes !== undefined && (
            <AppBadge tone="neutral" className="bg-primary/5 text-primary border border-primary/20">
              🚗 ~{travelTimeMinutes} min travel
            </AppBadge>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-divider pt-3 text-xs text-text-secondary">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
            <Text variant="caption" tone="secondary" className="text-[11px]">
              {store.hours.open}–{store.hours.close}
            </Text>
          </div>
          {store.supports.delivery && (
            <div className="flex items-center gap-1">
              <Bike className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
              <Text variant="caption" tone="secondary" className="text-[11px]">
                Delivery ~{store.etaMinutes} min
              </Text>
            </div>
          )}
          <div className="ml-auto flex flex-wrap justify-end gap-1">
            {store.supports.delivery && (
              <AppBadge
                tone="neutral"
                className="px-1.5 py-0.5 text-[9px] font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
              >
                Delivery
              </AppBadge>
            )}
            {store.supports.takeaway && (
              <AppBadge
                tone="neutral"
                className="px-1.5 py-0.5 text-[9px] font-medium bg-indigo-500/10 text-indigo-700 border border-indigo-500/20"
              >
                Pickup
              </AppBadge>
            )}
            {store.supports.dineIn && (
              <AppBadge
                tone="neutral"
                className="px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/10 text-amber-700 border border-amber-500/20"
              >
                Dine-in
              </AppBadge>
            )}
          </div>
        </div>
      </button>

      {/* Map Action Tray */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-divider pt-3">
        <Text
          variant="caption"
          tone="secondary"
          className="text-[10px] uppercase tracking-wider font-semibold"
        >
          Maps & Actions
        </Text>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleOpenInMaps}
            title="Open in Maps"
            aria-label="Open store in default system maps application"
            className="flex h-8 items-center gap-1.5 rounded-full bg-bg-secondary px-2.5 text-[11px] font-medium text-text-secondary hover:bg-primary/10 hover:text-primary transition-all duration-150"
          >
            <Map className="h-3.5 w-3.5" />
            <span>Map</span>
          </button>
          <button
            type="button"
            onClick={handleNavigate}
            title="Get Directions"
            aria-label="Get turn-by-turn directions to store"
            className="flex h-8 items-center gap-1.5 rounded-full bg-bg-secondary px-2.5 text-[11px] font-medium text-text-secondary hover:bg-primary/10 hover:text-primary transition-all duration-150"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>Directions</span>
          </button>
          {store.phone ? (
            <button
              type="button"
              onClick={handleCall}
              title="Call Store"
              aria-label={`Call store at ${store.phone}`}
              className="flex h-8 items-center gap-1.5 rounded-full bg-bg-secondary px-2.5 text-[11px] font-medium text-text-secondary hover:bg-primary/10 hover:text-primary transition-all duration-150"
            >
              <Phone className="h-3.5 w-3.5" />
              <span>Call</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleCopyAddress}
            title="Copy Address"
            aria-label="Copy store physical address"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-secondary text-text-secondary hover:bg-primary/10 hover:text-primary transition-all duration-150"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={handleShare}
            title="Share Kitchen"
            aria-label="Share store details"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-secondary text-text-secondary hover:bg-primary/10 hover:text-primary transition-all duration-150"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
