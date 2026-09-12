import * as React from "react";
import { MapPin, CheckCircle2, AlertTriangle, Plus, ArrowRight, Home, Briefcase } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";
import type { Address } from "@/features/addresses/models";
import type { Store } from "@/features/stores/models/Store";

export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
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
  const maxRadiusKm = activeStore?.deliveryRadiusKm ?? 8.0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
          Delivery Address
        </h4>
        <Link
          to="/profile/addresses"
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Manage Addresses</span>
        </Link>
      </div>

      {addresses.length === 0 ? (
        <div className="p-4 rounded-2xl border border-divider bg-surface text-center space-y-2">
          <MapPin className="w-6 h-6 text-text-secondary mx-auto" />
          <p className="text-xs font-medium text-text-secondary">
            No saved delivery addresses found.
          </p>
          <Link
            to="/profile/addresses"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:bg-primary-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Delivery Address</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {addresses.map((addr) => {
            const isSelected = selectedAddress?.id === addr.id;
            
            // Calculate distance if coordinates exist, or estimate from store lat/lng
            const userLat = addr.lat ?? (activeStore ? activeStore.lat + 0.015 : 0);
            const userLng = addr.lng ?? (activeStore ? activeStore.lng + 0.015 : 0);
            const branchLat = activeStore?.lat ?? userLat;
            const branchLng = activeStore?.lng ?? userLng;
            
            const distanceKm = calculateHaversineKm(userLat, userLng, branchLat, branchLng);
            const isDeliverable = distanceKm <= maxRadiusKm;

            return (
              <div
                key={addr.id}
                onClick={() => {
                  void HapticService.selection();
                  onSelectAddress(addr);
                }}
                className={cn(
                  "p-3.5 sm:p-4 rounded-2xl border transition-all select-none cursor-pointer flex flex-col gap-2",
                  isSelected
                    ? isDeliverable
                      ? "border-[#0E4825] bg-[#0E4825]/5 shadow-xs"
                      : "border-amber-500 bg-amber-500/5 shadow-xs"
                    : "border-divider bg-surface hover:border-primary/40"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                        isSelected
                          ? "bg-[#0E4825] text-white"
                          : "bg-bg-secondary text-text-secondary"
                      )}
                    >
                      {addr.label === "home" ? (
                        <Home className="w-4 h-4" />
                      ) : addr.label === "work" ? (
                        <Briefcase className="w-4 h-4" />
                      ) : (
                        <MapPin className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-[#0E4825]/15 text-[#0E4825] dark:text-[#4ADE80] text-[10px] font-black uppercase">
                          {addr.customLabel || addr.label}
                        </span>
                        {addr.isDefault && (
                          <span className="text-[10px] text-text-secondary font-bold">
                            • Default
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-bold text-text truncate">
                        {addr.line1}
                      </p>
                      <p className="text-[11px] text-text-secondary truncate">
                        {addr.line2 || addr.landmark ? `${addr.line2 ? addr.line2 + ", " : ""}${addr.landmark || ""}` : `${addr.city} • ${addr.pincode}`}
                      </p>
                    </div>
                  </div>

                  {/* Radio / Selection Check */}
                  <div className="shrink-0 pt-0.5">
                    <span
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                        isSelected
                          ? "border-[#0E4825] bg-[#0E4825] text-white"
                          : "border-divider"
                      )}
                    >
                      {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                  </div>
                </div>

                {/* Geofence Distance & Radius Status */}
                <div className="pt-1.5 border-t border-divider/60 flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary font-medium">
                    📍 {distanceKm} km from {activeStore?.name ?? "outlet"}
                  </span>

                  {isDeliverable ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Deliverable</span>
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Out of {maxRadiusKm} km range</span>
                    </span>
                  )}
                </div>

                {/* Out of range alert banner with switch to takeaway CTA */}
                {isSelected && !isDeliverable && (
                  <div className="mt-1 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs space-y-1.5">
                    <p className="font-medium">
                      This address is {distanceKm} km away (exceeds our {maxRadiusKm} km delivery limit).
                    </p>
                    {onSwitchToTakeaway && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void HapticService.impact("medium");
                          onSwitchToTakeaway();
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 dark:text-amber-200 underline cursor-pointer"
                      >
                        <span>Switch to Takeaway (Self-Pickup)</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AddressSelector;
