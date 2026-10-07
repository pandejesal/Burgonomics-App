import { ok, fail, type ApiResult } from "@/core/network/http";
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
    isOpen: data.isOpen !== false && data.status !== "CLOSED",
    isBusy: Boolean(data.isBusy),
    isRecentlyOpened: Boolean(data.isRecentlyOpened),
    supports: data.supports || { delivery: true, takeaway: true, dineIn: true },
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

async function fetchFirestoreStores(): Promise<Store[]> {
  try {
    const storesSnap = await getDocs(query(collection(db, "stores"), limit(DIRECTORY_LIMIT)));
    if (!storesSnap.empty) {
      const stores: Store[] = [];
      storesSnap.forEach((d) => {
        // Fail closed: docs without finite coords are dropped (with a warn).
        const store = mapStoreDoc(d.data(), d.id);
        if (store) stores.push(store);
      });
      return stores;
    }

    // Fallback to admin_stores
    const adminStoresSnap = await getDocs(query(collection(db, "admin_stores"), limit(DIRECTORY_LIMIT)));
    if (!adminStoresSnap.empty) {
      const stores: Store[] = [];
      adminStoresSnap.forEach((d) => {
        const store = mapStoreDoc(d.data(), d.id);
        if (store) stores.push(store);
      });
      return stores;
    }
  } catch (err) {
    console.warn("storesService: Firestore fetch error:", err);
  }
  // No mock fallback in production — return empty array
  return [];
}

export const storesService = {
  async list(coords?: { lat: number; lng: number }): Promise<ApiResult<Store[]>> {
    const allStores = await fetchFirestoreStores();
    return ok(withDistance(allStores, coords));
  },

  async nearby(lat?: number, lng?: number): Promise<ApiResult<Store[]>> {
    const coords = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    const allStores = await fetchFirestoreStores();
    const ranked = withDistance(allStores, coords);
    return ok(ranked.slice(0, 5));
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
    const allStores = await fetchFirestoreStores();
    if (!q) return ok(withDistance(allStores, coords));
    const filtered = allStores.filter((s) =>
      [s.name, s.city, s.area, s.address].some((f) => f.toLowerCase().includes(q)),
    );
    return ok(withDistance(filtered, coords));
  },
};
