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
  etaMinutes: number;
  storeLocation: GeoCoordinates;
  dropLocation: GeoCoordinates;
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
 * Derives normalized 4-stage tracking state from an Order model
 */
export function getTrackingStateFromOrder(order: Order | null): PorterTrackingState {
  const defaultStore: GeoCoordinates = {
    lat: order?.store?.lat ?? 23.0131,
    lng: order?.store?.lng ?? 72.5085,
  };

  const defaultDrop: GeoCoordinates = {
    lat: (order?.address as any)?.lat ?? (order as any)?.deliveryAddress?.lat ?? 23.0338,
    lng: (order?.address as any)?.lng ?? (order as any)?.deliveryAddress?.lng ?? 72.5262,
  };

  const isTakeaway = order?.fulfillment === "takeaway" || order?.fulfillment === "dinein";
  const statusCode = (order?.status?.code || "ORDER_PLACED").toUpperCase();

  let stage: 1 | 2 | 3 | 4 = 1;
  let stageName = "Order Placed & Confirmed";
  let stageDescription = "Kitchen has acknowledged your meal and is queueing ingredients.";
  let eta = 25;

  if (statusCode.includes("CANCEL")) {
    return {
      currentStage: 1,
      stageName: "Order Cancelled",
      stageDescription: "This order was cancelled. Refund reversal has been initiated.",
      etaMinutes: 0,
      storeLocation: defaultStore,
      dropLocation: defaultDrop,
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
    eta = 18;
  } else if (statusCode.includes("DELIVERY") || statusCode.includes("DISPATCH") || statusCode.includes("TRANSIT") || statusCode.includes("READY")) {
    stage = 3;
    stageName = isTakeaway ? "Packed & Ready for Counter Pickup" : "Out for Delivery with Porter";
    stageDescription = isTakeaway
      ? "Your food is packed warm. Show your Order PIN at the counter."
      : "Porter 2-wheeler courier is en-route with your insulated food pack.";
    eta = isTakeaway ? 5 : 10;
  } else if (statusCode.includes("DELIVER") || statusCode.includes("COMPLETE") || statusCode.includes("PICKED_UP")) {
    stage = 4;
    stageName = isTakeaway ? "Collected at Counter" : "Delivered at Doorstep";
    stageDescription = "Meal successfully handed over. Enjoy your feast!";
    eta = 0;
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
    etaMinutes: eta,
    storeLocation: defaultStore,
    dropLocation: defaultDrop,
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
