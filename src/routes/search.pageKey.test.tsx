/** @vitest-environment jsdom */
/**
 * UX audit 2026-11-26, Customer Medium #11 — r2 regression.
 *
 * The first page of search results must be capped at 30 for EVERY new result
 * set. The r1 page key was `${filter}|${results.length}|${results[0]?.id}`, so
 * two different queries with the same length and the same first id reused an
 * expanded count and painted every card of the second result set. Here a real
 * SearchPage render is driven through "Load more" and then through a new
 * query / kind / result identity; the card count is what is asserted, not a
 * string in the source.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TestProduct = {
  id: string;
  name: string;
  description: string;
  badges: unknown[];
  veg: boolean;
  price: number;
  imageUrl: string;
  fallbackImageUrl: string;
  customizable: boolean;
};

const harness = vi.hoisted(() => ({
  state: {
    query: "" as string,
    status: "ready" as string,
    results: [] as TestProduct[],
    suggestions: [] as unknown[],
    trending: [] as unknown[],
    recent: [] as string[],
    kind: "all" as string,
    error: undefined as string | undefined,
    activeKey: undefined as string | undefined,
    setQuery: (q: string) => {
      harness.state.query = q;
    },
    setKind: (k: string) => {
      harness.state.kind = k;
    },
    submit: () => Promise.resolve(),
    fetchSuggestions: () => Promise.resolve(),
    fetchTrending: () => Promise.resolve(),
    removeRecent: () => undefined,
    clearRecent: () => undefined,
  },
  searchParams: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => harness.searchParams,
  }),
  useNavigate: () => () => undefined,
}));

vi.mock("@/features/menu/state/searchStore", () => {
  const hook = (selector: (s: typeof harness.state) => unknown) => selector(harness.state);
  return { useSearchStore: Object.assign(hook, { persist: { rehydrate: () => undefined } }) };
});

vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (selector: (s: { activeStore: { id: string } }) => unknown) =>
    selector({ activeStore: { id: "store-1" } }),
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/shared/components/common/Text", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/shared/components/feedback/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/shared/components/feedback/FailureState", () => ({
  FailureState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/features/menu/components/MenuSkeleton", () => ({
  MenuSkeleton: () => <div data-testid="skeleton" />,
}));
vi.mock("@/features/menu/components/MenuProductCard", () => ({
  MenuProductCard: ({ product }: { product: TestProduct }) => (
    <div data-testid="product-card" data-id={product.id}>
      {product.name}
    </div>
  ),
}));
vi.mock("@/features/menu/components/ProductCustomizerModal", () => ({
  ProductCustomizerModal: () => null,
}));
vi.mock("@/features/cart", () => ({
  cartRepository: { addItem: vi.fn() },
  FloatingCartBar: () => null,
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/core/errors/userMessages", () => ({ toUserMessage: (x: unknown) => String(x) }));
vi.mock("@/lib/utils", () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { Route } from "./search";

const SearchPage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

function results(prefix: string): TestProduct[] {
  return Array.from({ length: 40 }, (_, i) => ({
    // The first id is deliberately shared across result sets: r1 keyed only
    // on length + first id, so those two sets looked identical to it.
    id: i === 0 ? "shared-first" : `${prefix}-${i}`,
    name: `${prefix} item ${i}`,
    description: "",
    badges: [],
    veg: true,
    price: 100,
    imageUrl: "",
    fallbackImageUrl: "",
    customizable: false,
  }));
}

let host: HTMLDivElement;
let root: Root | null = null;

const cards = () => host.querySelectorAll('[data-testid="product-card"]');

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<SearchPage />);
  });
}

async function rerender() {
  await act(async () => {
    root!.render(<SearchPage />);
  });
}

async function loadMore() {
  const button = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.startsWith("Load more"),
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  harness.searchParams = {};
  Object.assign(harness.state, {
    query: "first term",
    status: "ready",
    results: results("A"),
    suggestions: [],
    trending: [],
    recent: [],
    kind: "all",
    error: undefined,
    activeKey: undefined,
  });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Search page key — a new result set always starts at 30 cards", () => {
  it("resets when a different query has the same length and first id", async () => {
    await render();
    expect(cards()).toHaveLength(30);
    await loadMore();
    expect(cards()).toHaveLength(40); // expanded to 60; 40 exist

    harness.state.query = "second term";
    harness.state.results = results("B");
    await rerender();

    expect(cards()).toHaveLength(30);
  });

  it("resets when the same query yields different result ids", async () => {
    await render();
    await loadMore();
    expect(cards()).toHaveLength(40);

    harness.state.results = results("C");
    await rerender();

    expect(cards()).toHaveLength(30);
  });

  it("resets when the kind tab changes", async () => {
    await render();
    await loadMore();
    expect(cards()).toHaveLength(40);

    harness.state.kind = "combo";
    await rerender();

    expect(cards()).toHaveLength(30);
  });
});
