/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// React act() needs this flag outside of Jest.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// Standalone mount: TanStack's route object dereferences the router context,
// which does not exist outside a <RouterProvider>.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    createFileRoute: (path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      _$path: path,
    }),
  };
});

vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-route">{children}</div>
  ),
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/shared/components/common/SafeImage", () => ({
  SafeImage: () => null,
}));

vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn(), notification: vi.fn() },
}));

vi.mock("@/core/errors/userMessages", () => ({
  toUserMessage: (res: { error?: { message?: string } }) => res.error?.message ?? "error",
}));

const favorites = [
  {
    id: "fav_1",
    kind: "product",
    refId: "p1",
    name: "Ghost Burger",
    priceLabel: "₹199 — as saved",
    imageUrl: undefined,
    fallbackImageUrl: undefined,
  },
];

vi.mock("@/features/favorites/state/favoritesStore", () => ({
  useFavoritesStore: (selector: (s: { items: typeof favorites }) => unknown) =>
    selector({ items: favorites }),
}));

vi.mock("@/features/favorites/repositories/FavoritesRepository", () => ({
  favoritesRepository: { remove: vi.fn(async () => undefined) },
}));

const addItem = vi.hoisted(() =>
  vi.fn(async (input: { productId: string; storeId: string; unitPrice: number }) => ({
    success: true as const,
    data: { lineId: "line_test", ...input },
  })),
);
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { addItem: (input: { productId: string; storeId: string; unitPrice: number }) =>
    addItem(input) },
}));

const listProducts = vi.hoisted(() => vi.fn());
vi.mock("@/features/menu/repositories/MenuRepository", () => ({
  menuRepository: { listProducts: listProducts },
}));

vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (selector: (s: { activeStore: unknown }) => unknown) =>
    selector({ activeStore: { id: "store_demo" } }),
}));

// Imported AFTER the mocks so the route wires the mocked modules.
import { Route } from "./profile.favorites";
import { toast } from "sonner";

const Page = Route.options.component as () => React.ReactElement;

const product = (id: string, inStock: boolean, price: number) => ({
  id,
  name: id,
  price,
  inStock,
  veg: true,
  imageUrl: undefined,
  fallbackImageUrl: undefined,
});

/** Full catalog payload helpers keep listProducts' shape honest. */
const catalog = (items: unknown[]) => ({
  success: true as const,
  data: { items, page: 1, pageSize: 1000, total: items.length },
});

beforeEach(() => {
  addItem.mockClear();
  listProducts.mockReset();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

async function mountAndClickQuickAdd() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: ReturnType<typeof createRoot> | null = null;
  await act(async () => {
    root = createRoot(container);
    (root as ReturnType<typeof createRoot>).render(<Page />);
  });
  const button = container.querySelector<HTMLButtonElement>('[data-testid="quick-add-fav_1"]');
  expect(button).not.toBeNull();
  await act(async () => {
    button!.click();
  });
  (root as unknown as { unmount: () => void }).unmount();
  container.remove();
  return vi.mocked(toast.error).mock.calls;
}

describe("profile.favorites quick-add — store-scoped live-catalog gate (claim B)", () => {
  it("refuses when the store-scoped catalog does not contain the product", async () => {
    listProducts.mockResolvedValue(catalog([]));

    const errors = await mountAndClickQuickAdd();

    expect(addItem).not.toHaveBeenCalled();
    expect(errors[0]?.[0]).toEqual(expect.stringContaining("not available right now"));
  });

  it("refuses an explicitly 86ed product even with a saved price label", async () => {
    listProducts.mockResolvedValue(catalog([product("p1", false, 199)]));

    const errors = await mountAndClickQuickAdd();

    expect(addItem).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
  });

  it("refuses a catalog fetch failure — availability unknown is not sellable", async () => {
    listProducts.mockResolvedValue({ success: false, error: { code: "MENU", message: "down" } });

    const errors = await mountAndClickQuickAdd();

    expect(addItem).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
  });

  it("charges the LIVE catalog price, never the saved priceLabel (positive control)", async () => {
    // Saved label says ₹199; live price is 259 — the charged price must be 259.
    listProducts.mockResolvedValue(catalog([product("p1", true, 259)]));

    await mountAndClickQuickAdd();

    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem.mock.calls[0][0]).toMatchObject({
      productId: "p1",
      storeId: "store_demo",
      unitPrice: 259,
    });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Ghost Burger"));
  });

  it("never consults the unscoped getProduct getter for eligibility", async () => {
    // Byte-level pin on the shipped route source: eligibility must flow
    // through the scoped listProducts lookup, not through getProduct (which
    // is not store-scoped and would let a cross-outlet favourite resolve
    // another branch's document).
    const source = readFileSync(
      path.join(process.cwd(), "src/routes/profile.favorites.tsx"),
      "utf8",
    );
    expect(source).not.toContain("getProduct");
    expect(source).toContain("listProducts");
  });
});
