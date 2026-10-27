/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  results: [
    {
      id: "prod_burger",
      name: "Classic Burger",
      description: "Smashed patty, house sauce",
      price: 199,
      veg: true,
      customizable: false,
      imageUrl: null,
      fallbackImageUrl: null,
      badges: [],
    },
    {
      id: "prod_shake",
      name: "Choco Shake",
      description: "Cold and thick",
      price: 149,
      veg: true,
      customizable: false,
      imageUrl: null,
      fallbackImageUrl: null,
      badges: [],
    },
  ],
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (opts: Record<string, unknown>) => ({
    ...opts,
    options: opts,
    _$path: path,
    useSearch: () => ({ filter: "jain" }),
  }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(async () => {}), selection: vi.fn(), notification: vi.fn() },
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (s: unknown) => unknown) =>
    select({ activeStore: { id: "str_search", name: "Vesu Outlet" } }),
}));
vi.mock("@/features/menu/state/searchStore", () => {
  const state = {
    query: "burger",
    status: "ready",
    results: fixture.results,
    suggestions: [],
    recent: [],
    trending: [],
    kind: "all",
    error: null,
    setQuery: vi.fn(),
    setKind: vi.fn(),
    submit: vi.fn(async () => {}),
    fetchSuggestions: vi.fn(async () => {}),
    fetchTrending: vi.fn(async () => {}),
    removeRecent: vi.fn(),
    clearRecent: vi.fn(),
    persist: { rehydrate: vi.fn() },
  };
  return { useSearchStore: Object.assign((select: (s: typeof state) => unknown) => select(state), {
    persist: state.persist,
  }) };
});
vi.mock("@/features/cart", () => ({
  cartRepository: { addItem: vi.fn(async () => ({ success: true })) },
  FloatingCartBar: () => null,
}));
vi.mock("@/features/menu/components/MenuSkeleton", () => ({ MenuSkeleton: () => null }));
vi.mock("@/features/menu/components/MenuProductCard", () => ({
  MenuProductCard: ({ product }: { product: { name: string } }) => <div>{product.name}</div>,
}));
vi.mock("@/features/menu/components/ProductCustomizerModal", () => ({
  ProductCustomizerModal: () => null,
}));

import { Route as SearchRoute } from "./search";

const SearchPage = (SearchRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => root.render(<SearchPage />));
}

describe("search empty diet-filter copy", () => {
  it("names the active diet filter honestly and clears it for real results", async () => {
    await mount();

    expect(container.textContent).toContain("No matching items for this diet filter");
    expect(container.textContent).toContain(
      "Try selecting 'Any Diet' or a different diet filter tag.",
    );
    expect(container.textContent).not.toContain("'All Items'");
    expect(container.textContent).not.toContain("Classic Burger");

    const clearFilter = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Clear Filter"),
    );
    expect(clearFilter).toBeDefined();
    await act(async () => clearFilter!.click());

    expect(container.textContent).toContain("Classic Burger");
    expect(fixture.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/search",
        search: expect.any(Function),
      }),
    );
    const navigateArg = fixture.navigate.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(navigateArg.search({ filter: "jain" })).toEqual(
      expect.objectContaining({ filter: undefined }),
    );
  });
});
