/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Product detail honesty: the page used to invent a smash-burger blurb for
 * every product without a description (fries, drinks, momos…). SEO copy did
 * the same. Missing copy must stay missing, never become a fabricated burger.
 */
const fixture = vi.hoisted(() => ({
  product: null as unknown as Record<string, unknown>,
  seoMeta: [] as Array<{ name?: string; content?: string }>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => {
    fixture.seoMeta = (opts.head as any)?.().meta ?? [];
    return {
      ...opts,
      options: opts,
      useParams: () => ({ productId: "prod_fries" }),
    };
  },
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children, bottomSlot }: { children: React.ReactNode; bottomSlot?: React.ReactNode }) => (
    <main>
      {children}
      {bottomSlot}
    </main>
  ),
}));

vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (selector: (state: unknown) => unknown) =>
    selector({ activeStore: { id: "store-1" } }),
}));

vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { addItem: vi.fn() },
}));

vi.mock("@/features/menu/state/menuStore", () => ({
  useMenuStore: (selector: (state: unknown) => unknown) =>
    selector({ pushRecentlyViewed: vi.fn() }),
}));

vi.mock("@/features/menu/repositories/MenuRepository", () => ({
  menuRepository: {
    getProduct: vi.fn(async () => ({ success: true, data: fixture.product })),
    listRelatedProducts: vi.fn(async () => ({ success: true, data: [] })),
  },
}));

vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn() },
}));

import { Route } from "./menu.product.$productId";

const Page = (Route as unknown as { options: { component: React.ComponentType } }).options.component;

const buildProduct = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "prod_fries",
    categoryId: "sides",
    name: "Classic Salted Fries",
    description: "",
    price: 129,
    veg: true,
    inStock: true,
    imageUrls: [],
    customizations: [],
    ...overrides,
  }) as unknown as Record<string, unknown>;

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Page />);
  });
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("product page copy honesty", () => {
  beforeEach(() => {
    fixture.product = buildProduct();
  });

  it("does not invent a burger description for a product without one", async () => {
    const { container, unmount } = await mount();

    expect(container.textContent).toContain("Classic Salted Fries");
    expect(container.textContent).toContain("Description coming soon");
    expect(container.textContent).not.toContain("smash patty");
    expect(container.textContent).not.toContain("crisp greens");
    expect(container.textContent).not.toContain("gourmet house sauce");

    await unmount();
  });

  it("renders the real description when the product doc carries one", async () => {
    fixture.product = buildProduct({
      description: "Crispy and golden salted fries.",
    });
    const { container, unmount } = await mount();

    expect(container.textContent).toContain("Crispy and golden salted fries.");
    expect(container.textContent).not.toContain("Description coming soon");

    await unmount();
  });

  it("uses a neutral SEO description instead of asserting a burger", () => {
    expect(fixture.seoMeta.length).toBeGreaterThan(0);
    const description = fixture.seoMeta.find((m) => m.name === "description")?.content ?? "";
    expect(description.toLowerCase()).not.toContain("burger");
    expect(description.toLowerCase()).not.toContain("smash");
  });
});
