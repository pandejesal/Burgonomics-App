import { delay, ok, fail, type ApiResult } from "@/core/network/http";
import type { Store } from "@/features/stores/models/Store";
import { MOCK_STORES } from "@/features/stores/data/mockStores";
import { haversineKm } from "@/features/stores/utils/distance";

/**
 * Mock transport for the Stores feature. Simulates realistic network
 * latency and injects distance from the caller's coordinates when
 * provided. Swap this file for real HTTP calls (`httpClient.get`) when
 * the backend lands — the repository/UI contract is unchanged.
 */

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

// Toggle to simulate a network failure for QA (kept false in mock mode).
const SHOULD_FAIL = false;

export const storesService = {
  async list(coords?: { lat: number; lng: number }): Promise<ApiResult<Store[]>> {
    await delay(700 + Math.random() * 500);
    if (SHOULD_FAIL) {
      return fail("NETWORK", "Couldn't load stores. Please try again.", true);
    }
    return ok(withDistance(MOCK_STORES, coords));
  },

  async nearby(lat?: number, lng?: number): Promise<ApiResult<Store[]>> {
    await delay(600 + Math.random() * 400);
    if (SHOULD_FAIL) {
      return fail("NETWORK", "Couldn't load nearby stores.", true);
    }
    const coords = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    const ranked = withDistance(MOCK_STORES, coords);
    return ok(ranked.slice(0, 5));
  },

  async byId(id: string): Promise<ApiResult<Store | null>> {
    await delay(250);
    const found = MOCK_STORES.find((s) => s.id === id) ?? null;
    return ok(found);
  },

  async search(query: string, coords?: { lat: number; lng: number }): Promise<ApiResult<Store[]>> {
    await delay(300);
    const q = query.trim().toLowerCase();
    if (!q) return ok(withDistance(MOCK_STORES, coords));
    const filtered = MOCK_STORES.filter((s) =>
      [s.name, s.city, s.area, s.address].some((f) => f.toLowerCase().includes(q)),
    );
    return ok(withDistance(filtered, coords));
  },
};
