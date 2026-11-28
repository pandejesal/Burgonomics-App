import { ok, fail, type ApiFailure, type ApiResult } from "@/core/network/http";
import type { Store, StoreHours } from "@/features/stores/models/Store";
import { haversineKm } from "@/features/stores/utils/distance";
import { db } from "@/core/config/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  limit,
  where,
  documentId,
} from "firebase/firestore";

// Loop 11/120: the outlet directory holds tens of docs — never pull it
// unbounded (same class as the Loop 3 partner fix).
const DIRECTORY_LIMIT = 100;

// Firestore caps an `in` filter at 30 values; the admin-hours backfill is
// chunked to the same bound, so it costs one bounded query per 30 rows that
// actually need it — and none at all when every row already has hours.
const HOURS_IN_QUERY_LIMIT = 30;

// P1-3: NO fabricated measurements. Every number below is either read from
// the store doc or null/absent — never a hardcoded stand-in. Docs without
// finite coordinates are dropped entirely (fail closed) so no consumer can
// inherit invented lat/lng.
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Reads a document's `hours` pair. Absent or malformed input stays `null` — a
 * schedule is never synthesized here; the ordering gate owns the documented
 * fallback so there is exactly one place that decides what "closed" means.
 */
function mapHours(raw: unknown): StoreHours | null {
  if (!raw || typeof raw !== "object") return null;
  const { open, close } = raw as { open?: unknown; close?: unknown };
  return typeof open === "string" && typeof close === "string" ? { open, close } : null;
}

// Exported for honesty unit tests (tests/stores-service-honesty.test.ts).
/**
 * Maps one storefront or partner-mirror document.
 *
 * `hoursSource` records WHICH collection produced the row: the ordering gate
 * treats `stores/{id}.hours` and `admin_stores/{id}.hours` as different
 * precedence levels, so the row must not be able to claim the wrong one.
 */
export function mapStoreDoc(
  data: any,
  id: string,
  hoursSource: NonNullable<Store["hoursSource"]> = "store",
): Store | null {
  const lat = toFiniteNumber(data.lat ?? data.latitude);
  const lng = toFiniteNumber(data.lng ?? data.longitude);
  if (lat === null || lng === null) {
    console.warn(`storesService: dropping store "${id}" — missing or non-finite coordinates`);
    return null;
  }
  const hours = mapHours(data.hours);
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
    hoursSource,
    // Unknown open-state stays unknown: only an explicit boolean, or the
    // doc's own CLOSED status, may be reported. A doc that says nothing is
    // never rendered as "Open now".
    isOpen:
      typeof data.isOpen === "boolean" ? data.isOpen : data.status === "CLOSED" ? false : undefined,
    storeStatusOverride: data.storeStatusOverride === true,
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

/**
 * Backfills `adminStoreHours` for rows whose storefront document carried no
 * hours — the same second document the server gate reads (`stores` → then
 * `admin_stores`). ONE bounded query per 30 rows that need it, and no read at
 * all when every row already has hours.
 *
 * A failed lookup is logged and left empty on purpose: the row then resolves
 * to the documented default window rather than to invented hours, and no
 * customer screen fails because a directory read partly failed.
 */
async function attachAdminStoreHours(stores: Store[]): Promise<Store[]> {
  const missingIds = stores.filter((store) => store.hours === null).map((store) => store.id);
  if (missingIds.length === 0) return stores;

  const found = new Map<string, StoreHours>();
  for (let i = 0; i < missingIds.length; i += HOURS_IN_QUERY_LIMIT) {
    const chunk = missingIds.slice(i, i + HOURS_IN_QUERY_LIMIT);
    try {
      const snap = await getDocs(
        query(collection(db, "admin_stores"), where(documentId(), "in", chunk)),
      );
      snap.forEach((d) => {
        const hours = mapHours(d.data()?.hours);
        if (hours) found.set(d.id, hours);
      });
    } catch (err) {
      console.warn("storesService: admin_stores hours lookup failed:", err);
    }
  }
  if (found.size === 0) return stores;

  return stores.map((store) =>
    store.hours === null ? { ...store, adminStoreHours: found.get(store.id) ?? null } : store,
  );
}

/** ONE mirror read, only when a single storefront document has no usable hours. */
async function withAdminStoreHours(store: Store): Promise<Store> {
  if (store.hours !== null) return store;
  try {
    const snap = await getDoc(doc(db, "admin_stores", store.id));
    const hours = snap.exists() ? mapHours(snap.data()?.hours) : null;
    return { ...store, adminStoreHours: hours };
  } catch (err) {
    console.warn("storesService: admin_stores hours lookup failed:", err);
    return { ...store, adminStoreHours: null };
  }
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
      const store = mapStoreDoc(d.data(), d.id, "store");
      if (store) stores.push(store);
    });
    // Storefront rows without hours still resolve to the outlet's real
    // schedule: the partner mirror is the next precedence level.
    return attachAdminStoreHours(stores);
  }

  // Fallback to admin_stores
  const adminStoresSnap = await getDocs(
    query(collection(db, "admin_stores"), limit(DIRECTORY_LIMIT)),
  );
  const stores: Store[] = [];
  adminStoresSnap.forEach((d) => {
    const store = mapStoreDoc(d.data(), d.id, "admin_store");
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
        const store = mapStoreDoc(snap.data(), snap.id, "store");
        if (store) return ok(await withAdminStoreHours(store));
      }
      const adminSnap = await getDoc(doc(db, "admin_stores", id));
      if (adminSnap.exists()) {
        const store = mapStoreDoc(adminSnap.data(), adminSnap.id, "admin_store");
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
