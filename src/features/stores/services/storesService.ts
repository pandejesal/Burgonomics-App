import { ok, fail, type ApiFailure, type ApiResult } from "@/core/network/http";
import type { Store } from "@/features/stores/models/Store";
import { haversineKm } from "@/features/stores/utils/distance";
import { db } from "@/core/config/firebase";
import { collection, getDocs, doc, getDoc, query, limit } from "firebase/firestore";

// Loop 11/120: the outlet directory holds tens of docs — never pull it
// unbounded (same class as the Loop 3 partner fix).
const DIRECTORY_LIMIT = 100;

// P1-3: NO fabricated measurements. Every number below is either read from
// the store doc or null/absent — never a hardcoded stand-in. Docs without
// finite coordinates are dropped entirely (fail closed) so no consumer can
// inherit invented lat/lng.
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// Exported for honesty unit tests (tests/stores-service-honesty.test.ts).
export function mapStoreDoc(data: any, id: string): Store | null {
  const lat = toFiniteNumber(data.lat ?? data.latitude);
  const lng = toFiniteNumber(data.lng ?? data.longitude);
  if (lat === null || lng === null) {
    console.warn(`storesService: dropping store "${id}" — missing or non-finite coordinates`);
    return null;
  }
  const hours =
    data.hours &&
    typeof data.hours === "object" &&
    typeof data.hours.open === "string" &&
    typeof data.hours.close === "string"
      ? { open: data.hours.open, close: data.hours.close }
      : null;
  return {
    id: id,
    name: data.name || "Burgonomics Store",
    address: data.address || "",
    city: data.city || "",
    area: data.area || data.city || "",
    lat,
    lng,
    phone: data.phone || "",
    imageUrl: data.imageUrl || null,
    hours,
    // Unknown open-state stays unknown: only an explicit boolean, or the
    // doc's own CLOSED status, may be reported. A doc that says nothing is
    // never rendered as "Open now".
    isOpen:
      typeof data.isOpen === "boolean"
        ? data.isOpen
        : data.status === "CLOSED"
          ? false
          : undefined,
    isBusy: Boolean(data.isBusy),
    isRecentlyOpened: Boolean(data.isRecentlyOpened),
    // Deny by default: a fulfillment mode is offered only when the doc grants
    // it. A doc without `supports` (or with a partial one) grants nothing.
    supports: {
      delivery: data.supports?.delivery === true,
      takeaway: data.supports?.takeaway === true,
      dineIn: data.supports?.dineIn === true,
    },
    etaMinutes: data.etaMinutes || data.minPrepMinutes || null,
    pickupEtaMinutes: data.pickupEtaMinutes || null,
    deliveryFee: data.pricing?.deliveryFeeFlat ?? data.deliveryFee,
    petpoojaRestId: data.petpoojaRestId || null,
    partnerBranchId: data.partnerBranchId || null,
    // null when the doc has no radius — geofence/PAY logic falls back to
    // DEFAULT_DELIVERY_RADIUS_KM at read time; UI must not show it as fact.
    deliveryRadiusKm: toFiniteNumber(data.deliveryRadiusKm),
    pricing: data.pricing || null,
  };
}

const withDistance = (stores: Store[], coords?: { lat: number; lng: number }): Store[] => {
  if (!coords) {
    return stores
      .map((s) => ({ ...s, distanceKm: undefined }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return stores
    .map((s) => ({ ...s, distanceKm: haversineKm(coords, { lat: s.lat, lng: s.lng }) }))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
};

/**
 * Reads the outlet directory.
 *
 * THROWS on a read failure: a Firestore error is not an empty directory, and
 * the previous `catch { return [] }` made every network/permission failure
 * indistinguishable from "no stores exist", which the screen then rendered as a
 * truthful empty state (so the customer only ever saw stores after a manual
 * Retry). `stores` stays authoritative; `admin_stores` is consulted only when
 * `stores` is genuinely empty.
 */
async function fetchFirestoreStores(): Promise<Store[]> {
  const storesSnap = await getDocs(query(collection(db, "stores"), limit(DIRECTORY_LIMIT)));
  if (!storesSnap.empty) {
    const stores: Store[] = [];
    // Fail closed: docs without finite coords are dropped (with a warn).
    storesSnap.forEach((d) => {
      const store = mapStoreDoc(d.data(), d.id);
      if (store) stores.push(store);
    });
    return stores;
  }

  // Fallback to admin_stores
  const adminStoresSnap = await getDocs(
    query(collection(db, "admin_stores"), limit(DIRECTORY_LIMIT)),
  );
  const stores: Store[] = [];
  adminStoresSnap.forEach((d) => {
    const store = mapStoreDoc(d.data(), d.id);
    if (store) stores.push(store);
  });
  // No mock fallback in production — a genuinely empty directory is [].
  return stores;
}

/**
 * A failed read becomes a retryable `ApiResult` failure (never `ok([])`), so the
 * screen keeps its real error state instead of claiming an empty catalogue. The
 * raw provider message stays in the log: it can carry paths/ids that must not
 * reach customer copy.
 */
function directoryReadFailure(err: unknown): ApiFailure {
  console.warn("storesService: Firestore read failed:", err);
  return fail("STORES_UNAVAILABLE", "The store directory could not be loaded.", true);
}

export const storesService = {
  async list(coords?: { lat: number; lng: number }): Promise<ApiResult<Store[]>> {
    try {
      const allStores = await fetchFirestoreStores();
      return ok(withDistance(allStores, coords));
    } catch (err) {
      return directoryReadFailure(err);
    }
  },

  async nearby(lat?: number, lng?: number): Promise<ApiResult<Store[]>> {
    const coords = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    try {
      const allStores = await fetchFirestoreStores();
      const ranked = withDistance(allStores, coords);
      return ok(ranked.slice(0, 5));
    } catch (err) {
      return directoryReadFailure(err);
    }
  },

  async byId(id: string): Promise<ApiResult<Store | null>> {
    try {
      const snap = await getDoc(doc(db, "stores", id));
      if (snap.exists()) {
        // Fail closed: a doc without finite coords yields null, never a
        // store positioned at invented coordinates.
        const store = mapStoreDoc(snap.data(), snap.id);
        if (store) return ok(store);
      }
      const adminSnap = await getDoc(doc(db, "admin_stores", id));
      if (adminSnap.exists()) {
        const store = mapStoreDoc(adminSnap.data(), adminSnap.id);
        if (store) return ok(store);
      }
    } catch {
      // fallback
    }
    // Loop: list() is DEV-gated; byId must match — a prod lookup miss must
    // return null (honest not-found), never a mock store.
    return ok(null);
  },

  async search(query: string, coords?: { lat: number; lng: number }): Promise<ApiResult<Store[]>> {
    const q = query.trim().toLowerCase();
    try {
      const allStores = await fetchFirestoreStores();
      if (!q) return ok(withDistance(allStores, coords));
      const filtered = allStores.filter((s) =>
        [s.name, s.city, s.area, s.address].some((f) => f.toLowerCase().includes(q)),
      );
      return ok(withDistance(filtered, coords));
    } catch (err) {
      return directoryReadFailure(err);
    }
  },
};
