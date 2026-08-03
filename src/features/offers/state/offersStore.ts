/**
 * offersStore — client-side cache for the repository-fetched offer
 * bundle. The store NEVER mutates offers; it only mirrors what the
 * repository last returned and enforces the backend-declared TTL
 * (PETPOOJA syncs every ~5 minutes).
 */
import { create } from "zustand";
import { offerRepository } from "@/features/offers/repositories/OfferRepository";
import type { Offer, OfferBundle } from "@/features/offers/models";
import type { Fulfillment } from "@/features/stores/models/Store";

export type OffersStatus = "idle" | "loading" | "refreshing" | "ready" | "empty" | "error";

interface OffersState {
  status: OffersStatus;
  offers: Offer[];
  fetchedAt: number | null;
  refreshIntervalMs: number;
  error: string | null;
  contextKey: string | null;

  load: (
    input: { storeId?: string; fulfillment?: Fulfillment },
    opts?: { force?: boolean },
  ) => Promise<void>;
  reset: () => void;
}

function keyOf(input: { storeId?: string; fulfillment?: Fulfillment }) {
  return `${input.storeId ?? "_"}::${input.fulfillment ?? "_"}`;
}

export const useOffersStore = create<OffersState>((set, get) => ({
  status: "idle",
  offers: [],
  fetchedAt: null,
  refreshIntervalMs: 5 * 60_000,
  error: null,
  contextKey: null,

  async load(input, opts) {
    const force = opts?.force === true;
    const key = keyOf(input);
    const s = get();
    const fresh =
      s.status === "ready" &&
      s.contextKey === key &&
      s.fetchedAt != null &&
      Date.now() - s.fetchedAt < s.refreshIntervalMs;
    if (!force && fresh) return;

    set({
      status: s.status === "ready" ? "refreshing" : "loading",
      error: null,
    });
    const res = await offerRepository.list(input);
    if (!res.success) {
      set({ status: "error", error: res.error.message });
      return;
    }
    const bundle: OfferBundle = res.data;
    set({
      status: bundle.offers.length === 0 ? "empty" : "ready",
      offers: bundle.offers,
      fetchedAt: Date.parse(bundle.fetchedAt) || Date.now(),
      refreshIntervalMs: Math.max(30_000, bundle.refreshIntervalSeconds * 1000),
      contextKey: key,
    });
  },

  reset() {
    set({
      status: "idle",
      offers: [],
      fetchedAt: null,
      error: null,
      contextKey: null,
    });
  },
}));
