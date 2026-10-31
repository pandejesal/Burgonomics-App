/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomizationGroup, ProductDetails } from "@/features/menu/models";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Review repairs (B + C): real dialog semantics/focus management, and
 * customizer rules that cannot auto-select sold-out options, resurrect retired
 * repeat-last choices, or claim success when the cart rejects the line.
 */

const fixture = vi.hoisted(() => ({
  lines: [] as Array<{
    productId: string;
    modifiers?: Array<{ groupId: string; optionId: string }>;
  }>,
  addItem: vi.fn(),
}));

vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { addItem: fixture.addItem, updateQuantity: vi.fn() },
}));
vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: (selector: (state: { lines: typeof fixture.lines }) => unknown) =>
    selector({ lines: fixture.lines }),
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (selector: (state: unknown) => unknown) =>
    selector({ activeStore: { id: "store-1" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn().mockResolvedValue(undefined) },
}));

import { toast } from "sonner";
import { ProductCustomizerModal } from "./ProductCustomizerModal";

function details(overrides: Partial<ProductDetails> = {}): ProductDetails {
  return {
    id: "p1",
    categoryId: "cat_a",
    name: "Test Burger",
    price: 100,
    veg: true,
    inStock: true,
    description: "A burger",
    customizations: [],
    ...overrides,
  };
}

function singleGroup(options: CustomizationGroup["options"]): CustomizationGroup {
  return {
    id: "g1",
    name: "Choose a bun",
    selection: "single",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options,
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const render = async (element: React.ReactElement) => {
  await act(async () => {
    root.render(element);
  });
};

const addButton = () =>
  container.querySelector<HTMLButtonElement>('[data-testid="customizer-add-to-cart"]');

beforeEach(() => {
  fixture.lines = [];
  fixture.addItem.mockReset();
  fixture.addItem.mockResolvedValue({ success: true, data: {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  document.body.style.overflow = "";
});

describe("dialog semantics and focus (B)", () => {
  it("exposes dialog semantics, traps Tab, closes on Escape and restores focus", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.append(opener);
    opener.focus();

    let closed = 0;
    await render(
      <ProductCustomizerModal product={details()} isOpen onClose={() => (closed += 1)} />,
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(labelledBy)?.textContent).toContain("Customize Test Burger");
    expect(document.body.style.overflow).toBe("hidden");
    // Focus entry: first focusable control inside the sheet.
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab from the last focusable wraps to the first one.
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(first);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(closed).toBe(1);

    await render(
      <ProductCustomizerModal product={details()} isOpen={false} onClose={() => (closed += 1)} />,
    );
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe("selection guards (C)", () => {
  it("never auto-selects an all-sold-out required group, and blocks the add", async () => {
    const product = details({
      customizations: [
        singleGroup([
          { id: "o1", name: "Sold out bun", priceDelta: 0, outOfStock: true },
          { id: "o2", name: "Also sold out", priceDelta: 0, outOfStock: true },
        ]),
      ],
    });

    await render(<ProductCustomizerModal product={product} isOpen onClose={() => {}} />);

    const cta = addButton()!;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toContain("Choose Required Options");
    expect(cta.getAttribute("aria-busy")).toBeNull();
  });

  it("drops retired options from repeat-last and keeps the required group blocking", async () => {
    fixture.lines = [{ productId: "p1", modifiers: [{ groupId: "g1", optionId: "retired" }] }];
    const product = details({
      customizations: [singleGroup([{ id: "o1", name: "Current bun", priceDelta: 0 }])],
    });

    await render(<ProductCustomizerModal product={product} isOpen onClose={() => {}} />);

    const repeat = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Repeat Last Customization"),
    )!;
    await act(async () => repeat.click());

    expect(toast.error).toHaveBeenCalledWith(
      "Those options are no longer available. Please choose again.",
    );
    expect(toast.success).not.toHaveBeenCalled();
    // Nothing selected: the required group still blocks.
    expect(addButton()!.disabled).toBe(true);
  });

  it("accepts a legitimate negative delta but rejects a non-finite one", async () => {
    const discounted = details({
      customizations: [singleGroup([{ id: "o1", name: "Discount bun", priceDelta: -30 }])],
    });
    await render(<ProductCustomizerModal product={discounted} isOpen onClose={() => {}} />);
    let cta = addButton()!;
    expect(cta.disabled).toBe(false);
    expect(cta.textContent).toContain("Add to Cart");
    expect(cta.textContent).toMatch(/70/);

    const broken = details({
      customizations: [singleGroup([{ id: "o1", name: "Broken", priceDelta: Number.NaN }])],
    });
    await render(<ProductCustomizerModal product={broken} isOpen onClose={() => {}} />);
    cta = addButton()!;
    expect(cta.disabled).toBe(true);
  });

  it("does not report success when the cart rejects the line", async () => {
    fixture.addItem.mockResolvedValue({
      success: false,
      error: { code: "STORE_MISMATCH", message: "RAW PRIVATE DIAGNOSTIC" },
    });
    const onClose = vi.fn();

    await render(<ProductCustomizerModal product={details()} isOpen onClose={onClose} />);
    await act(async () => addButton()!.click());

    expect(toast.error).toHaveBeenCalledWith("Couldn't add to cart", expect.anything());
    expect(toast.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("turns a rejected add into a controlled failure and releases busy", async () => {
    fixture.addItem.mockRejectedValue(new Error("network down"));
    const onClose = vi.fn();

    await render(<ProductCustomizerModal product={details()} isOpen onClose={onClose} />);
    await act(async () => addButton()!.click());

    expect(toast.error).toHaveBeenCalledWith("Couldn't add to cart", expect.anything());
    expect(toast.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The sheet is usable again: busy released after the rejection.
    expect(addButton()!.getAttribute("aria-busy")).toBeNull();
  });
});
