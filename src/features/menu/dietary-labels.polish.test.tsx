/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/features/menu/models";
import type { CartLine } from "@/features/cart/models";

const fixtures = vi.hoisted(() => ({ lines: [] as CartLine[], addItem: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: (selector: (state: { lines: CartLine[] }) => unknown) => selector(fixtures),
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (selector: (state: { activeStore: { id: string } }) => unknown) => selector({ activeStore: { id: "store" } }),
}));
vi.mock("@/features/cart/repositories/CartRepository", () => ({ cartRepository: { addItem: fixtures.addItem } }));
vi.mock("@/core/services/haptics", () => ({ HapticService: { impact: vi.fn() } }));
vi.mock("@/core/services/audio", () => ({ AudioService: { playClick: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}));

import { BestSellerCard } from "@/features/home/components/BestSellerCard";
import { ProductCustomizerModal } from "@/features/menu/components/ProductCustomizerModal";
import { CartItemRow } from "@/features/cart/components/CartItemRow";
import { CartItemList } from "@/features/cart/components/CartItemList";
import { GuestProfilePrompt } from "@/features/profile/components/GuestProfilePrompt";

const product: Product = { id: "product", categoryId: "burgers", name: "Burger", price: 100, veg: false, inStock: true };
function makeLine(veg: boolean | undefined): CartLine {
  return { lineId: "line", productId: "product", storeId: "store", name: "Burger", unitPrice: 100, quantity: 1, modifiers: [], availability: "available", veg };
}
afterEach(() => { fixtures.lines = []; fixtures.addItem.mockClear(); });

describe("dietary indicators reflect explicit data only", () => {
  for (const veg of [true, false, undefined]) {
    // Unknown dietary flags occur in legacy / incomplete runtime data.
    const runtimeProduct = { ...product, veg } as Product;
    for (const component of ["bestseller", "customizer", "cart row", "cart list"] as const) {
      it(`${component}: veg=${String(veg)}`, () => {
        const line = makeLine(veg);
        fixtures.lines = [line];
        const elements = {
          bestseller: <BestSellerCard product={runtimeProduct} />,
          customizer: <ProductCustomizerModal product={runtimeProduct} isOpen onClose={() => {}} />,
          "cart row": <CartItemRow line={line} onQuantityChange={() => {}} onRemove={() => {}} onNotesChange={() => {}} />,
          "cart list": <CartItemList />,
        };
        const container = document.createElement("div");
        container.innerHTML = renderToStaticMarkup(elements[component]);
        const labels = [...container.querySelectorAll('[role="img"]')].map((node) => node.getAttribute("aria-label"));
        expect(container.querySelector('[aria-label="100% Pure Vegetarian"]')).toBeNull();
        if (veg === undefined) expect(labels).toEqual([]);
        else {
          expect(labels.length).toBeGreaterThan(0);
          expect(labels.every((label) => label === (veg ? "Vegetarian" : "Non-vegetarian"))).toBe(true);
        }
        if (veg !== true) {
          expect(container.textContent).not.toMatch(/Pure Veg|100% vegetarian/i);
          expect([...container.querySelectorAll("span")].some((node) => node.textContent === "VEG")).toBe(false);
        }
      });
    }
  }

  it.each([false, undefined])("customizer preserves veg=%s in added cart data", async (veg) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<ProductCustomizerModal product={{ ...product, veg } as Product} isOpen onClose={() => {}} />));
      const button = [...container.querySelectorAll("button")].find((node) => node.textContent?.includes("Add to Cart"));
      expect(button).toBeDefined();
      await act(async () => button!.click());
      expect(fixtures.addItem).toHaveBeenCalledWith(expect.objectContaining({ veg }));
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("guest profile describes device-local saving, not cross-device sync", () => {
    const html = renderToStaticMarkup(<GuestProfilePrompt />);
    expect(html).toContain("on this device");
    expect(html).not.toContain("synced across your devices");
  });
});
