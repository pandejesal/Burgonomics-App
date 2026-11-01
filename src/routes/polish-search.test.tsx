/**
 * Polish regression: the search field must pin below the 56px top bar (and its
 * focus scroll margin must keep it visible), while the active diet chip uses
 * the semantic accent pair instead of raw #FF6600.
 *
 * Synthetic fixtures only; no live data or network calls.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchState: {
    query: "",
    status: "idle",
    results: [] as Array<Record<string, unknown>>,
    suggestions: [] as Array<Record<string, unknown>>,
    recent: ["paneer"],
    trending: [{ id: "trend_1", label: "Fries", kind: "product" }],
    kind: "all",
    error: undefined,
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => ({ filter: "spicy" }),
  }),
  useNavigate: () => fixture.navigate,
  useSearch: () => ({ filter: "spicy" }),
  Link: ({
    to,
    className,
    children,
  }: {
    to: string;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({ activeStore: { id: "store_1" } }),
}));
vi.mock("@/features/menu/state/searchStore", () => {
  const actions = {
    setQuery: vi.fn(),
    setKind: vi.fn(),
    submit: vi.fn(async () => {}),
    fetchSuggestions: vi.fn(async () => {}),
    fetchTrending: vi.fn(async () => {}),
    removeRecent: vi.fn(),
    clearRecent: vi.fn(),
  };
  const useSearchStore = (select: (state: unknown) => unknown) =>
    select({ ...fixture.searchState, ...actions });
  return {
    useSearchStore: Object.assign(useSearchStore, {
      persist: { rehydrate: vi.fn() },
    }),
    ...actions,
  };
});
vi.mock("@/features/cart", () => ({
  cartRepository: { addItem: vi.fn() },
  FloatingCartBar: () => null,
}));
vi.mock("@/features/menu/components/MenuProductCard", () => ({
  MenuProductCard: () => null,
}));
vi.mock("@/features/menu/components/ProductCustomizerModal", () => ({
  ProductCustomizerModal: () => null,
}));
vi.mock("@/features/menu/components/MenuSkeleton", () => ({
  MenuSkeleton: () => null,
}));
vi.mock("@/shared/components/feedback/EmptyState", () => ({
  EmptyState: () => null,
}));
vi.mock("@/shared/components/feedback/FailureState", () => ({
  FailureState: () => null,
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn() },
}));

import { Route as SearchRoute } from "./search";

const SearchPage = (SearchRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fixture.navigate.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => root.render(<SearchPage />));
  await act(async () => {});
}

const classTokens = (node: Element) => node.className.split(/\s+/);

describe("search sticky header and accent tokens", () => {
  it("pins the search form below the 56px top bar and keeps a focus scroll margin", async () => {
    await mount();

    const form = container.querySelector("form");
    expect(form, "search form").not.toBeNull();
    const formTokens = classTokens(form!);
    expect(formTokens).toContain("sticky");
    expect(formTokens).toContain("top-[calc(3.5rem+env(safe-area-inset-top,0px))]");
    expect(formTokens).toContain("scroll-mt-[calc(3.5rem+env(safe-area-inset-top,0px))]");
    expect(formTokens).not.toContain("top-0");

    const input = container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input, "search input").not.toBeNull();
    expect(classTokens(input!)).toContain("scroll-mt-[calc(3.5rem+env(safe-area-inset-top,0px))]");
  });

  it("renders the active diet chip and text links with semantic accent tokens", async () => {
    await mount();

    const spicy = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "Spicy",
    );
    expect(spicy, "active Spicy chip").toBeDefined();
    expect(classTokens(spicy!)).toEqual(
      expect.arrayContaining(["bg-primary", "text-primary-foreground", "border-primary"]),
    );

    const clearAll = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "Clear all",
    );
    expect(clearAll, "Clear all button").toBeDefined();
    expect(classTokens(clearAll!)).toEqual(
      expect.arrayContaining(["text-primary-text", "min-h-11"]),
    );

    await act(async () => clearAll!.click());
    // The mocked store actions are the seam; the control must drive the real one.
    const searchStore = (await import("@/features/menu/state/searchStore")) as unknown as {
      clearRecent: { mock: { calls: unknown[] } };
    };
    expect(searchStore.clearRecent.mock.calls).toHaveLength(1);
    expect(container.innerHTML).not.toContain("#FF6600");
    expect(container.innerHTML).not.toContain("#e05a00");
  });

  it("clears the diet filter through All Items in the horizontal filter strip", async () => {
    await mount();

    const anyDietChip = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "All Items",
    );
    expect(anyDietChip, "All Items chip").toBeDefined();
    expect(classTokens(anyDietChip!)).toContain("min-h-11");
    await act(async () => anyDietChip!.click());
    expect(fixture.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/search", replace: true }),
    );
    const navigation = fixture.navigate.mock.calls.at(-1)![0];
    expect(navigation.search({ filter: "spicy" }).filter).toBeUndefined();

    const scrollContainer = anyDietChip!.closest(".overflow-x-auto");
    expect(scrollContainer, "diet chips horizontal scroll container").not.toBeNull();
    expect(scrollContainer!.className).toContain("overflow-x-auto");
    expect(scrollContainer!.querySelectorAll("button").length).toBeGreaterThan(1);
  });
});
