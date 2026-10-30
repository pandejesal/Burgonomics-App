/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok } from "@/core/network/http";
import type { CartLine } from "@/features/cart/models";
import type { ProductDetails } from "@/features/menu/models";
import type { Order } from "@/features/orders/models";
import { useCartStore } from "@/features/cart/state/cartStore";

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  getProduct: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  user: { id: "uid-1" } as { id: string } | null,
  fulfillment: "delivery",
  activeStore: {
    id: "store-A",
    name: "Outlet A",
    supports: { delivery: true, takeaway: true, dineIn: true },
  } as { id: string; name: string; supports: Record<string, boolean> } | null,
  setFulfillment: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixture.navigate,
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: fixture.toastError,
    info: fixture.toastInfo,
    success: fixture.toastSuccess,
  }),
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), notification: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/features/menu/repositories/MenuRepository", () => ({
  menuRepository: { getProduct: fixture.getProduct },
}));
vi.mock("@/features/auth/state/authStore", () => ({
  useAuthStore: { getState: () => ({ user: fixture.user }) },
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  storeSupportsFulfillment: (
    store: { supports?: Record<string, boolean> } | null,
    fulfillment: string | null,
  ) =>
    Boolean(
      store &&
        fulfillment &&
        store.supports?.[fulfillment === "dinein" ? "dineIn" : fulfillment],
    ),
  useStoreSelection: {
    getState: () => ({
      activeStore: fixture.activeStore,
      fulfillment: fixture.fulfillment,
      setFulfillment: fixture.setFulfillment,
    }),
  },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { useReorderItems, type ReorderResult } from "./useReorderItems";

type HookApi = ReturnType<typeof useReorderItems>;

function product(overrides: Partial<ProductDetails> = {}): ProductDetails {
  return {
    id: "prod-1",
    categoryId: "cat",
    name: "Big Bang Burger",
    price: 299,
    veg: true,
    inStock: true,
    customizations: [],
    ...overrides,
  } as ProductDetails;
}

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: "line-old",
    productId: "prod-1",
    storeId: "store-A",
    name: "Big Bang Burger",
    unitPrice: 299,
    quantity: 1,
    modifiers: [],
    availability: "available",
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    shortCode: "BG1",
    status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
    fulfillment: "delivery",
    store: { id: "store-A", name: "Outlet A" },
    items: [line()],
    totals: { grandTotal: 299 },
    payment: { method: "cod" },
    ...overrides,
  } as unknown as Order;
}

function Harness({ sink }: { sink: { current: HookApi | null } }) {
  sink.current = useReorderItems();
  return null;
}

function mountHooks(count = 1) {
  const sinks = Array.from({ length: count }, () => ({ current: null as HookApi | null }));
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <>
        {sinks.map((sink, index) => (
          <Harness key={index} sink={sink} />
        ))}
      </>,
    );
  });
  return {
    sinks,
    cleanup: () => act(() => root.unmount()),
  };
}

