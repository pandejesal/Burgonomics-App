import React, { useMemo } from "react";
import {
  MapPin,
  Bike,
  Store,
  Navigation,
  ExternalLink,
  WifiOff,
  Sparkles,
} from "lucide-react";
import type { PorterTrackingState } from "../hooks/usePorterLiveTracking";
import { isSafeTrackingUrl } from "@/shared/utils/urlSafety";

interface LiveOrderMapProps {
  tracking: PorterTrackingState;
  storeName?: string;
  customerAddressText?: string;
}

export function LiveOrderMap({
  tracking,
  storeName = "Burgonomics Outlet",
  customerAddressText = "Delivery Destination",
}: LiveOrderMapProps) {
  const {
    storeLocation,
    dropLocation,
    riderLocation,
    currentStage,
    isTakeawayOrDineIn,
    trackingUrl,
    isReconnecting,
  } = tracking;

  // Loop 18/120: tracking URLs come from order docs (staff-entered values
  // included) — render only porter.in links, never arbitrary hrefs.
  const safeTrackingUrl =
    trackingUrl && isSafeTrackingUrl(trackingUrl) ? trackingUrl : undefined;

  // Normalized coordinate projection for SVG viewport (400x260)
  const mapCoords = useMemo(() => {
    // Map bounds encompassing store, drop, and rider
    const storeX = 70;
    const storeY = 190;
    const dropX = 330;
    const dropY = 60;

    // Rider position interpolated or default to 60% along the path
    let riderX = storeX + (dropX - storeX) * 0.58;
    let riderY = storeY + (dropY - storeY) * 0.58;

    if (riderLocation && storeLocation && dropLocation) {
      const latSpan = dropLocation.lat - storeLocation.lat || 0.01;
      const lngSpan = dropLocation.lng - storeLocation.lng || 0.01;
      const progress = Math.min(
        Math.max((riderLocation.lat - storeLocation.lat) / latSpan, 0.1),
        0.9
      );
      riderX = storeX + (dropX - storeX) * progress;
      riderY = storeY + (dropY - storeY) * progress;
    }

    return { storeX, storeY, dropX, dropY, riderX, riderY };
  }, [storeLocation, dropLocation, riderLocation]);

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${storeLocation.lat},${storeLocation.lng}&destination=${dropLocation.lat},${dropLocation.lng}`;

  return (
    <div className="relative rounded-3xl border border-neutral-800 bg-[#080808] overflow-hidden shadow-xl">
      {/* Map Header Overlay */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-neutral-700 text-[11px] font-bold text-white shadow-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>{isTakeawayOrDineIn ? "Outlet Directions Map" : "Live Porter Courier GPS"}</span>
        </div>

        {isReconnecting && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950/90 border border-amber-500/60 text-amber-300 text-[11px] font-bold">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Reconnecting...</span>
          </div>
        )}
      </div>

      {/* SVG Canvas Map Graphic */}
      <div className="w-full h-64 sm:h-72 bg-[#0c120f] relative overflow-hidden">
        {/* Stylized Road Grid Background */}
        <svg
          viewBox="0 0 400 260"
          className="w-full h-full object-cover"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="routeGradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0E4825" />
              <stop offset="50%" stopColor="#FF6600" />
              <stop offset="100%" stopColor="#4ADE80" />
            </linearGradient>

            {/* Grid Pattern */}
            <pattern id="roadGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#14241b" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Grid background */}
          <rect width="400" height="260" fill="url(#roadGrid)" opacity="0.6" />

          {/* Secondary streets */}
          <path
            d="M 20 220 Q 180 200 380 140 M 100 20 Q 150 140 220 240 M 240 10 Q 280 100 370 200"
            fill="none"
            stroke="#1c3325"
            strokeWidth="3"
            strokeDasharray="6,4"
          />

          {/* Main Delivery Route Polyline */}
          <path
            d={`M ${mapCoords.storeX} ${mapCoords.storeY} Q 190 140 ${mapCoords.dropX} ${mapCoords.dropY}`}
            fill="none"
            stroke="url(#routeGradient)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Flowing animated dash layer */}
          <path
            d={`M ${mapCoords.storeX} ${mapCoords.storeY} Q 190 140 ${mapCoords.dropX} ${mapCoords.dropY}`}
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeDasharray="6,8"
            className="animate-pulse"
            opacity="0.8"
          />

          {/* Store Pin */}
          <g transform={`translate(${mapCoords.storeX}, ${mapCoords.storeY})`}>
            <circle r="16" fill="#0E4825" stroke="#4ADE80" strokeWidth="2" />
            <circle r="24" fill="#0E4825" opacity="0.2" className="animate-ping" />
          </g>

          {/* Drop Pin */}
          <g transform={`translate(${mapCoords.dropX}, ${mapCoords.dropY})`}>
            <circle r="16" fill="#FF6600" stroke="#FFFFFF" strokeWidth="2" />
            <circle r="22" fill="#FF6600" opacity="0.25" className="animate-pulse" />
          </g>

          {/* Rider Pin (if stage 3) */}
          {currentStage === 3 && !isTakeawayOrDineIn && (
            <g transform={`translate(${mapCoords.riderX}, ${mapCoords.riderY})`}>
              <circle r="18" fill="#06B6D4" stroke="#FFFFFF" strokeWidth="2" />
              <circle r="28" fill="#06B6D4" opacity="0.3" className="animate-ping" />
            </g>
          )}
        </svg>

        {/* HTML Markers Positioned over SVG Canvas */}
        {/* 1. Store Marker Tooltip */}
        <div
          className="absolute z-10 -translate-x-1/2 -translate-y-full mb-1 pointer-events-none"
          style={{ left: `${(mapCoords.storeX / 400) * 100}%`, top: `${(mapCoords.storeY / 260) * 100}%` }}
        >
          <div className="px-2 py-1 rounded-lg bg-[#0E4825] border border-emerald-500 text-[10px] font-black text-white whitespace-nowrap shadow-lg flex items-center gap-1">
            <Store className="w-3 h-3 text-emerald-300" />
            <span>{storeName}</span>
          </div>
        </div>

        {/* 2. Destination Marker Tooltip */}
        <div
          className="absolute z-10 -translate-x-1/2 -translate-y-full mb-1 pointer-events-none"
          style={{ left: `${(mapCoords.dropX / 400) * 100}%`, top: `${(mapCoords.dropY / 260) * 100}%` }}
        >
          <div className="px-2 py-1 rounded-lg bg-[#FF6600] border border-white/40 text-[10px] font-black text-white whitespace-nowrap shadow-lg flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span className="truncate max-w-[120px]">{customerAddressText}</span>
          </div>
        </div>

        {/* 3. Rider Marker Tooltip */}
        {currentStage === 3 && !isTakeawayOrDineIn && (
          <div
            className="absolute z-10 -translate-x-1/2 -translate-y-full mb-1 pointer-events-none"
            style={{ left: `${(mapCoords.riderX / 400) * 100}%`, top: `${(mapCoords.riderY / 260) * 100}%` }}
          >
            <div className="px-2 py-1 rounded-lg bg-cyan-600 border border-white text-[10px] font-black text-white whitespace-nowrap shadow-lg flex items-center gap-1 animate-bounce">
              <Bike className="w-3.5 h-3.5" />
              <span>Porter En-Route</span>
            </div>
          </div>
        )}
      </div>

      {/* Map Action Bar Footer */}
      <div className="p-3 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-between text-xs">
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Open in Google Maps</span>
        </a>

        {safeTrackingUrl && !isTakeawayOrDineIn && (
          <a
            href={safeTrackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-orange-400 hover:text-orange-300 transition-colors"
          >
            <span>Porter Live Radar</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export default LiveOrderMap;
