/** @vitest-environment jsdom */
/**
 * CUS-04 — the cart must not survive the account that put things in it.
 *
 * `useCartStore` persists at the unscoped key `burg.cart` and nothing cleared
 * it, so on a shared device the next account inherited the previous customer's
 * lines, per-line notes and promo code. This asserts the real
 * `useAuthStore.getState().logout()` path (not a simulated uid change) plus the
 * two uid transitions that keep the intended behaviours: guest→signed-in
 * carry-over stays, account switch is wiped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartLine } from "@/features/cart/models";

const fixture = vi.hoisted(() => ({
  logout: vi.fn(),
  unlink: vi.fn(),
  link: vi.fn(),
  clearCache: vi.fn(),
}));

vi.mock("@/features/auth/repositories/AuthRepository", () => ({
  authRepository: { logout: fixture.logout },
}));
vi.mock("@/features/notifications/services/notificationsService", () => ({
  notificationsService: {
    unlinkUserFromDeviceToken: fixture.unlink,
    linkUserToDeviceToken: fixture.link,
  },
}));
vi.mock("@/features/profile/repositories/ProfileRepository", () => ({
  profileRepository: { clearCache: fixture.clearCache, refresh: vi.fn() },
}));
vi.mock("@/core/storage/secureStorage", () => ({
  secureStorage: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
  SECURE_KEYS: { ACCESS_TOKEN: "access", REFRESH_TOKEN: "refresh", USER: "user" },
}));

import { useAuthStore } from "@/features/auth/state/authStore";
import { useCartStore } from "@/features/cart/state/cartStore";

const line = (lineId: string): CartLine => ({
  lineId,
  productId: `prod_${lineId}`,
  name: "Classic Smash",
  storeId: "str_qa",
  quantity: 1,
  unitPrice: 199,
  price: 199,
  availability: "available",
  modifiers: [],
  notes: "no pickles",
});

const signedIn = (id: string) =>
  useAuthStore.setState({
    status: "authenticated",
    user: { id, phone: "+919825012345", name: "Test" },
    accessToken: `access_${id}`,
    refreshToken: `refresh_${id}`,
  });

const asGuest = () =>
  useAuthStore.setState({
    status: "guest",
    user: null,
    accessToken: null,
    refreshToken: null,
    isBootstrapped: true,
  });

const persistedCart = (): { state?: { lines?: CartLine[] } } =>
  JSON.parse(window.localStorage.getItem("burg.cart") ?? "{}") as {
    state?: { lines?: CartLine[] };
  };

beforeEach(() => {
  vi.clearAllMocks();
  fixture.logout.mockResolvedValue({ success: true, data: null });
  fixture.unlink.mockResolvedValue({ success: true, data: null });
  asGuest();
  useCartStore.getState().clear();
  window.localStorage.clear();
});

describe("CUS-04 — cart is cleared when the signed-in account goes away", () => {
  it("empties the cart (memory and localStorage) on logout", async () => {
    signedIn("usr_a");
    useCartStore.getState().addLine(line("l1"));
    expect(useCartStore.getState().lines).toHaveLength(1);

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useCartStore.getState().lines).toEqual([]);
    expect(useCartStore.getState().storeId).toBeNull();
    // The persisted plaintext entry is emptied too, not just the live store.
    expect(persistedCart().state?.lines ?? []).toEqual([]);
  });

  it("empties the cart when a different account signs in on the same device", () => {
    signedIn("usr_a");
    useCartStore.getState().addLine(line("l1"));

    signedIn("usr_b");

    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("keeps the guest cart when the guest then signs in", () => {
    asGuest();
    useCartStore.getState().addLine(line("l1"));

    signedIn("usr_b");

    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(useCartStore.getState().lines[0].notes).toBe("no pickles");
  });
});