beforeEach(() => {
  fixture.user = { id: "uid-1" };
  fixture.fulfillment = "delivery";
  fixture.activeStore = {
    id: "store-A",
    name: "Outlet A",
    supports: { delivery: true, takeaway: true, dineIn: true },
  };
  fixture.getProduct.mockReset();
  fixture.setFulfillment.mockReset();
  fixture.navigate.mockReset();
  useCartStore.setState({
    lines: [],
    storeId: null,
    promo: null,
    priceLockExpiresAt: null,
    status: "empty",
    error: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useReorderItems — live validation before mutation", () => {
  it("preserves the basket when the product lookup fails", async () => {
    useCartStore.setState({ lines: [line()], storeId: "store-A", status: "ready" });
    fixture.getProduct.mockResolvedValue(fail("MENU_FETCH_FAILED", "offline"));
    const { sinks, cleanup } = mountHooks();

    let result: ReorderResult | undefined;
    await act(async () => {
      result = await sinks[0].current!.reorder(order());
    });

    expect(result).toMatchObject({ success: false, addedCount: 0, reason: "lookup_failed" });
    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(useCartStore.getState().lines[0].lineId).toBe("line-old");
    expect(fixture.navigate).not.toHaveBeenCalled();
    cleanup();
  });

  it("treats a REJECTED lookup promise as a controlled failure, not an unhandled rejection", async () => {
    useCartStore.setState({ lines: [line()], storeId: "store-A", status: "ready" });
    fixture.getProduct.mockRejectedValue(new Error("network down"));
    const { sinks, cleanup } = mountHooks();

    let result: ReorderResult | undefined;
    await act(async () => {
      result = await sinks[0].current!.reorder(order());
    });

    expect(result).toMatchObject({ success: false, reason: "lookup_failed" });
    expect(useCartStore.getState().lines[0].lineId).toBe("line-old");
    expect(fixture.toastError).toHaveBeenCalledWith(
      expect.stringContaining("Your cart is unchanged"),
    );

    // The fence is released: a later attempt is not "in_progress".
    fixture.getProduct.mockResolvedValue(ok(product()));
    let second: ReorderResult | undefined;
    await act(async () => {
      second = await sinks[0].current!.reorder(order());
    });
    expect(second).toMatchObject({ success: true, addedCount: 1 });
    cleanup();
  });

  it("reads product details for the order's products only (never a catalogue scan)", async () => {
    fixture.getProduct.mockResolvedValue(ok(product({ id: "prod-1" })));
    const { sinks, cleanup } = mountHooks();

    await act(async () => {
      await sinks[0].current!.reorder(
        order({ items: [line(), line({ lineId: "line-2", productId: "prod-1" })] }),
      );
    });

    expect(fixture.getProduct).toHaveBeenCalledTimes(1);
    expect(fixture.getProduct).toHaveBeenCalledWith("prod-1", "store-A");
    cleanup();
  });

  it("requires confirmation before replacing another outlet's basket, and cancel preserves it", async () => {
    useCartStore.setState({ lines: [line({ storeId: "store-B" })], storeId: "store-B", status: "ready" });
    fixture.getProduct.mockResolvedValue(ok(product()));

    const { sinks, cleanup } = mountHooks();
    let result: ReorderResult | undefined;
    await act(async () => {
      result = await sinks[0].current!.reorder(order());
    });

    expect(result).toMatchObject({ reason: "requires_confirmation" });
    expect(sinks[0].current!.pendingConfirmation).toMatchObject({ replacesCart: true });
    // Nothing reset yet: the old basket is intact while the customer decides.
    expect(useCartStore.getState().storeId).toBe("store-B");
    expect(useCartStore.getState().lines[0].lineId).toBe("line-old");

    act(() => sinks[0].current!.cancelPendingReorder());

    expect(sinks[0].current!.pendingConfirmation).toBeNull();
    expect(useCartStore.getState().storeId).toBe("store-B");
    expect(useCartStore.getState().lines).toHaveLength(1);
    cleanup();
  });

  it("shows price changes before adding and applies the live price on confirm", async () => {
    fixture.getProduct
      .mockResolvedValue(ok(product({ price: 329 })));

    const { sinks, cleanup } = mountHooks();

    let result: ReorderResult | undefined;
    await act(async () => {
      result = await sinks[0].current!.reorder(order());
    });

    expect(result).toMatchObject({ reason: "requires_confirmation" });
    expect(sinks[0].current!.pendingConfirmation?.priceChanges).toEqual([
      { name: "Big Bang Burger", previousUnitPrice: 299, nextUnitPrice: 329 },
    ]);
    expect(useCartStore.getState().lines).toHaveLength(0);

    await act(async () => {
      await sinks[0].current!.confirmPendingReorder();
    });

    const lines = useCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPrice).toBe(329);
    expect(lines[0].lineId).not.toBe("line-old");
    cleanup();
  });

  it("re-reads details at confirmation and re-prompts when the price changed AGAIN", async () => {
    fixture.getProduct
      .mockResolvedValueOnce(ok(product({ price: 329 })))
      .mockResolvedValueOnce(ok(product({ price: 349 })))
      .mockResolvedValueOnce(ok(product({ price: 349 })));

    const { sinks, cleanup } = mountHooks();

    await act(async () => {
      await sinks[0].current!.reorder(order());
    });
    expect(sinks[0].current!.pendingConfirmation?.priceChanges).toEqual([
      { name: "Big Bang Burger", previousUnitPrice: 299, nextUnitPrice: 329 },
    ]);

    // The dialog sat open; the price moved to 349 in the meantime.
    await act(async () => {
      await sinks[0].current!.confirmPendingReorder();
    });

    // Nothing added, and the dialog now shows the NEW number.
    expect(useCartStore.getState().lines).toHaveLength(0);
    expect(sinks[0].current!.pendingConfirmation?.priceChanges).toEqual([
      { name: "Big Bang Burger", previousUnitPrice: 299, nextUnitPrice: 349 },
    ]);
    expect(fixture.toastInfo).toHaveBeenCalledWith(expect.stringContaining("changed again"));

    // Confirming the updated figure re-validates once more and then adds.
    await act(async () => {
      await sinks[0].current!.confirmPendingReorder();
    });

    expect(fixture.getProduct).toHaveBeenCalledTimes(3);
    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(useCartStore.getState().lines[0].unitPrice).toBe(349);
    cleanup();
  });

  it("preserves the basket and explains when the confirmation re-read fails", async () => {
    fixture.getProduct
      .mockResolvedValueOnce(ok(product({ price: 329 })))
      .mockResolvedValueOnce(fail("OFFLINE", "offline"));

    const { sinks, cleanup } = mountHooks();

    await act(async () => {
      await sinks[0].current!.reorder(order());
    });
    expect(sinks[0].current!.pendingConfirmation).not.toBeNull();

    let confirmed: unknown;
    await act(async () => {
      confirmed = await sinks[0].current!.confirmPendingReorder();
    });

    expect(confirmed).toBeUndefined();
    expect(sinks[0].current!.pendingConfirmation).toBeNull();
    expect(useCartStore.getState().lines).toHaveLength(0);
    expect(fixture.toastError).toHaveBeenCalledWith(
      expect.stringContaining("Your cart is unchanged"),
    );

    // Fence released for a new attempt (not reported as in_progress).
    fixture.getProduct.mockResolvedValue(ok(product({ price: 349 })));
    let second: ReorderResult | undefined;
    await act(async () => {
      second = await sinks[0].current!.reorder(order());
    });
    expect(second?.reason).not.toBe("in_progress");
    cleanup();
  });

  it("preserves the basket and opens the review when an item goes out of stock at confirmation", async () => {
    fixture.getProduct
      .mockResolvedValueOnce(ok(product({ price: 329 })))
      .mockResolvedValueOnce(ok(product({ price: 329, inStock: false })));

    const { sinks, cleanup } = mountHooks();

    await act(async () => {
      await sinks[0].current!.reorder(order());
    });

    await act(async () => {
      await sinks[0].current!.confirmPendingReorder();
    });

    expect(useCartStore.getState().lines).toHaveLength(0);
    expect(sinks[0].current!.pendingConfirmation).toBeNull();
    expect(sinks[0].current!.outOfStockModal.isOpen).toBe(true);
    expect(sinks[0].current!.outOfStockModal.unavailableItems[0]).toContain("out of stock");
    cleanup();
  });

  it("rejects a retired variation with a visible explanation instead of substituting", async () => {
    fixture.getProduct.mockResolvedValue(
      ok(
        product({
          customizations: [
            {
              id: "size",
              name: "Size",
              selection: "single",
              options: [{ id: "large", name: "Large", priceDelta: 40 }],
            },
          ],
        }),
      ),
    );

    const { sinks, cleanup } = mountHooks();
    let result: ReorderResult | undefined;
    await act(async () => {
      result = await sinks[0].current!.reorder(
        order({
          items: [
            line({
              modifiers: [
                { groupId: "size", groupName: "Size", optionId: "regular", name: "Regular", priceDelta: 0 },
              ],
            }),
          ],
        }),
      );
    });

    expect(result).toMatchObject({ success: false, reason: "nothing_available" });
    expect(sinks[0].current!.outOfStockModal.unavailableItems[0]).toContain("size/variation");
    expect(useCartStore.getState().lines).toHaveLength(0);
    cleanup();
  });

  it("never copies an old line note into the new order", async () => {
    fixture.getProduct.mockResolvedValue(ok(product()));
    const { sinks, cleanup } = mountHooks();

    await act(async () => {
      await sinks[0].current!.reorder(order({ items: [line({ notes: "old note: no onion" })] }));
    });

    const [added] = useCartStore.getState().lines;
    expect(added.notes).toBeUndefined();
    cleanup();
  });

  it("never forces the past order's fulfilment mode", async () => {
    fixture.fulfillment = "takeaway";
    fixture.getProduct.mockResolvedValue(ok(product()));
    const { sinks, cleanup } = mountHooks();

    await act(async () => {
      await sinks[0].current!.reorder(order({ fulfillment: "delivery" }));
    });

    expect(fixture.setFulfillment).not.toHaveBeenCalled();
    cleanup();
  });

  it("adds exactly once across two hook instances and a double tap", async () => {
    fixture.getProduct.mockResolvedValue(ok(product()));
    const { sinks, cleanup } = mountHooks(2);

    let results: ReorderResult[] = [];
    await act(async () => {
      results = await Promise.all([
        sinks[0].current!.reorder(order()),
        sinks[1].current!.reorder(order()),
      ]);
    });

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => result.reason === "in_progress")).toHaveLength(1);
    expect(fixture.getProduct).toHaveBeenCalledTimes(1);
    expect(useCartStore.getState().lines).toHaveLength(1);
    cleanup();
  });

  it("holds the cross-hook fence through the open confirmation dialog", async () => {
    fixture.getProduct.mockResolvedValue(ok(product({ price: 329 })));
    const { sinks, cleanup } = mountHooks(2);

    await act(async () => {
      await sinks[0].current!.reorder(order());
    });
    expect(sinks[0].current!.pendingConfirmation).not.toBeNull();

    let blocked: ReorderResult | undefined;
    await act(async () => {
      blocked = await sinks[1].current!.reorder(order({ id: "order-2" }));
    });
    expect(blocked).toMatchObject({ success: false, reason: "in_progress" });
    cleanup();
  });

  it("adds exactly once when the confirmation is double-tapped", async () => {
    fixture.getProduct.mockResolvedValue(ok(product({ price: 329 })));
    const { sinks, cleanup } = mountHooks();

    await act(async () => {
      await sinks[0].current!.reorder(order());
    });

    await act(async () => {
      await Promise.all([
        sinks[0].current!.confirmPendingReorder(),
        sinks[0].current!.confirmPendingReorder(),
      ]);
    });

    expect(useCartStore.getState().lines).toHaveLength(1);
    cleanup();
  });

  it("aborts a stale response when the account changes mid-lookup", async () => {
    let resolveDetails!: (value: unknown) => void;
    fixture.getProduct.mockReturnValue(
      new Promise((resolve) => {
        resolveDetails = resolve;
      }),
    );
    const { sinks, cleanup } = mountHooks();

    let pending!: Promise<ReorderResult>;
    act(() => {
      pending = sinks[0].current!.reorder(order());
    });
    // Account switch while the lookup is in flight.
    fixture.user = { id: "uid-2" };

    let result: ReorderResult | undefined;
    await act(async () => {
      resolveDetails(ok(product()));
      result = await pending;
    });

    expect(result).toMatchObject({ success: false, reason: "aborted" });
    expect(useCartStore.getState().lines).toHaveLength(0);
    cleanup();
  });

  it("aborts when the basket changes while the lookup is in flight", async () => {
    let resolveDetails!: (value: unknown) => void;
    fixture.getProduct.mockReturnValue(
      new Promise((resolve) => {
        resolveDetails = resolve;
      }),
    );
    const { sinks, cleanup } = mountHooks();

    let pending!: Promise<ReorderResult>;
    act(() => {
      pending = sinks[0].current!.reorder(order());
    });
    useCartStore.setState({
      lines: [line({ lineId: "line-new", storeId: "store-A" })],
      storeId: "store-A",
      status: "ready",
    });

    let result: ReorderResult | undefined;
    await act(async () => {
      resolveDetails(ok(product()));
      result = await pending;
    });

    expect(result).toMatchObject({ success: false, reason: "aborted" });
    expect(useCartStore.getState().lines.map((entry) => entry.lineId)).toEqual(["line-new"]);
    cleanup();
  });

  it("aborts an in-flight validation after unmount and leaves a usable fence", async () => {
    let resolveDetails!: (value: unknown) => void;
    fixture.getProduct.mockReturnValue(
      new Promise((resolve) => {
        resolveDetails = resolve;
      }),
    );
    const first = mountHooks();

    let pending!: Promise<ReorderResult>;
    act(() => {
      pending = first.sinks[0].current!.reorder(order());
    });

    // The screen (dialog included) goes away mid-lookup.
    first.cleanup();

    let result: ReorderResult | undefined;
    await act(async () => {
      resolveDetails(ok(product()));
      result = await pending;
    });

    expect(result).toMatchObject({ success: false, reason: "aborted" });
    expect(useCartStore.getState().lines).toHaveLength(0);

    // A fresh hook is not locked out by the dead instance's token.
    fixture.getProduct.mockResolvedValue(ok(product()));
    const second = mountHooks();
    let next: ReorderResult | undefined;
    await act(async () => {
      next = await second.sinks[0].current!.reorder(order());
    });
    expect(next).toMatchObject({ success: true, addedCount: 1 });
    second.cleanup();
  });

  it("releases the pending confirmation token when the dialog unmounts", async () => {
    fixture.getProduct.mockResolvedValue(ok(product({ price: 329 })));
    const first = mountHooks();

    await act(async () => {
      await first.sinks[0].current!.reorder(order());
    });
    expect(first.sinks[0].current!.pendingConfirmation).not.toBeNull();

    first.cleanup();
    expect(useCartStore.getState().lines).toHaveLength(0);

    // Without the cleanup the module-level pendingToken would report
    // "in_progress" forever and this would never add.
    fixture.getProduct.mockResolvedValue(ok(product()));
    const second = mountHooks();
    let result: ReorderResult | undefined;
    await act(async () => {
      result = await second.sinks[0].current!.reorder(order({ id: "order-2" }));
    });

    expect(result).toMatchObject({ success: true, addedCount: 1 });
    expect(useCartStore.getState().lines).toHaveLength(1);
    second.cleanup();
  });

  it("reports every changed price before adding anything", async () => {
    fixture.getProduct
      .mockResolvedValueOnce(ok(product({ id: "prod-1", price: 319 })))
      .mockResolvedValueOnce(ok(product({ id: "prod-2", name: "Loaded Fries", price: 159 })));

    const { sinks, cleanup } = mountHooks();
    let result: ReorderResult | undefined;
    await act(async () => {
      result = await sinks[0].current!.reorder(
        order({
          items: [
            line({ lineId: "l1", productId: "prod-1" }),
            line({ lineId: "l2", productId: "prod-2", name: "Loaded Fries", unitPrice: 149 }),
          ],
        }),
      );
    });

    expect(result).toMatchObject({ reason: "requires_confirmation" });
    expect(sinks[0].current!.pendingConfirmation?.priceChanges.map((change) => change.name)).toEqual([
      "Big Bang Burger",
      "Loaded Fries",
    ]);
    expect(useCartStore.getState().lines).toHaveLength(0);
    act(() => sinks[0].current!.cancelPendingReorder());
    cleanup();
  });

  it("keeps the out-of-stock review flow and revalidates fresh before adding the rest", async () => {
    fixture.getProduct
      // First pass: prod-1 is 86ed, prod-2 is fine.
      .mockResolvedValueOnce(ok(product({ id: "prod-1", inStock: false })))
      .mockResolvedValueOnce(ok(product({ id: "prod-2", name: "Loaded Fries", price: 149 })))
      // Fresh revalidation of the remainder only.
      .mockResolvedValueOnce(ok(product({ id: "prod-2", name: "Loaded Fries", price: 149 })));

    const { sinks, cleanup } = mountHooks();
    let first: ReorderResult | undefined;
    await act(async () => {
      first = await sinks[0].current!.reorder(
        order({
          items: [
            line({ lineId: "l1", productId: "prod-1" }),
            line({ lineId: "l2", productId: "prod-2", name: "Loaded Fries", unitPrice: 149 }),
          ],
        }),
      );
    });

    expect(first).toMatchObject({ success: false, reason: "nothing_available" });
    expect(sinks[0].current!.outOfStockModal.isOpen).toBe(true);
    expect(sinks[0].current!.outOfStockModal.unavailableItems[0]).toContain("out of stock");
    expect(useCartStore.getState().lines).toHaveLength(0);

    await act(async () => {
      await sinks[0].current!.confirmReorderRemaining();
    });

    // One fresh read for the single remaining product, then the add.
    expect(fixture.getProduct).toHaveBeenCalledTimes(3);
    const added = useCartStore.getState().lines;
    expect(added).toHaveLength(1);
    expect(added[0].productId).toBe("prod-2");
    cleanup();
  });

  it("adds nothing when the out-of-stock review is dismissed and releases the fence", async () => {
    fixture.getProduct
      .mockResolvedValueOnce(ok(product({ id: "prod-1", inStock: false })))
      .mockResolvedValueOnce(ok(product({ id: "prod-1", inStock: true })));

    const { sinks, cleanup } = mountHooks();
    await act(async () => {
      await sinks[0].current!.reorder(order());
    });
    expect(sinks[0].current!.outOfStockModal.isOpen).toBe(true);

    act(() => sinks[0].current!.dismissOutOfStockModal());
    expect(sinks[0].current!.outOfStockModal.isOpen).toBe(false);
    expect(useCartStore.getState().lines).toHaveLength(0);

    // Fence released: a later attempt is not reported as "in_progress".
    let second: ReorderResult | undefined;
    await act(async () => {
      second = await sinks[0].current!.reorder(order());
    });
    expect(second).toMatchObject({ success: true, addedCount: 1 });
    cleanup();
  });
});

