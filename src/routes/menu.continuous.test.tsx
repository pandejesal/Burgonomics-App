/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/features/menu/models";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Continuous menu page: every real category renders in one natural vertical
 * flow, the rail jumps instead of replacing panels, and the URL only ever
 * drives position (never the other way around).
 *
 * Only the repository seam and the heavy leaf components are mocked — the real
 * route, store, section and rail all run.
 */

const fixture = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  activeStoreId: "store-1",
  navigate: vi.fn(),
  addItem: vi.fn(),
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  getProduct: vi.fn(),
  subscribeCategories: vi.fn(() => () => {}),
  subscribeStoreProducts: vi.fn(() => () => {}),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => fixture.search,
    useParams: () => ({}),
  }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children, rightSlot }: { children: React.ReactNode; rightSlot?: React.ReactNode }) => (
    <main>
      {rightSlot}
      {children}
    </main>
  ),
}));

vi.mock("@/features/stores/state/storeStore", () => {
  // Stable selection object per store id: a fresh object per call would re-run
  // the route's load effect on every render (real zustand returns a stable store).
  const selections = new Map<string, unknown>();
  return {
    useStoreSelection: (select: (state: unknown) => unknown) => {
      let selection = selections.get(fixture.activeStoreId);
      if (!selection) {
        selection = {
          activeStore: { id: fixture.activeStoreId, name: "Test Store" },
          isHydrated: true,
        };
        selections.set(fixture.activeStoreId, selection);
      }
      return select(selection);
    },
  };
});

vi.mock("@/features/cart", () => ({
  cartRepository: { addItem: fixture.addItem },
  FloatingCartBar: ({ compact }: { compact?: boolean }) => <aside data-testid="menu-cart-summary" data-compact={String(!!compact)} />,
}));

vi.mock("@/features/menu/repositories/MenuRepository", () => ({
  menuRepository: {
    listCategories: fixture.listCategories,
    listProducts: fixture.listProducts,
    getProduct: fixture.getProduct,
    subscribeCategories: fixture.subscribeCategories,
    subscribeStoreProducts: fixture.subscribeStoreProducts,
  },
}));

vi.mock("@/features/menu/services/menuService", () => ({ invalidateMenuCache: vi.fn() }));

vi.mock("@/features/menu/components/MenuProductCard", () => ({
  MenuProductCard: ({ product, onAdd }: { product: Product; onAdd?: (p: Product) => void }) => (
    <article data-testid="product-card" data-product-id={product.id}>
      <span>{product.name}</span>
      <button type="button" onClick={() => onAdd?.(product)}>
        Add {product.name}
      </button>
    </article>
  ),
}));

vi.mock("@/features/menu/components/ProductCustomizerModal", () => ({
  ProductCustomizerModal: ({
    product,
  }: {
    product: { name: string; customizations?: unknown[] };
  }) => (
    <div data-testid="customizer" data-groups={product.customizations?.length ?? 0}>
      {product.name}
    </div>
  ),
}));

