import { useState, useEffect, useMemo } from "react";
import type { Order } from "@/features/orders";

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface PorterTrackingState {
  currentStage: 1 | 2 | 3 | 4;
  stageName: string;
  stageDescription: string;
  /** Minutes until order.estimatedAt — null when no estimate was provided. */
  etaMinutes: number | null;
  /** Real outlet coordinates — null when the order carries none. */
  storeLocation: GeoCoordinates | null;
  /** Real destination coordinates — null when the order carries none. */
  dropLocation: GeoCoordinates | null;
  riderLocation: GeoCoordinates | null;
  riderName?: string;
  riderPhone?: string;
  riderVehicleNumber?: string;
  partnerName: string;
  trackingUrl?: string;
  isTakeawayOrDineIn: boolean;
  isDelivered: boolean;
  isCancelled: boolean;
  isReconnecting: boolean;
}

/**
 * Real coordinates only — a non-finite / missing / stringy value yields null
 * so the UI can hide the map instead of pointing at an invented location.
 */
function toCoords(lat: unknown, lng: unknown): GeoCoordinates | null {
  if (!Number.isFinite(lat as number) || !Number.isFinite(lng as number)) return null;
  return { lat: lat as number, lng: lng as number };
}

/**
 * ETA is derived from the only real source: order.estimatedAt (written at
 * placement). No stage constants — an order without an estimate has no ETA.
 */
function minutesUntilEstimate(estimatedAt?: string): number | null {
  if (!estimatedAt) return null;
  const ts = Date.parse(estimatedAt);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round((ts - Date.now()) / 60_000));
}

/**
 * Derives normalized 4-stage tracking state from an Order model
 */
export function getTrackingStateFromOrder(order: Order | null): PorterTrackingState {
  // No fabricated coordinates: without real finite values these stay null and
  // the route renders "Live location unavailable" instead of a fake map.
  const storeLocation = toCoords(order?.store?.lat, order?.store?.lng);

  const isTakeaway = order?.fulfillment === "takeaway" || order?.fulfillment === "dinein";
  const statusCode = (order?.status?.code || "ORDER_PLACED").toUpperCase();

  const addressLat = (order?.address as any)?.lat ?? (order as any)?.deliveryAddress?.lat;
  const addressLng = (order?.address as any)?.lng ?? (order as any)?.deliveryAddress?.lng;
  const addressLocation = toCoords(addressLat, addressLng);
  // Takeaway / dine-in: the outlet IS the destination, so reuse the real
  // outlet coordinates rather than inventing a drop point.
  const dropLocation = addressLocation ?? (isTakeaway ? storeLocation : null);

  let stage: 1 | 2 | 3 | 4 = 1;
  let stageName = "Order Placed & Confirmed";
  let stageDescription = "Kitchen has acknowledged your meal and is queueing ingredients.";

  if (statusCode.includes("CANCEL")) {
    return {
      currentStage: 1,
      stageName: "Order Cancelled",
      stageDescription: "This order was cancelled. Refund reversal has been initiated.",
      // A cancelled order has nothing left to estimate.
      etaMinutes: null,
      storeLocation,
      dropLocation,
      riderLocation: null,
      partnerName: "Porter Express",
      isTakeawayOrDineIn: isTakeaway,
      isDelivered: false,
      isCancelled: true,
      isReconnecting: false,
    };
  }

  if (statusCode.includes("PREPAR") || statusCode.includes("KITCHEN") || statusCode.includes("BAK")) {
    stage = 2;
    stageName = "Freshly Grilling in Kitchen";
    stageDescription = "Chefs are assembling your fresh artisanal smash burgers.";
  } else if (statusCode.includes("DELIVERY") || statusCode.includes("DISPATCH") || statusCode.includes("TRANSIT") || statusCode.includes("READY")) {
    stage = 3;
    stageName = isTakeaway ? "Packed & Ready for Counter Pickup" : "Out for Delivery with Porter";
    stageDescription = isTakeaway
      ? "Your food is packed warm. Show your Order PIN at the counter."
      : "Porter 2-wheeler courier is en-route with your insulated food pack.";
  } else if (statusCode.includes("DELIVER") || statusCode.includes("COMPLETE") || statusCode.includes("PICKED_UP")) {
    stage = 4;
    stageName = isTakeaway ? "Collected at Counter" : "Delivered at Doorstep";
    stageDescription = "Meal successfully handed over. Enjoy your feast!";
  }

  // Rider coordinates — only when the backend actually provides live GPS.
  // No fabricated interpolation: when GPS is unavailable, riderLocation stays
  // null and the UI must show "live location unavailable" instead of a fake pin.
  const rawRiderLoc = (order as any)?.delivery?.riderLocation;
  const riderLocation: GeoCoordinates | null =
    stage === 3 &&
    !isTakeaway &&
    rawRiderLoc?.lat != null &&
    rawRiderLoc?.lng != null &&
    Number.isFinite(rawRiderLoc.lat) &&
    Number.isFinite(rawRiderLoc.lng)
      ? { lat: rawRiderLoc.lat, lng: rawRiderLoc.lng }
      : null;

  const deliveryObj = (order as any)?.delivery || order?.deliveryPartner;
  const isSelfDelivery = (order as any)?.delivery?.status === "manually_assigned";

  return {
    currentStage: stage,
    stageName,
    stageDescription,
    // ETA from order.estimatedAt only — no hardcoded stage countdowns.
    etaMinutes: minutesUntilEstimate(order?.estimatedAt),
    storeLocation,
    dropLocation,
    riderLocation,
    // Loop: no fabricated fallback rider — stage 3 with no assigned rider
    // must show "contact upon dispatch", never a fake name/phone/plate.
    riderName: deliveryObj?.name || deliveryObj?.riderName || (order as any)?.riderName || undefined,
    riderPhone: deliveryObj?.phone || deliveryObj?.riderPhone || (order as any)?.riderPhone || undefined,
    riderVehicleNumber: deliveryObj?.vehicleNumber || deliveryObj?.riderVehicleNumber || undefined,
    partnerName: isSelfDelivery ? "Burgonomics In-House Fleet" : "Porter Express 2-Wheeler",
    // Tracking URL only when the real backend provides one — never a
    // fabricated porter.in link derived from the order id.
    trackingUrl: (order as any)?.delivery?.trackingUrl || undefined,
    isTakeawayOrDineIn: isTakeaway,
    isDelivered: stage === 4,
    isCancelled: false,
    isReconnecting: false,
  };
}

export function usePorterLiveTracking(order: Order | null) {
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Monitor network online / offline
  useEffect(() => {
    const handleOnline = () => setIsReconnecting(false);
    const handleOffline = () => setIsReconnecting(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const trackingState = useMemo(() => {
    const s = getTrackingStateFromOrder(order);
    return { ...s, isReconnecting };
  }, [order, isReconnecting]);

  return trackingState;
}

export default usePorterLiveTracking;