describe("useReorderItems — the CURRENT outlet decides", () => {
  it("refuses a past order from another outlet without reading or adding anything", async () => {
    fixture.activeStore = {
      id: "store-B",
      name: "Outlet B",
      supports: { delivery: true, takeaway: true, dineIn: true },
    };
    fixture.getProduct.mockResolvedValue(ok(product()));

    const { sinks, cleanup } = mountHooks();
    let result: ReorderResult | undefined;
    await act(async () => {
      result = await sinks[0].current!.reorder(order());
    });

    expect(result).toMatchObject({ success: false, reason: "outlet_mismatch" });
    // No silent outlet switch, no scoped read against the wrong store, no add.
    expect(fixture.getProduct).not.toHaveBeenCalled();
    expect(fixture.setFulfillment).not.toHaveBeenCalled();
    expect(useCartStore.getState().lines).toHaveLength(0);
    expect(fixture.toastError).toHaveBeenCalledWith(expect.stringContaining("Switch outlet"));
    cleanup();
  });

  it("refuses when no outlet is selected instead of inventing one", async () => {
    fixture.activeStore = null;

    const { sinks, cleanup } = mountHooks();
    let result: ReorderResult | undefined;
    await act(async () => {
      result = await sinks[0].current!.reorder(order());
    });

    expect(result).toMatchObject({ success: false, reason: "outlet_mismatch" });
    expect(fixture.getProduct).not.toHaveBeenCalled();
    expect(useCartStore.getState().lines).toHaveLength(0);
    cleanup();
  });

  it("refuses a fulfilment mode the selected outlet does not support", async () => {
    fixture.activeStore = {
      id: "store-A",
      name: "Outlet A",
      supports: { delivery: true, takeaway: false, dineIn: false },
    };
    fixture.fulfillment = "takeaway";

    const { sinks, cleanup } = mountHooks();
    let result: ReorderResult | undefined;
    await act(async () => {
      result = await sinks[0].current!.reorder(order());
    });

    expect(result).toMatchObject({ success: false, reason: "unsupported_fulfillment" });
    expect(fixture.getProduct).not.toHaveBeenCalled();
    expect(fixture.setFulfillment).not.toHaveBeenCalled();
    cleanup();
  });

  it("cancels a cross-outlet basket replacement when the customer changes outlet mid-dialog", async () => {
    useCartStore.setState({ lines: [line({ storeId: "store-B" })], storeId: "store-B", status: "ready" });
    fixture.getProduct.mockResolvedValue(ok(product()));

    const { sinks, cleanup } = mountHooks();
    await act(async () => {
      await sinks[0].current!.reorder(order());
    });
    expect(sinks[0].current!.pendingConfirmation).toMatchObject({ replacesCart: true });

    // The customer switches outlet while the replacement dialog is open.
    fixture.activeStore = {
      id: "store-C",
      name: "Outlet C",
      supports: { delivery: true, takeaway: true, dineIn: true },
    };

    await act(async () => {
      await sinks[0].current!.confirmPendingReorder();
    });

    expect(sinks[0].current!.pendingConfirmation).toBeNull();
    // The store-B basket is untouched: no silent replacement.
    expect(useCartStore.getState().storeId).toBe("store-B");
    expect(useCartStore.getState().lines[0].lineId).toBe("line-old");
    expect(fixture.toastError).toHaveBeenCalledWith(
      expect.stringContaining("Review the cart and try again"),
    );
    cleanup();
  });
});

