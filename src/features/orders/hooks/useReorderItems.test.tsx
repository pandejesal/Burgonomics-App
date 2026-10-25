/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  const reset = vi.fn();
  const addLine = vi.fn();
  const revalidateWithProducts = vi.fn(() => ({ messages: [] as string[] }));
  const cartState = {
    lines: [] as unknown[],
    storeId: null as string | null,
    addLine,
    reset,
    revalidateWithProducts,
  };
  const listProducts = vi.fn();
  const navigate = vi.fn();
  return { cartState, reset, addLine, revalidateWithProducts, listProducts, navigate };
});

vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: Object.assign(
    (select: (s: typeof mocks.cartState) => unknown) => select(mocks.cartState),
    { getState: () => mocks.cartState },
  ),
}));

vi.mock("@/features/menu/repositories/MenuRepository", () => ({
  menuRepository: { listProducts: mocks.listProducts },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), notification: vi.fn(), selection: vi.fn() },
}));

import { useReorderItems, type ReorderResult } from "./useReorderItems";

const order = {
  id: "ord_reorder_1",
  store: { id: "store_B", name: "Store B" },
  items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 100 }],
} as never;

const catalog = (inStock: boolean) => ({
  success: true as const,
  data: {
    items: [{ id: "p1", name: "Burger", price: 100, inStock, tags: [], badges: [] }],
    page: 1,
    pageSize: 1000,
    total: 1,
  },
});

let hook: ReturnType<typeof useReorderItems> | null = null;
function Harness() {
  hook = useReorderItems();
  return null;
}

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  mocks.cartState.lines = [];
  mocks.cartState.storeId = null;
  mocks.reset.mockClear();
  mocks.addLine.mockClear();
  mocks.revalidateWithProducts.mockClear();
  mocks.listProducts.mockReset();
  mocks.navigate.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(React.createElement(Harness)));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function reorder() {
  let result: ReorderResult = { success: false, addedCount: 0, outOfStockItems: [] };
  await act(async () => {
    result = await hook!.reorder(order);
  });
  return result;
}

describe("useReorderItems — cross-store cart protection", () => {
  it("does not clear another store's cart when the confirmation is declined", async () => {
    mocks.cartState.lines = [{ lineId: "line_a", productId: "p9", quantity: 1 }];
    mocks.cartState.storeId = "store_A";
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const result = await reorder();

    expect(result.success).toBe(false);
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.addLine).not.toHaveBeenCalled();
    expect(mocks.listProducts).not.toHaveBeenCalled();
  });

  it("clears the other store's cart only after the customer confirms", async () => {
    mocks.cartState.lines = [{ lineId: "line_a", productId: "p9", quantity: 1 }];
    mocks.cartState.storeId = "store_A";
    mocks.listProducts.mockResolvedValue(catalog(true));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const result = await reorder();

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.reset).toHaveBeenCalledWith("store_B");
    expect(result.success).toBe(true);
    expect(mocks.addLine).toHaveBeenCalledTimes(1);
  });
});

describe("useReorderItems — unavailable items", () => {
  it("surfaces the out-of-stock modal state instead of silently adding nothing", async () => {
    mocks.listProducts.mockResolvedValue(catalog(false));

    const result = await reorder();

    expect(result.success).toBe(false);
    expect(hook!.outOfStockModal.isOpen).toBe(true);
    expect(hook!.outOfStockModal.unavailableItems).toEqual(["Burger"]);
    expect(mocks.addLine).not.toHaveBeenCalled();
  });
});
