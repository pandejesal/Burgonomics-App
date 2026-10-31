import React, { useMemo, useEffect, useState } from "react";
import {
  MapPin,
  Bike,
  Store,
  Navigation,
  ExternalLink,
  WifiOff,
} from "lucide-react";
import type { PorterTrackingState } from "../hooks/usePorterLiveTracking";
import { isSafeTrackingUrl } from "@/shared/utils/urlSafety";
import { getDirectionsUrl } from "@/features/stores/utils/navigation";

// Leaflet styles and components
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";

interface LiveOrderMapProps {
  tracking: PorterTrackingState;
  storeName?: string;
  customerAddressText?: string;
}

/** Real coordinates only — missing / non-finite values fail closed. */
function hasCoords(c: { lat: number; lng: number } | null): c is { lat: number; lng: number } {
  return c != null && Number.isFinite(c.lat) && Number.isFinite(c.lng);
}

// Custom Green Pin for Store
const storeMarkerHtml = `
  <div style="
    background-color: #0E4825;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 4px 10px rgba(14, 72, 37, 0.4);
    border: 2px solid white;
  ">
    <div style="width: 12px; height: 12px; background: #4ADE80; border-radius: 50%;"></div>
  </div>
`;

// Custom Orange Pin for Delivery Destination
const dropMarkerHtml = `
  <div style="
    background-color: #FF6600;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 4px 10px rgba(255, 102, 0, 0.4);
    border: 2px solid white;
  ">
    <div style="width: 12px; height: 12px; background: white; border-radius: 50%;"></div>
  </div>
`;

// Custom Cyan Pin for Live Courier
const riderMarkerHtml = `
  <div style="
    background-color: #06B6D4;
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    box-shadow: 0 4px 12px rgba(6, 182, 212, 0.5);
    border: 2px solid white;
    animation: pulse 2s infinite;
  ">
    <div style="width: 16px; height: 16px; background: white; border-radius: 50%;"></div>
  </div>
`;

