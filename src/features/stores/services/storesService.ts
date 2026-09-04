import { ok, fail, type ApiResult } from "@/core/network/http";
import type { Store } from "@/features/stores/models/Store";
import { MOCK_STORES } from "@/features/stores/data/mockStores";
import { haversineKm } from "@/features/stores/utils/distance";
import { db } from "@/core/config/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

function mapStoreDoc(data: any, id: string): Store {
  const lat = data.lat ?? data.latitude ?? 23.0225;
  const lng = data.lng ?? data.longitude ?? 72.5714;
  return {
    id: id,
    name: data.name || "Burgonomics Store",
    address: data.address || "",
    city: data.city || "Ahmedabad",
    area: data.area || data.city || "Ahmedabad",
    lat,
    lng,
    phone: data.phone || "+91 79 4000 0000",
    imageUrl: data.imageUrl || null,
    hours: data.hours || { open: "11:00", close: "23:00" },
    isOpen: data.isOpen !== false && data.status !== "CLOSED",
    isBusy: Boolean(data.isBusy),
    isRecentlyOpened: Boolean(data.isRecentlyOpened),
    supports: data.supports || { delivery: true, takeaway: true, dineIn: true },
    etaMinutes: data.etaMinutes || data.minPrepMinutes || 25,
    pickupEtaMinutes: data.pickupEtaMinutes || 15,
    deliveryFee: data.pricing?.deliveryFeeFlat ?? data.deliveryFee ?? 40,
    petpoojaRestId: data.petpoojaRestId || null,
    partnerBranchId: data.partnerBranchId || null,
    deliveryRadiusKm: data.deliveryRadiusKm ?? 7,
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
    const storesSnap = await getDocs(collection(db, "stores"));
    if (!storesSnap.empty) {
      const stores: Store[] = [];
      storesSnap.forEach((d) => stores.push(mapStoreDoc(d.data(), d.id)));
      return stores;
    }

    // Fallback to admin_stores
    const adminStoresSnap = await getDocs(collection(db, "admin_stores"));
    if (!adminStoresSnap.empty) {
      const stores: Store[] = [];
      adminStoresSnap.forEach((d) => stores.push(mapStoreDoc(d.data(), d.id)));
      return stores;
    }
  } catch (err) {
    console.warn("storesService: Firestore fetch error:", err);
  }
  // Dev-only built-in catalog (Runbook §8) — production shows no outlets
  // rather than invented stores when the backend is empty/unreachable.
  return import.meta.env.DEV ? MOCK_STORES : [];
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
        return ok(mapStoreDoc(snap.data(), snap.id));
      }
      const adminSnap = await getDoc(doc(db, "admin_stores", id));
      if (adminSnap.exists()) {
        return ok(mapStoreDoc(adminSnap.data(), adminSnap.id));
      }
    } catch {
      // fallback
    }
    const found = MOCK_STORES.find((s) => s.id === id) ?? null;
    return ok(found);
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