describe("useReorderItems — the CURRENT order type is bound to the attempt", () => {
  it("aborts when the order type changes during the pending lookup", async () => {
    let resolveDetails!: (value: unknown) => void;
    fixture.getProduct.mockReturnValue(
      new Promise((resolve) => {
        resolveDetails = resolve;
      }),
    );

    const { sinks, cleanup } = mountHooks();
    let pending!: Promise<ReorderResult>;
    act(() => {
      pending = sinks[0].current!.reorder(order());
    });

    // Delivery → dine-in while the catalogue read is in flight.
    fixture.fulfillment = "dinein";

    let result: ReorderResult | undefined;
    await act(async () => {
      resolveDetails(ok(product()));
      result = await pending;
    });

    expect(result).toMatchObject({ success: false, reason: "aborted" });
    expect(useCartStore.getState().lines).toHaveLength(0);
    expect(fixture.setFulfillment).not.toHaveBeenCalled();

    // Fence released: the next attempt is not reported as in_progress.
    fixture.getProduct.mockResolvedValue(ok(product()));
    let second: ReorderResult | undefined;
    await act(async () => {
      second = await sinks[0].current!.reorder(order());
    });
    expect(second).toMatchObject({ success: true, addedCount: 1 });
    cleanup();
  });

  it("cancels the price confirmation when the order type changes while it is open", async () => {
    fixture.getProduct.mockResolvedValue(ok(product({ price: 329 })));

    const { sinks, cleanup } = mountHooks();
    await act(async () => {
      await sinks[0].current!.reorder(order());
    });
    expect(sinks[0].current!.pendingConfirmation).not.toBeNull();

    // The customer switches to dine-in with the dialog still open.
    fixture.fulfillment = "dinein";

    await act(async () => {
      await sinks[0].current!.confirmPendingReorder();
    });

    expect(sinks[0].current!.pendingConfirmation).toBeNull();
    expect(useCartStore.getState().lines).toHaveLength(0);
    expect(fixture.toastError).toHaveBeenCalledWith(
      expect.stringContaining("order type"),
    );

    // Fence released for a later attempt.
    let second: ReorderResult | undefined;
    await act(async () => {
      second = await sinks[0].current!.reorder(order());
    });
    expect(second?.reason).not.toBe("in_progress");
    cleanup();
  });
});