vi.mock("@/shared/components/feedback/PetpoojaSyncPlaceholder", () => ({
  PetpoojaSyncPlaceholder: () => <div data-testid="sync-placeholder" />,
}));
vi.mock("@/shared/components/feedback/KitchenClosedBanner", () => ({
  KitchenClosedBanner: () => null,
}));
vi.mock("@/shared/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));
vi.mock("@/core/state/appConfigStore", () => ({
  useAppConfig: (select: (state: unknown) => unknown) => select({ isOnline: true }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn().mockResolvedValue(undefined), selection: vi.fn() },
}));

import { toast } from "sonner";
import { useMenuStore } from "@/features/menu/state/menuStore";
import { Route } from "./menu.index";

const Page = (Route as unknown as { options: { component: React.ComponentType } }).options.component;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly elements: Element[] = [];
  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(element: Element) {
    this.elements.push(element);
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  trigger(isIntersecting = true) {
    this.callback(
      this.elements.map((target) => ({ isIntersecting, target }) as unknown as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

const categories = [
  { id: "cat_a", name: "Burgers", order: 1, itemCount: 45 },
  { id: "cat_b", name: "Wraps", order: 2, itemCount: 30 },
  { id: "cat_c", name: "Sides", order: 3, itemCount: 6 },
  { id: "cat_d", name: "Drinks", order: 4, itemCount: 8 },
  { id: "cat_e", name: "Desserts", order: 5, itemCount: 4 },
];

function product(id: string, categoryId: string, overrides: Partial<Product> = {}): Product {
  return { id, categoryId, name: id, price: 100, veg: true, inStock: true, ...overrides };
}

function pageFor(categoryId: string, page: number, total: number) {
  const start = (page - 1) * 20;
  const count = Math.max(0, Math.min(20, total - start));
  return {
    success: true as const,
    data: {
      items: Array.from({ length: count }, (_, index) =>
        product(`${categoryId}-p${start + index + 1}`, categoryId),
      ),
      page,
      pageSize: 20,
      total,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });

const flush = async () => {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
  // Category jumps wait for two animation frames (afterNextPaint) before
  // measuring and scrolling.
  await nextFrame();
  await nextFrame();
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

async function renderPage() {
  await act(async () => {
    root.render(<Page />);
  });
  await act(flush);
}

async function applySearch(next: Record<string, unknown>) {
  await act(async () => {
    fixture.search = next;
    root.render(<Page />);
  });
  await act(flush);
}

function sectionFor(categoryId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-menu-category="${categoryId}"]`);
  expect(element, `missing section ${categoryId}`).not.toBeNull();
  return element!;
}

function cardCount(categoryId: string): number {
  return sectionFor(categoryId).querySelectorAll('[data-testid="product-card"]').length;
}

function chip(categoryId: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(`[data-category-id="${categoryId}"]`)!;
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeIntersectionObserver.instances = [];
  (globalThis as Record<string, unknown>).IntersectionObserver = FakeIntersectionObserver;
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });

  fixture.search = {};
  fixture.activeStoreId = "store-1";
  useMenuStore.getState().reset();

  fixture.listCategories.mockResolvedValue({ success: true, data: categories });
  fixture.addItem.mockResolvedValue({ success: true, data: {} });
  fixture.listProducts.mockImplementation(
    async (_storeId: string, categoryId: string, page: number) =>
      pageFor(categoryId, page, categories.find((category) => category.id === categoryId)!.itemCount),
  );
  fixture.getProduct.mockResolvedValue({
    success: true,
    data: {
      ...product("cat_a-p1", "cat_a", { name: "Custom Burger", customizable: true }),
      customizations: [
        { id: "g1", name: "Bun", selection: "single", required: true, minSelect: 1, maxSelect: 1, options: [] },
        { id: "g2", name: "Extras", selection: "multi", options: [] },
      ],
    },
  });

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("continuous all-category menu", () => {
  it("renders every real category heading in one natural flow, 20 items per loaded section", async () => {
    await renderPage();

    // Every category is in the page at once (not a single active panel).
    const sections = Array.from(container.querySelectorAll("[data-menu-category]"));
    expect(sections.map((section) => section.getAttribute("data-menu-category"))).toEqual([
      "cat_a",
      "cat_b",
      "cat_c",
      "cat_d",
      "cat_e",
    ]);
    const headings = Array.from(container.querySelectorAll("h2")).map((heading) => heading.textContent);
    expect(headings).toEqual(["Burgers", "Wraps", "Sides", "Drinks", "Desserts"]);

    // Visible + adjacent sections are primed; nothing else is fetched or painted.
    expect(cardCount("cat_a")).toBe(20);
    expect(cardCount("cat_b")).toBe(20);
    expect(cardCount("cat_c")).toBe(0);
    expect(container.querySelector('[role="tablist"]')).toBeNull();

    // A 45-item category does not paint 45 cards on first render.
    expect(cardCount("cat_a")).toBe(20);
    expect(
      container.querySelectorAll('[data-testid="product-card"]').length,
    ).toBeLessThan(60);
  });

  it("loads a section's first page when it scrolls into view", async () => {
    await renderPage();
    expect(cardCount("cat_c")).toBe(0);

    const observer = FakeIntersectionObserver.instances.find(
      (instance) => instance.elements[0] === sectionFor("cat_c"),
    );
    expect(observer, "no visibility observer for Sides").toBeDefined();
    await act(async () => {
      observer!.trigger(true);
    });
    await act(flush);

    expect(cardCount("cat_c")).toBe(6);
    expect(container.textContent).toContain("cat_c-p6");
  });

  it("jumps to a category after loading only the target and its neighbours", async () => {
    await renderPage();
    const callsBefore = fixture.listProducts.mock.calls.length;

    const target = sectionFor("cat_e");
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    await act(async () => {
      chip("cat_e").click();
    });
    await act(flush);

    const requested = fixture.listProducts.mock.calls
      .slice(callsBefore)
      .map((call) => call[1] as string);
    expect(requested).toContain("cat_e");
    expect(requested).toContain("cat_d");
    // Categories between the primed top and the target are NOT loaded.
    expect(requested).not.toContain("cat_c");
    expect(requested).not.toContain("cat_a");

    // The landing is computed from the section's measured position minus the
    // sticky chrome, so a heading can never be parked under the app bar.
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    const scrollArg = scrollSpy.mock.calls[0][0] as ScrollToOptions;
    // Instant positioning: a smooth animation raced the geometric correction in
    // the Android WebView and could land the heading above the sticky chrome.
    expect(scrollArg.behavior).toBe("auto");
    expect(scrollArg.top).toBeGreaterThanOrEqual(0);
    scrollSpy.mockRestore();
    // Focus follows the jump and is not hidden under the sticky chrome.
    const heading = target.querySelector("h2")!;
    expect(document.activeElement).toBe(heading);
    expect(parseInt(target.style.scrollMarginTop, 10)).toBeGreaterThanOrEqual(64);
    expect(cardCount("cat_e")).toBe(4);
    // Selecting a section never removes the others from the page.
    expect(cardCount("cat_b")).toBe(20);
  });

  it("shows an honest state for an ambiguous deep link instead of picking a category", async () => {
    fixture.listCategories.mockResolvedValue({
      success: true,
      data: [
        { id: "cat_a", name: "Cold Drinks", order: 1, itemCount: 2 },
        { id: "cat_b", name: "Cold Drinks", order: 2, itemCount: 2 },
      ],
    });
    fixture.search = { category: "Cold Drinks" };

    await renderPage();

    expect(container.textContent).toContain("More than one category matches");
    // No silent selection and no jump: an ambiguous param is reported, never
    // resolved to one of the candidates.
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("shows an honest state for an unknown deep link instead of opening the first category", async () => {
    fixture.search = { category: "beverages" };

    await renderPage();

    expect(container.textContent).toContain("We couldn't find a category called");
    expect(chip("cat_a").hasAttribute("aria-current")).toBe(true); // primed default, not a claim about the param
  });

  it("applies a deep link to the target section and canonicalises the URL to the real id", async () => {
    fixture.search = { category: "wraps" };
    await renderPage();

    const target = sectionFor("cat_b");
    expect(target).not.toBeNull();
    // navigate called with the resolved real id, replace: true.
    const call = fixture.navigate.mock.calls.at(-1)?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
      replace: boolean;
    };
    expect(call.replace).toBe(true);
    expect(call.search({ view: "grid" })).toEqual({ view: "grid", category: "cat_b" });
    expect(chip("cat_b").getAttribute("aria-current")).toBe("true");
  });

  it("follows back/forward URL changes without writing history back", async () => {
    fixture.search = { category: "cat_b" };
    await renderPage();
    expect(chip("cat_b").getAttribute("aria-current")).toBe("true");

    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    fixture.navigate.mockClear();

    await applySearch({ category: "cat_d" });

    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
    expect(chip("cat_d").getAttribute("aria-current")).toBe("true");
    // Applying the URL does not rewrite it (no feedback loop).
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it("keeps ?view= from the URL without navigating in response", async () => {
    fixture.search = { view: "list" };
    await renderPage();

    const listButton = container.querySelector<HTMLButtonElement>('[aria-label="List view"]')!;
    const gridButton = container.querySelector<HTMLButtonElement>('[aria-label="Grid view"]')!;
    expect(listButton.getAttribute("aria-pressed")).toBe("true");
    expect(gridButton.getAttribute("aria-pressed")).toBe("false");

    fixture.navigate.mockClear();
    await applySearch({ view: "grid" });
    expect(gridButton.getAttribute("aria-pressed")).toBe("true");
    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it("uses the compact floating Cart only in grid view to leave room for two product rows", async () => {
    fixture.search = { view: "list" };
    await renderPage();
    expect(container.querySelector<HTMLElement>('[data-testid="menu-cart-summary"]')!.dataset.compact).toBe("false");
    expect(container.querySelector('[aria-label="View mode"]')!.parentElement!.classList.contains("py-2")).toBe(true);
    await applySearch({ view: "grid" });
    expect(container.querySelector<HTMLElement>('[data-testid="menu-cart-summary"]')!.dataset.compact).toBe("true");
    expect(container.querySelector('[aria-label="View mode"]')!.parentElement!.classList.contains("py-1")).toBe(true);
    expect(container.querySelector('[aria-label="View mode"]')!.parentElement!.parentElement!.classList.contains("flex")).toBe(true);
    expect(fixture.addItem).not.toHaveBeenCalled();
  });

  it("never paints the previous store's sections while the new store loads", async () => {
    await renderPage();
    expect(sectionFor("cat_a")).not.toBeNull();

    fixture.listCategories.mockImplementation(async (storeId: string) => ({
      success: true,
      data:
        storeId === "store-2"
          ? [{ id: "cat_z", name: "Zed", order: 1, itemCount: 1 }]
          : categories,
    }));
    fixture.listProducts.mockImplementation(async (_storeId: string, categoryId: string, page: number) =>
      categoryId === "cat_z"
        ? { success: true as const, data: { items: [product("z1", "cat_z")], page, pageSize: 20, total: 1 } }
        : pageFor(categoryId, page, 45),
    );

    fixture.activeStoreId = "store-2";
    await act(async () => {
      root.render(<Page />);
    });

    // The render that carries the new store id must not show old sections.
    expect(container.querySelector('[data-menu-category="cat_a"]')).toBeNull();
    expect(container.textContent).not.toContain("cat_a-p1");

    await act(flush);
    expect(sectionFor("cat_z")).not.toBeNull();
    expect(container.querySelector('[data-menu-category="cat_a"]')).toBeNull();
  });

  it("opens the customizer only with real ProductDetails and customization groups", async () => {
    fixture.listProducts.mockImplementation(async (_storeId: string, categoryId: string, page: number) =>
      categoryId === "cat_a"
        ? {
            success: true,
            data: {
              items: [product("custom-1", "cat_a", { name: "Custom Burger", customizable: true })],
              page,
              pageSize: 20,
              total: 1,
            },
          }
        : pageFor(categoryId, page, 1),
    );

    await renderPage();

    const addButton = Array.from(sectionFor("cat_a").querySelectorAll("button")).find((button) =>
      button.textContent?.startsWith("Add "),
    )!;
    expect(addButton).toBeDefined();

    await act(async () => {
      addButton.click();
    });
    await act(flush);

    expect(fixture.getProduct).toHaveBeenCalledWith("custom-1", "store-1");
    const customizer = container.querySelector('[data-testid="customizer"]');
    expect(customizer).not.toBeNull();
    expect(customizer!.getAttribute("data-groups")).toBe("2");
    // A customizable item is never added on the bare Product.
    expect(fixture.addItem).not.toHaveBeenCalled();
  });

  it("does not open the customizer when the store-scoped read fails", async () => {
    fixture.listProducts.mockImplementation(async (_storeId: string, categoryId: string, page: number) =>
      categoryId === "cat_a"
        ? {
            success: true,
            data: {
              items: [product("x1", "cat_a", { name: "Custom Burger", customizable: true })],
              page,
              pageSize: 20,
              total: 1,
            },
          }
        : pageFor(categoryId, page, 1),
    );
    fixture.getProduct.mockResolvedValue({
      success: false,
      error: { code: "PRODUCT_SCOPE_UNRESOLVED", message: "not linked" },
    });

    await renderPage();
    const addButton = Array.from(sectionFor("cat_a").querySelectorAll("button")).find((button) =>
      button.textContent?.startsWith("Add "),
    )!;
    await act(async () => {
      addButton.click();
    });
    await act(flush);

    expect(container.querySelector('[data-testid="customizer"]')).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Couldn't open this item", expect.anything());
  });

  it("discards a customizer response from the previously selected outlet", async () => {
    fixture.listProducts.mockImplementation(async (_store: string, category: string, page: number) => ({
      success: true,
      data: { items: [product("custom-1", category, { customizable: true })], page, pageSize: 20, total: 1 },
    }));
    const details = deferred<unknown>();
    fixture.getProduct.mockReturnValueOnce(details.promise);
    await renderPage();
    await act(async () => sectionFor("cat_a").querySelector("button")!.click());

    fixture.activeStoreId = "store-2";
    await renderPage();
    await act(async () => details.resolve({
      success: true,
      data: { ...product("custom-1", "cat_a", { name: "OLD OUTLET PRODUCT" }), customizations: [] },
    }));
    await act(flush);
    expect(container.querySelector('[data-testid="customizer"]')).toBeNull();
    expect(container.textContent).not.toContain("OLD OUTLET PRODUCT");
    expect(fixture.addItem).not.toHaveBeenCalled();
  });

  it("closes an already open customizer as soon as the outlet changes", async () => {
    fixture.listProducts.mockImplementation(async (_store: string, category: string, page: number) => ({
      success: true,
      data: { items: [product("custom-1", category, { customizable: true })], page, pageSize: 20, total: 1 },
    }));
    await renderPage();
    await act(async () => sectionFor("cat_a").querySelector("button")!.click());
    expect(container.querySelector('[data-testid="customizer"]')).not.toBeNull();
    fixture.activeStoreId = "store-2";
    await renderPage();
    expect(container.querySelector('[data-testid="customizer"]')).toBeNull();
  });

  it("keeps the last tapped customizer intent when reads finish out of order", async () => {
    fixture.listProducts.mockImplementation(async (_store: string, category: string, page: number) => ({
      success: true,
      data: {
        items: [product("first", category, { customizable: true }), product("second", category, { customizable: true })],
        page, pageSize: 20, total: 2,
      },
    }));
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    fixture.getProduct.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await renderPage();
    const buttons = sectionFor("cat_a").querySelectorAll("button");
    await act(async () => { buttons[0].click(); buttons[1].click(); });
    await act(async () => second.resolve({ success: true, data: { ...product("second", "cat_a"), customizations: [] } }));
    expect(container.querySelector('[data-testid="customizer"]')?.textContent).toBe("second");
    await act(async () => first.resolve({ success: true, data: { ...product("first", "cat_a"), customizations: [] } }));
    expect(container.querySelector('[data-testid="customizer"]')?.textContent).toBe("second");
  });
});
