import * as React from "react";
import { MapPin, Navigation, Compass, Store as StoreIcon, Phone, Clock } from "lucide-react";
import type { Store } from "../models/Store";
import { cn } from "@/lib/utils";
import { openDirections } from "../utils/navigation";

interface StoreMapViewerProps {
  stores: Store[];
  selectedStore: Store | null;
  onSelectStore: (store: Store) => void;
  className?: string;
}

export function StoreMapViewer({
  stores,
  selectedStore,
  onSelectStore,
  className,
}: StoreMapViewerProps) {
  const active = selectedStore || stores[0];

  return (
    <div
      className={cn(
        "relative w-full rounded-2xl overflow-hidden border border-border bg-[#0A0A0A] shadow-lg flex flex-col justify-between",
        className
      )}
      style={{ minHeight: "260px" }}
    >
      {/* Map Header Overlay */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 bg-[#0A0A0A]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[11px] font-bold text-white shadow-md pointer-events-auto">
          <Compass className="w-3.5 h-3.5 text-[#4ADE80] animate-spin-slow" />
          <span>Interactive Kitchen Radar</span>
        </div>

        {active && (
          <button
            type="button"
            onClick={() => openDirections(active.name, active.lat, active.lng)}
            className="flex items-center gap-1 bg-[#FF6600] hover:bg-[#e05a00] text-white px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-md transition-transform active:scale-95 pointer-events-auto cursor-pointer"
          >
            <Navigation className="w-3 h-3" />
            <span>Navigate</span>
          </button>
        )}
      </div>

      {/* Styled Grid Canvas Map Background */}
      <div className="relative w-full h-48 bg-gradient-to-br from-[#0A1A0F] via-[#0A0A0A] to-[#112415] flex items-center justify-center overflow-hidden">
        {/* Abstract Coordinate Grid lines */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(#4ADE80 1px, transparent 1px), radial-gradient(#FF6600 1px, transparent 1px)`,
            backgroundSize: `24px 24px`,
            backgroundPosition: `0 0, 12px 12px`,
          }}
        />

        {/* Dynamic Store Radar Pins */}
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-4 p-4">
          {stores.map((s, idx) => {
            const isSelected = active?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStore(s)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 rounded-xl transition-all cursor-pointer",
                  isSelected
                    ? "bg-[#0E4825] border-2 border-[#4ADE80] text-white shadow-xl scale-105"
                    : "bg-[#112415]/90 border border-[#1E3A24] text-zinc-300 hover:border-[#4ADE80]/50 hover:text-white"
                )}
              >
                <div
                  className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center transition-colors",
                    isSelected ? "bg-[#FF6600] text-white" : "bg-[#0A0A0A] text-[#4ADE80]"
                  )}
                >
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold leading-tight line-clamp-1">{s.name}</div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    {s.distanceKm ? `${s.distanceKm} km away` : s.city}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Store Quick Strip */}
      {active && (
        <div className="p-3 bg-[#112415] border-t border-[#1E3A24] flex items-center justify-between text-xs text-zinc-300">
          <div className="flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-[#4ADE80]" />
            <span className="font-bold text-white line-clamp-1">{active.address}</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#4ADE80]">
            <Clock className="w-3 h-3" />
            <span>{active.hours.open} - {active.hours.close}</span>
          </div>
        </div>
      )}
    </div>
  );
}
