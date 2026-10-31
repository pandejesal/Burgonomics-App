import { useState, useEffect, useMemo } from "react";
import type { Order } from "@/features/orders";
import { useStoreSelection } from "@/features/stores/state/storeStore";

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
  let storeLocation = toCoords(order?.store?.lat, order?.store?.lng);
  // Outlet identified but not coordinate-snapshotted at placement: resolve it
  // from the already-loaded outlet registry. Real registry entries only — an
  // unknown id still yields null (no invented pin).
  if (!storeLocation) {
    const storeId = order?.store?.id || (order as any)?.branchId || (order as any)?.storeId;
    if (storeId) {
      try {
        const matched = useStoreSelection
          .getState()
          .stores.find((s) => s.id === storeId || s.partnerBranchId === storeId);
        if (matched && Number.isFinite(matched.lat) && Number.isFinite(matched.lng)) {
          storeLocation = { lat: matched.lat, lng: matched.lng };
        }
      } catch {
        // Store registry unavailable (SSR / test harness) — keep null.
      }
    }
  }

  const isTakeaway = order?.fulfillment === "takeaway" || order?.fulfillment === "dinein";
  const statusCode = (order?.status?.code || "ORDER_PLACED").toUpperCase();
  const statusKind = order?.status?.kind;
  // The counter reference is whatever the outlet actually identifies orders
  // by — a backend order number or the short code already shown in the
  // header. There is no PIN/OTP field anywhere in the order model; copy must
  // never invent one.
  const orderReference =
    (order as (Order & { orderNumber?: string }) | null)?.orderNumber ?? order?.shortCode ?? null;
  // Refund claims are only made when the SERVER wrote a refunded payment
  // marker — the client initiates no refund anywhere.
  const serverRefunded = order?.payment?.status === "refunded";

  const addressLat = (order?.address as any)?.lat ?? (order as any)?.deliveryAddress?.lat;
  const addressLng = (order?.address as any)?.lng ?? (order as any)?.deliveryAddress?.lng;
  const addressLocation = toCoords(addressLat, addressLng);
  // Takeaway / dine-in: the outlet IS the destination, so reuse the real
  // outlet coordinates rather than inventing a drop point.
  const dropLocation = addressLocation ?? (isTakeaway ? storeLocation : null);

  let stage: 1 | 2 | 3 | 4 = 1;
  let stageName = "Order Placed & Confirmed";
  let stageDescription = "Kitchen has acknowledged your meal and is queueing ingredients.";

  if (statusKind === "cancelled" || statusCode.includes("CANCEL")) {
    return {
      currentStage: 1,
      stageName: "Order Cancelled",
      stageDescription: serverRefunded
        ? "This order was cancelled. Your refund has been initiated."
        : "This order was cancelled.",
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

  if (statusKind === "failed" || statusCode.includes("FAIL")) {
    // A FAILED order is terminal and non-progressing — it previously fell
    // through to the stage-1 "Order Placed & Confirmed / queueing ingredients"
    // state with a bouncing active step, promising preparation that ended.
    return {
      currentStage: 1,
      stageName: "Order Failed",
      stageDescription: "This order could not be completed. Contact support if you need help.",
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

  if (
    statusCode.includes("PREPAR") ||
    statusCode.includes("KITCHEN") ||
    statusCode.includes("BAK")
  ) {
    stage = 2;
    stageName = "Freshly Grilling in Kitchen";
    stageDescription = "Chefs are assembling your fresh artisanal smash burgers.";
  } else if (
    statusCode.includes("DELIVERY") ||
    statusCode.includes("DISPATCH") ||
    statusCode.includes("TRANSIT") ||
    statusCode.includes("READY")
  ) {
    stage = 3;
    stageName = isTakeaway ? "Packed & Ready for Counter Pickup" : "Out for Delivery with Porter";
    stageDescription = isTakeaway
      ? orderReference
        ? `Your food is packed warm. Show order reference #${orderReference} at the counter.`
        : "Your food is packed warm. Show this screen's order reference at the counter."
      : "Porter 2-wheeler courier is en-route with your insulated food pack.";
  } else if (
    statusCode.includes("DELIVER") ||
    statusCode.includes("COMPLETE") ||
    statusCode.includes("PICKED_UP")
  ) {
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
    riderName:
      deliveryObj?.name || deliveryObj?.riderName || (order as any)?.riderName || undefined,
    riderPhone:
      deliveryObj?.phone || deliveryObj?.riderPhone || (order as any)?.riderPhone || undefined,
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
  // The outlet-registry fallback inside getTrackingStateFromOrder reads
  // useStoreSelection.getState().stores — tracking its identity lets a
  // transient null (registry not loaded yet) recompute into real coords.
  const stores = useStoreSelection((s) => s.stores);

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
  }, [order, isReconnecting, stores]);

  return trackingState;
}

export default usePorterLiveTracking;
