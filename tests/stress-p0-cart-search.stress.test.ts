// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "../src/core/network/http";
import type { Product } from "../src/features/menu/models";
import { useCartStore } from "../src/features/cart/state/cartStore";
import { useSearchStore } from "../src/features/menu/state/searchStore";
import type * as SearchModels from "../src/features/search/models";

const repository = vi.hoisted(() => ({
  search: vi.fn(),
  suggest: vi.fn(),
  listTrending: vi.fn(),
}));
vi.mock("../src/features/menu/repositories/MenuRepository", () => ({ menuRepository: repository }));

// Cart store dialect mirrors tests/cart-revalidate.test.ts.
const line = (productId: string, name: string, unitPrice = 199) =>
  ({
    lineId: `line_${productId}`,
    productId,
    storeId: "store_demo",
    name,
    unitPrice,
    price: unitPrice,
    quantity: 1,
    modifiers: [],
    availability: "available",
  }) as unknown as import("../src/features/cart/models").CartLine;

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

describe("stress sweep P0 repairs (customer app)", () => {
  describe("F — cartStore restock recovery", () => {
    beforeEach(() => {
      useCartStore.getState().reset("store_demo");
    });

    it("RED: a restocked item becomes available again instead of staying locked out", () => {
      // The line rides through the 86ing (availability carried over), then the
      // kitchen restocks it — revalidation must flip it back to available.
      useCartStore.getState().addLine({
        ...line("p86", "Peri Peri Fries"),
        availability: "unavailable",
        unavailableReason: "This item is currently out of stock.",
      });

      const res = useCartStore.getState().revalidateWithProducts([product("p86", 199, true)]);

      expect(res.changed).toBe(true);
      const restored = useCartStore.getState().lines.find((l) => l.productId === "p86");
      expect(restored?.availability).toBe("available");
      expect(restored?.unavailableReason).toBeUndefined();
    });

    it("the 86ing direction still marks a live item out of stock (positive control)", () => {
      useCartStore.getState().addLine(line("p86", "Peri Peri Fries"));
      const res = useCartStore.getState().revalidateWithProducts([product("p86", 199, false)]);
      expect(res.changed).toBe(true);
      const dropped = useCartStore.getState().lines.find((l) => l.productId === "p86");
      expect(dropped?.availability).toBe("unavailable");
    });
  });

  describe("G — searchStore same-tick suggestions", () => {
    beforeEach(() => {
      vi.resetAllMocks();
      useSearchStore.getState().reset();
    });

    it("RED: suggestions are delivered when fetchSuggestions and submit fire on the same turn", async () => {
      repository.suggest.mockResolvedValue(
        ok([{ id: "sug_1", label: "Smash Burger" } as unknown as SearchModels.Product])
      );
      repository.search.mockResolvedValue(ok({ items: [] }));

      const store = useSearchStore.getState();
      store.setQuery("burger");
      // EXACT production interleaving (routes/search.tsx): fetchSuggestions and
      // submit are invoked back-to-back within the same 300ms debounce tick.
      // submit() bumps requestSeq synchronously, which today invalidates the
      // suggestion response that was started in the same turn.
      const pSuggest = store.fetchSuggestions("branch_a");
      const pSubmit = store.submit("branch_a");
      await Promise.all([pSuggest, pSubmit]);

      expect(useSearchStore.getState().suggestions).toHaveLength(1);
      expect(useSearchStore.getState().suggestions[0]?.id).toBe("sug_1");
    });
  });
});
