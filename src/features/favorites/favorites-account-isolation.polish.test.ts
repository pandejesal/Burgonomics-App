/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import { useFavoritesStore } from "@/features/favorites/state/favoritesStore";
import { favoritesRepository } from "@/features/favorites/repositories/FavoritesRepository";
import type { Favorite } from "@/features/favorites/models";

let uid: string | null = null;
let notify: (state: { user: { id: string } | null }) => void;
configureAuthUidSource({
  getUid: () => uid,
  subscribe: (listener) => { notify = listener; return () => {}; },
});
function authenticate(nextUid: string | null) {
  uid = nextUid;
  notify({ user: uid ? { id: uid } : null });
}
const favorite: Favorite = {
  id: "fav-a", kind: "product", refId: "product-a", name: "A's favorite", addedAt: 1,
};

beforeEach(() => {
  localStorage.clear();
  authenticate(null);
  useFavoritesStore.getState().clear();
});

describe("device-local favorites account isolation", () => {
  it("clears on sign-out and never shows A's favorites to B", () => {
    authenticate("account-a");
    useFavoritesStore.getState().add(favorite);
    authenticate(null);
    expect(useFavoritesStore.getState().items).toEqual([]);
    authenticate("account-b");
    expect(useFavoritesStore.getState().items).toEqual([]);
    authenticate("account-a");
    expect(useFavoritesStore.getState().items).toEqual([favorite]);
    expect(localStorage.getItem("burg.favorites.local::account-a")).toContain("fav-a");
  });

  it("ignores ownerless legacy favorites and has no cross-device hydration", async () => {
    localStorage.setItem("burg.favorites", JSON.stringify({ state: { items: [favorite] }, version: 1 }));
    authenticate("account-a");
    await useFavoritesStore.persist.rehydrate();
    expect(useFavoritesStore.getState().items).toEqual([]);
    useFavoritesStore.getState().add(favorite);
    localStorage.clear(); // Fresh device has no local account cache.
    authenticate("account-b");
    authenticate("account-a");
    expect(useFavoritesStore.getState().items).toEqual([]);
  });

  it("rejects an in-flight toggle when the account changes, including A to B to A", async () => {
    vi.useFakeTimers();
    try {
      authenticate("account-a");
      const pending = favoritesRepository.toggle(favorite);
      authenticate("account-b");
      authenticate("account-a");
      await vi.runAllTimersAsync();
      expect(await pending).toMatchObject({ success: false, error: { code: "AUTH_CHANGED" } });
      expect(useFavoritesStore.getState().items).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
