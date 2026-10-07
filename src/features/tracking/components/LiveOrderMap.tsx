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

/** Real coordinates only — missing / non-finite values fail closed. */
function hasCoords(c: { lat: number; lng: number } | null): c is { lat: number; lng: number } {
  return c != null && Number.isFinite(c.lat) && Number.isFinite(c.lng);
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
    riderName,
    riderPhone,
    riderVehicleNumber,
    currentStage,
    isTakeawayOrDineIn,
    trackingUrl,
    isReconnecting,
  } = tracking;

  // Loop 18/120: tracking URLs come from order docs (staff-entered values
  // included) — render only porter.in links, never arbitrary hrefs.
  const safeTrackingUrl =
    trackingUrl && isSafeTrackingUrl(trackingUrl) ? trackingUrl : undefined;

  // Route only renders on REAL finite coordinates — never on invented ones.
  const hasRouteCoords = hasCoords(storeLocation) && hasCoords(dropLocation);

  // A courier pin / GPS chip is only honest when the backend supplied live
  // rider GPS. Stage 3 can also arrive before dispatch names a rider.
  const hasCourierDetails = Boolean(riderName || riderPhone || riderVehicleNumber);
  const courierUnconfirmed =
    currentStage === 3 && !isTakeawayOrDineIn && !hasCourierDetails;
  const hasRiderGps = riderLocation != null && hasCoords(riderLocation) && !isTakeawayOrDineIn;

  // Normalized coordinate projection for SVG viewport (400x260)
  const mapCoords = useMemo(() => {
    // Map bounds encompassing store and drop
    const storeX = 70;
    const storeY = 190;
    const dropX = 330;
    const dropY = 60;

    // Rider position only when real GPS exists — no default pin at a fixed
    // percentage along the path.
    if (riderLocation && hasCoords(riderLocation) && storeLocation && dropLocation) {
      const latSpan = dropLocation.lat - storeLocation.lat || 0.01;
      const lngSpan = dropLocation.lng - storeLocation.lng || 0.01;
      const progress = Math.min(
        Math.max((riderLocation.lat - storeLocation.lat) / latSpan, 0.1),
        0.9
      );
      return {
        storeX,
        storeY,
        dropX,
        dropY,
        riderX: storeX + (dropX - storeX) * progress,
        riderY: storeY + (dropY - storeY) * progress,
      };
    }

    return { storeX, storeY, dropX, dropY, riderX: null, riderY: null };
  }, [storeLocation, dropLocation, riderLocation]);

  const riderPos =
    hasRiderGps && mapCoords.riderX != null && mapCoords.riderY != null
      ? { x: mapCoords.riderX, y: mapCoords.riderY }
      : null;

  // Directions link from real coordinates only; omitted otherwise.
  const googleMapsUrl =
    hasRouteCoords && storeLocation && dropLocation
      ? `https://www.google.com/maps/dir/?api=1&origin=${storeLocation.lat},${storeLocation.lng}&destination=${dropLocation.lat},${dropLocation.lng}`
      : null;

  // Defensive backstop — the route already hides the map without coordinates.
  if (!hasRouteCoords || !storeLocation || !dropLocation) return null;

  return (
    <div className="relative rounded-3xl border border-neutral-800 bg-[#080808] overflow-hidden shadow-xl">
      {/* Map Header Overlay */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        {/* Header chip: the "live GPS" label + pulsing dot only with real rider GPS */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-neutral-700 text-[11px] font-bold text-white shadow-md">
          {hasRiderGps && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
          <span>
            {hasRiderGps
              ? "Live Porter Courier GPS"
              : isTakeawayOrDineIn
                ? "Outlet Directions Map"
                : "Route overview"}
          </span>
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

          {/* Rider Pin — only when the backend supplied live rider GPS */}
          {riderPos && (
            <g
              data-testid="rider-pin"
              transform={`translate(${riderPos.x}, ${riderPos.y})`}
            >
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

        {/* 3. Rider Marker Tooltip — real GPS only */}
        {riderPos && (
          <div
            className="absolute z-10 -translate-x-1/2 -translate-y-full mb-1 pointer-events-none"
            style={{ left: `${(riderPos.x / 400) * 100}%`, top: `${(riderPos.y / 260) * 100}%` }}
          >
            <div className="px-2 py-1 rounded-lg bg-cyan-600 border border-white text-[10px] font-black text-white whitespace-nowrap shadow-lg flex items-center gap-1 animate-bounce">
              <Bike className="w-3.5 h-3.5" />
              <span>Porter En-Route</span>
            </div>
          </div>
        )}

        {/* 4. No assigned courier yet — honest caption instead of a courier claim */}
        {courierUnconfirmed && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-neutral-700 text-[11px] font-bold text-neutral-200 whitespace-nowrap shadow-md pointer-events-none">
            Out for delivery — courier details appear after dispatch
          </div>
        )}
      </div>

      {/* Map Action Bar Footer */}
      <div className="p-3 bg-neutral-900/90 border-t border-neutral-800 flex items-center justify-between text-xs">
        {/* Directions button only when both endpoints are real coordinates */}
        {googleMapsUrl ? (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Open in Google Maps</span>
          </a>
        ) : (
          <span className="text-[11px] text-neutral-500 italic">Directions unavailable</span>
        )}

        {safeTrackingUrl && riderPos && !isTakeawayOrDineIn && (
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
