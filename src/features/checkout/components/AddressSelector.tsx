import * as React from "react";
import {
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowRight,
  Home,
  Briefcase,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import type { Address } from "@/features/addresses/models";
import type { Store } from "@/features/stores/models/Store";
import { DEFAULT_DELIVERY_RADIUS_KM } from "@/features/stores/utils/serviceArea";

export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

interface AddressSelectorProps {
  addresses: Address[];
  selectedAddress: Address | null;
  activeStore: Store | null;
  onSelectAddress: (addr: Address) => void;
  onSwitchToTakeaway?: () => void;
  className?: string;
}

export function AddressSelector({
  addresses,
  selectedAddress,
  activeStore,
  onSelectAddress,
  onSwitchToTakeaway,
  className,
}: AddressSelectorProps) {
  const maxRadiusKm = activeStore?.deliveryRadiusKm ?? DEFAULT_DELIVERY_RADIUS_KM;
  // Doc-stated radius — display sites may only show a number that the store
  // actually declared; the fallback above is for logic comparisons alone.
  const docRadiusKm = activeStore?.deliveryRadiusKm;

  const selectAddress = (addr: Address) => {
    void HapticService.selection();
    onSelectAddress(addr);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="type-title-medium text-text-primary">Delivery Address</h4>
        <Link
          to="/profile/addresses"
          className="-mr-2 inline-flex min-h-[44px] items-center gap-1 px-2 type-caption font-semibold text-primary-text hover:underline"
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span>Manage Addresses</span>
        </Link>
      </div>

      {addresses.length === 0 ? (
        <div className="space-y-3 rounded-[var(--radius-large)] border border-divider bg-surface p-4 text-center">
          <MapPin className="mx-auto h-6 w-6 text-text-secondary" aria-hidden />
          <p className="type-body-medium text-text-secondary">No saved delivery addresses found.</p>
          <Link
            to="/addresses/create"
            search={{ returnTo: "/checkout" }}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-primary px-4 type-button-sm text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span>Add Delivery Address</span>
          </Link>
        </div>
      ) : (
        <div role="radiogroup" aria-label="Delivery addresses" className="space-y-2.5">
          {addresses.map((addr) => {
            const isSelected = selectedAddress?.id === addr.id;

            // Honest deliverability: never synthesize a user position from the
            // store position. Without verified lat/lng on BOTH ends the
            // distance is unknown — no figure, neither badge.
            const storeLat = activeStore ? Number(activeStore.lat) : NaN;
            const storeLng = activeStore ? Number(activeStore.lng) : NaN;
            const hasVerifiedLocation =
              Number.isFinite(addr.lat) &&
              Number.isFinite(addr.lng) &&
              Number.isFinite(storeLat) &&
              Number.isFinite(storeLng);
            const distanceKm = hasVerifiedLocation
              ? calculateHaversineKm(addr.lat as number, addr.lng as number, storeLat, storeLng)
              : null;
            const isDeliverable: boolean | null =
              distanceKm === null ? null : distanceKm <= maxRadiusKm;

            return (
              <div
                key={addr.id}
                className={cn(
                  "flex flex-col gap-3 rounded-[var(--radius-large)] border p-4 transition-colors",
                  isSelected
                    ? isDeliverable === false
                      ? "border-warning bg-warning/5 shadow-xs"
                      : "border-primary bg-primary/5 shadow-xs"
                    : "border-divider bg-surface hover:border-primary/50",
                )}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => selectAddress(addr)}
                  className="flex min-h-11 w-full cursor-pointer flex-wrap items-start justify-between gap-2 rounded-[var(--radius-medium)] text-left"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <div
                      className={cn(
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-medium)]",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-bg-secondary text-text-secondary",
                      )}
                    >
                      {addr.label === "home" ? (
                        <Home className="h-4 w-4" aria-hidden />
                      ) : addr.label === "work" ? (
                        <Briefcase className="h-4 w-4" aria-hidden />
                      ) : (
                        <MapPin className="h-4 w-4" aria-hidden />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 type-caption font-semibold text-primary-text">
                          {addr.customLabel || addr.label}
                        </span>
                        {addr.isDefault && (
                          <span className="type-caption font-medium text-text-secondary">
                            • Default
                          </span>
                        )}
                      </div>

                      <p className="type-body font-semibold text-text-primary break-words">
                        {addr.line1}
                      </p>
                      <p className="type-caption text-text-secondary break-words">
                        {addr.line2 || addr.landmark
                          ? `${addr.line2 ? addr.line2 + ", " : ""}${addr.landmark || ""}`
                          : `${addr.city} • ${addr.pincode}`}
                      </p>
                    </div>
                  </div>

                  {/* Radio / Selection Check */}
                  <div className="shrink-0 pt-1">
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-text-secondary/60",
                      )}
                    >
                      {isSelected && (
                        <span className="h-2 w-2 rounded-full bg-primary-foreground" />
                      )}
                    </span>
                  </div>
                </button>

                {/* Geofence Distance & Radius Status */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-divider pt-2 type-caption">
                  {distanceKm !== null ? (
                    <>
                      <span className="min-w-0 break-words font-medium text-text-secondary">
                        📍 {distanceKm} km from {activeStore?.name ?? "outlet"}
                      </span>

                      {isDeliverable ? (
                        <span className="flex items-center gap-1 font-semibold text-success">
                          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                          <span>Deliverable</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-warning">
                          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                          <span>
                            {docRadiusKm != null
                              ? `Out of ${docRadiusKm} km range`
                              : "Out of delivery range"}
                          </span>
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 break-words font-medium text-text-secondary">
                        Location not verified — add a pin
                      </span>
                      <Link
                        to="/addresses/create"
                        search={{ editId: addr.id, returnTo: "/checkout" }}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex min-h-[44px] items-center font-semibold text-primary-text hover:underline"
                      >
                        Pin on map
                      </Link>
                    </>
                  )}
                </div>

                {/* Out of range alert banner with switch to takeaway CTA */}
                {isSelected && isDeliverable === false && distanceKm !== null && (
                  <div className="space-y-1.5 rounded-[var(--radius-medium)] border border-warning/30 bg-warning/10 p-3 type-caption text-warning">
                    <p className="break-words font-medium">
                      This address is {distanceKm} km away (exceeds our{" "}
                      {docRadiusKm != null ? `${docRadiusKm} km ` : ""}delivery limit).
                    </p>
                    {onSwitchToTakeaway && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void HapticService.impact("medium");
                          onSwitchToTakeaway();
                        }}
                        className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 font-semibold text-warning underline"
                      >
                        <span>Switch to Takeaway (Self-Pickup)</span>
                        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-1">
            <Link
              to="/addresses/create"
              search={{ returnTo: "/checkout" }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--radius-medium)] border border-dashed border-primary/40 bg-primary/5 px-4 type-button-sm text-primary transition-colors hover:bg-primary/10 cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span>Add Delivery Address</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default AddressSelector;
