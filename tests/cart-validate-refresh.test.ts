/**
 * Cart validation must judge the REFRESHED cart, not the pre-refresh snapshot.
 *
 * `CartRepository.validateCart()` refreshes an expired price lock first, and
 * that refresh can mark a newly 86'd line `unavailable` (or reprice it). The
 * method then read the `lines` captured BEFORE the await, so the very first
 * submit after an expiry passed validation with a stale "available" line — the
 * request that the refresh was supposed to block. When availability cannot be
 * verified at all (menu read failed) validation must also fail closed.
 *
 * `@vitest-environment jsdom` because the cart store persists to localStorage.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const menu = vi.hoisted(() => ({ listProducts: vi.fn() }));

vi.mock("../src/features/menu/repositories/MenuRepository", () => ({
  menuRepository: { listProducts: menu.listProducts },
}));
vi.mock("../src/features/offers/repositories/OfferRepository", () => ({
  offerRepository: { apply: vi.fn(), remove: vi.fn() },
}));

import { useCartStore } from "../src/features/cart/state/cartStore";
import { cartRepository } from "../src/features/cart/repositories/CartRepository";
import type { CartLine } from "../src/features/cart/models";
import type { Product } from "../src/features/menu/models";

const line = (productId: string, name: string, unitPrice = 199): CartLine => ({
  lineId: `line_${productId}`,
  productId,
  storeId: "store_demo",
  name,
  unitPrice,
  price: unitPrice,
  quantity: 1,
  modifiers: [],
  availability: "available",
});

const product = (id: string, price = 199, inStock = true): Product =>
  ({
    id,
    name: id,
    description: "",
    price,
    inStock,
    customizable: false,
    tags: [],
    badges: [],
  }) as unknown as Product;

const page = (items: Product[]) => ({
  success: true as const,
  data: { items, page: 1, pageSize: 1000, total: items.length, hasMore: false },
});

beforeEach(() => {
  menu.listProducts.mockReset();
  useCartStore.getState().reset("store_demo");
  useCartStore.getState().addLine(line("p86", "Peri Peri Fries"));
  // Expire the price lock: the next validateCart() refreshes before deciding.
  useCartStore.setState({ priceLockExpiresAt: Date.now() - 60_000 });
});

describe("CartRepository.validateCart — refreshed-state availability", () => {
  it("rejects the FIRST submit when the refresh discovers the line was 86'd", async () => {
    menu.listProducts.mockResolvedValueOnce(page([product("p86", 199, false)]));

    const res = await cartRepository.validateCart();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.valid).toBe(false);
    expect(res.data.issues[0]).toMatchObject({
      lineId: "line_p86",
      code: "unavailable",
    });
    expect(res.data.issues[0]?.message).toContain("out of stock");
    // The refreshed store state is the one that was judged.
    expect(useCartStore.getState().lines[0].availability).toBe("unavailable");
  });

  it("fails closed when availability cannot be verified (menu read failed)", async () => {
    menu.listProducts.mockResolvedValueOnce({
      success: false as const,
      error: { code: "NETWORK", message: "offline" },
    });

    const res = await cartRepository.validateCart();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.valid).toBe(false);
    expect(res.data.issues).toHaveLength(1);
    expect(res.data.issues[0]?.code).toBe("other");
    expect(res.data.issues[0]?.message).toMatch(/verif|connect|try again/i);
  });

  it("still validates a refreshed cart whose lines are all in stock (positive control)", async () => {
    menu.listProducts.mockResolvedValueOnce(page([product("p86", 199, true)]));

    const res = await cartRepository.validateCart();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.valid).toBe(true);
    expect(res.data.issues).toHaveLength(0);
    // A successful refresh renews the lock.
    expect(useCartStore.getState().isPriceLockExpired()).toBe(false);
  });
});
