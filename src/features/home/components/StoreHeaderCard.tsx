import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import type { Fulfillment, Store } from "@/features/stores/models/Store";

interface Props {
  store: Store;
  fulfillment?: Fulfillment | null;
  className?: string;
}

const LABEL: Record<Fulfillment, string> = {
  delivery: "Delivering from",
  takeaway: "Pickup from",
  dinein: "Dine-in at",
};

/**
 * Compact store card shown at the top of Home. The label above the
 * store name reflects the active fulfillment method so the user always
 * sees how their order will be handled. Tapping opens Store Selection.
 */
export function StoreHeaderCard({ store, fulfillment, className }: Props) {
  const short = store.address.split(",").slice(0, 2).join(",").trim();
  const label = fulfillment ? LABEL[fulfillment] : "Ordering from";
  return (
    <Link
      to="/stores"
      aria-label={`${label} ${store.name}, ${short}. Tap to change store.`}
      className={cn(
        "group block w-full rounded-[var(--radius-large)] border border-divider bg-surface shadow-[var(--shadow-low)]",
        "px-4 py-3 hover:border-primary/40 transition-colors",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <MapPin className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text variant="caption" tone="secondary" className="uppercase tracking-wide shrink-0">
              {label}
            </Text>
            <AppBadge tone={store.isOpen ? "success" : "error"}>
              {store.isOpen ? "Open" : "Closed"}
            </AppBadge>
            <AppBadge tone="success">100% Pure Veg</AppBadge>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
            <Text variant="titleMedium" className="truncate">
              {store.name}
            </Text>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-hover:translate-y-0.5"
              aria-hidden
            />
          </div>
          <Text variant="bodyMedium" tone="secondary" className="truncate">
            {short}
          </Text>
          {fulfillment !== "dinein" && (
            <div className="mt-1 inline-flex items-center gap-1 text-text-secondary">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              <span className="type-caption">
                {store.isOpen
                  ? fulfillment === "takeaway"
                    ? `Ready in ${store.pickupEtaMinutes ?? Math.max(8, Math.floor(store.etaMinutes / 2))} min`
                    : `${store.etaMinutes} min delivery`
                  : `Opens at ${store.hours.open}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
