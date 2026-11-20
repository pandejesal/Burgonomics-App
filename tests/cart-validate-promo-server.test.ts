/**
 * The promo recheck in `validateCart()` must ask the SERVER about the cart,
 * not about a local subtotal.
 *
 * Review finding 1 (offers-coupons-20261120): the recheck called
 * `offerRepository.apply` without `lines`, so `offersService.quote` answered
 * `CART_EMPTY` for every cart that had a coupon. `validateCart()` then wiped a
 * perfectly valid promo and halted checkout with "Your coupon … is no longer
 * valid and was removed" — for every customer, every time.
 *
 * The mirror risk is deleting the coupon because the authority was unreachable:
 * an outage is not proof that the code is bad. Both are pinned here.
 *
 * `@vitest-environment jsdom` because the cart store persists to localStorage.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const menu = vi.hoisted(() => ({ listProducts: vi.fn() }));
const offers = vi.hoisted(() => ({ apply: vi.fn(), remove: vi.fn() }));

vi.mock("../src/features/menu/repositories/MenuRepository", () => ({
  menuRepository: { listProducts: menu.listProducts },
}));
vi.mock("../src/features/offers/repositories/OfferRepository", () => ({
  offerRepository: offers,
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
  quantity: 2,
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

const PROMO = {
  offerId: "SAVE50",
  code: "SAVE50",
  description: "₹50 off",
  discount: 50,
  savingsLabel: "You saved ₹50",
  type: "coupon",
};

beforeEach(() => {
  menu.listProducts.mockReset();
  offers.apply.mockReset();
  useCartStore.getState().reset("store_demo");
  useCartStore.getState().addLine(line("p1", "Hero Burger"));
  useCartStore.getState().setPromo({ ...PROMO });
  useCartStore.setState({ priceLockExpiresAt: Date.now() - 60_000 });
});

describe("CartRepository.validateCart — server-side promo recheck", () => {
  it("sends the cart LINES to the server, not a local subtotal", async () => {
    menu.listProducts.mockResolvedValueOnce(page([product("p1", 199, true)]));
    offers.apply.mockResolvedValueOnce({
      success: true,
      data: { ...PROMO },
    });

    await cartRepository.validateCart();

    expect(offers.apply).toHaveBeenCalledTimes(1);
    const argument = offers.apply.mock.calls[0][0] as any;
    expect(argument.lines).toEqual([{ productId: "p1", quantity: 2, price: 199 }]);
    // A subtotal the server would ignore must not be the thing it is judged on.
    expect(argument.subtotal).toBeUndefined();
  });

  it("keeps a coupon the server still honours (no false 'no longer valid')", async () => {
    menu.listProducts.mockResolvedValueOnce(page([product("p1", 199, true)]));
    offers.apply.mockResolvedValueOnce({ success: true, data: { ...PROMO } });

    const res = await cartRepository.validateCart();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.valid).toBe(true);
    expect(res.data.issues).toHaveLength(0);
    expect(useCartStore.getState().promo?.code).toBe("SAVE50");
  });

  it("updates the stored discount when the server's value changed", async () => {
    menu.listProducts.mockResolvedValueOnce(page([product("p1", 199, true)]));
    offers.apply.mockResolvedValueOnce({
      success: true,
      data: { ...PROMO, discount: 40, savingsLabel: "You saved ₹40" },
    });

    const res = await cartRepository.validateCart();

    expect(res.success).toBe(true);
    expect(useCartStore.getState().promo?.discount).toBe(40);
  });

  it("removes the coupon when the server REFUSES it", async () => {
    menu.listProducts.mockResolvedValueOnce(page([product("p1", 199, true)]));
    offers.apply.mockResolvedValueOnce({
      success: false,
      error: { code: "COUPON_EXPIRED", message: "This coupon has expired.", retryable: false },
    });

    const res = await cartRepository.validateCart();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.valid).toBe(false);
    expect(res.data.issues[0]?.message).toContain("no longer valid");
    expect(useCartStore.getState().promo).toBeNull();
  });

  it("blocks checkout but KEEPS the coupon when the authority is unreachable", async () => {
    menu.listProducts.mockResolvedValueOnce(page([product("p1", 199, true)]));
    offers.apply.mockResolvedValueOnce({
      success: false,
      error: {
        code: "COUPON_CHECK_UNAVAILABLE",
        message: "We couldn't check that coupon just now — please try again.",
        retryable: true,
      },
    });

    const res = await cartRepository.validateCart();

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.valid).toBe(false);
    expect(res.data.issues[0]?.message).toMatch(/verify.*coupon|try again/i);
    // An outage is not proof that the code is dead: do NOT delete it.
    expect(useCartStore.getState().promo?.code).toBe("SAVE50");
  });
});
