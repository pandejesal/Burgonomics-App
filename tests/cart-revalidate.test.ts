// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

/**
 * Cart availability revalidation — the fail-closed contract.
 *
 * Previously a cart line whose product was missing from the fetched menu page
 * fell through the revalidation unchanged (implicitly "available"), and the
 * revalidation itself only ever read the first 100 menu entries, so an 86ed
 * item past #100 was never flagged. Both branches now fail closed; these
 * tests pin that (plus the positive control so the suite cannot pass by
 * refusing everything).
 */

import { useCartStore } from "../src/features/cart/state/cartStore";
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

describe("cartStore.revalidateWithProducts — fail-closed availability", () => {
  beforeEach(() => {
    useCartStore.getState().reset("store_demo");
    useCartStore.getState().addLine(line("p1", "Classic Smash Burger"));
    useCartStore.getState().addLine(line("p_missing", "Ghost Burger"));
  });

  it("flags a line whose product is missing from the live menu as unavailable", () => {
    const res = useCartStore.getState().revalidateWithProducts([product("p1")]);

    expect(res.changed).toBe(true);
    expect(res.messages).toContainEqual(
      "Ghost Burger is no longer available — please review your cart.",
    );
    const ghost = useCartStore.getState().lines.find((l) => l.productId === "p_missing");
    expect(ghost?.availability).toBe("unavailable");
    expect(ghost?.unavailableReason).toContain("Could not verify this item");
    // Positive control: the verified line stays available.
    const p1 = useCartStore.getState().lines.find((l) => l.productId === "p1");
    expect(p1?.availability).toBe("available");
  });

  it("marks an explicit inStock:false product unavailable (86ing, pre-existing contract)", () => {
    useCartStore.getState().reset("store_demo");
    useCartStore.getState().addLine(line("p86", "Peri Peri Fries"));

    const res = useCartStore.getState().revalidateWithProducts([product("p86", 199, false)]);

    expect(res.changed).toBe(true);
    expect(res.messages).toContainEqual("Peri Peri Fries is now out of stock.");
    expect(useCartStore.getState().lines[0].availability).toBe("unavailable");
  });

  it("changes nothing when every line matches an in-stock product at the same price", () => {
    useCartStore.getState().reset("store_demo");
    useCartStore.getState().addLine(line("p1", "Classic Smash Burger", 199));

    const res = useCartStore.getState().revalidateWithProducts([product("p1", 199, true)]);

    expect(res.changed).toBe(false);
    expect(res.messages).toHaveLength(0);
    expect(useCartStore.getState().lines[0].availability).toBe("available");
    expect(useCartStore.getState().lines[0].unitPrice).toBe(199);
  });
});