const storeIcon = L.divIcon({
  html: storeMarkerHtml,
  className: "custom-leaflet-marker border-none bg-transparent",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

const dropIcon = L.divIcon({
  html: dropMarkerHtml,
  className: "custom-leaflet-marker border-none bg-transparent",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

const riderIcon = L.divIcon({
  html: riderMarkerHtml,
  className: "custom-leaflet-marker border-none bg-transparent",
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

function MapBoundsAdjuster({ points }: { points: [number, number][] }) {
  const map = useMap();
  // Coordinate-derived key: `points` is a fresh array on every parent render,
  // so depend on the coordinate values instead. Otherwise fitBounds/setView
  // would run on each unrelated re-render (e.g. a 1s countdown tick) and
  // reset the user's pan/zoom.
  const pointsKey = points.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(";");
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 16);
    } else if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [35, 35] });
    }
  }, [map, pointsKey]);
  return null;
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

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const safeTrackingUrl =
    trackingUrl && isSafeTrackingUrl(trackingUrl) ? trackingUrl : undefined;

  const hasRouteCoords = hasCoords(storeLocation) && hasCoords(dropLocation);
  const hasCourierDetails = Boolean(riderName || riderPhone || riderVehicleNumber);
  const courierUnconfirmed =
    currentStage === 3 && !isTakeawayOrDineIn && !hasCourierDetails;
  const hasRiderGps = riderLocation != null && hasCoords(riderLocation) && !isTakeawayOrDineIn;

  // Memoized geometry: recomputed only when the underlying location data
  // changes (storeLocation / dropLocation / riderLocation / fulfillment /
  // GPS availability), so re-renders from countdown ticks or live order
  // updates reuse the same array references instead of rebuilding them —
  // which in turn keeps MapBoundsAdjuster's fit effect from re-firing.
  const storeLatLng = useMemo<[number, number] | null>(
    () => (hasCoords(storeLocation) ? [storeLocation.lat, storeLocation.lng] : null),
    [storeLocation],
  );
  const dropLatLng = useMemo<[number, number] | null>(
    () => (hasCoords(dropLocation) ? [dropLocation.lat, dropLocation.lng] : null),
    [dropLocation],
  );
  const riderLatLng = useMemo<[number, number] | null>(
    () => (hasRiderGps && riderLocation ? [riderLocation.lat, riderLocation.lng] : null),
    [hasRiderGps, riderLocation],
  );
  const mapPoints = useMemo<[number, number][] | null>(() => {
    if (!storeLatLng || !dropLatLng) return null;
    if (isTakeawayOrDineIn) return [storeLatLng];
    return riderLatLng ? [storeLatLng, dropLatLng, riderLatLng] : [storeLatLng, dropLatLng];
  }, [isTakeawayOrDineIn, storeLatLng, dropLatLng, riderLatLng]);
  const mapCenter = useMemo<[number, number] | null>(() => {
    if (!storeLatLng || !dropLatLng) return null;
    if (isTakeawayOrDineIn) return storeLatLng;
    return [(storeLatLng[0] + dropLatLng[0]) / 2, (storeLatLng[1] + dropLatLng[1]) / 2];
  }, [isTakeawayOrDineIn, storeLatLng, dropLatLng]);

  // Directions URL: ORIGIN = the kitchen branch pickup coordinates,
  // DESTINATION = the customer's delivery address — the same direction the
  // store → drop polyline above is drawn, so the link and the map agree.
  // Takeaway / dine-in have no separate drop point (origin === destination
  // would be a degenerate route), so no origin is sent and Google Maps
  // starts from the device location with the outlet as the destination.
  const routeOrigin = !isTakeawayOrDineIn && hasCoords(storeLocation) ? storeLocation : null;
  const googleMapsUrl =
    hasRouteCoords && hasCoords(dropLocation)
      ? getDirectionsUrl(dropLocation.lat, dropLocation.lng, routeOrigin?.lat, routeOrigin?.lng)
      : null;

  // Fail closed: no real endpoint coordinates means no map at all (the
  // memoized geometry mirrors the same coordinates, so it fails closed too).
  if (
    !hasRouteCoords ||
    !storeLocation ||
    !dropLocation ||
    !storeLatLng ||
    !dropLatLng ||
    !mapPoints ||
    !mapCenter
  ) {
    return null;
  }

  return (
    <div className="relative rounded-3xl border border-divider bg-surface overflow-hidden shadow-xl">
      {/* Map Header Overlay */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface/90 backdrop-blur-md border border-divider text-[11px] font-bold text-text shadow-md">
          {hasRiderGps && (
            <span
              className="rider-pin w-2 h-2 rounded-full bg-emerald-400 animate-ping"
              data-testid="rider-pin"
            />
          )}
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

      {/* Real Interactive Leaflet Map */}
      <div className="w-full h-64 sm:h-72 relative" style={{ zIndex: 0 }}>
        {isClient ? (
          <MapContainer
            center={mapCenter}
            zoom={isTakeawayOrDineIn ? 16 : 14}
            zoomControl={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Store Pin */}
            <Marker position={storeLatLng} icon={storeIcon} />

            {/* Drop Pin (if delivery) */}
            {!isTakeawayOrDineIn && (
              <>
                <Marker position={dropLatLng} icon={dropIcon} />
                <Polyline
                  positions={[storeLatLng, dropLatLng]}
                  color="#FF6600"
                  weight={4}
                  dashArray="6, 8"
                  opacity={0.8}
                />
              </>
            )}

            {/* Courier Pin (if live GPS) */}
            {riderLatLng && (
              <Marker position={riderLatLng} icon={riderIcon} />
            )}

            <MapBoundsAdjuster points={mapPoints} />
          </MapContainer>
        ) : (
          <div className="w-full h-full bg-bg-secondary flex items-center justify-center text-xs text-text-secondary">
            Loading live map...
          </div>
        )}

        {/* Courier unconfirmed badge */}
        {courierUnconfirmed && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full bg-surface/90 backdrop-blur-md border border-divider text-[11px] font-bold text-text-secondary whitespace-nowrap shadow-md pointer-events-none">
            Out for delivery — courier details appear after dispatch
          </div>
        )}
      </div>

      {/* Map Action Bar Footer */}
      <div className="p-3 bg-surface border-t border-divider flex items-center justify-between text-xs">
        {googleMapsUrl ? (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-bold text-primary hover:text-primary-hover transition-colors"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Open in Google Maps</span>
          </a>
        ) : (
          <span className="text-[11px] text-text-secondary italic">Directions unavailable</span>
        )}

        {safeTrackingUrl && hasRiderGps && !isTakeawayOrDineIn && (
          <a
            href={safeTrackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-accent hover:text-accent-hover transition-colors"
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
