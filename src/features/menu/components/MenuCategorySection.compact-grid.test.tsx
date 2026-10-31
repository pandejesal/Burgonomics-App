/** @vitest-environment jsdom */
/**
 * Compact grid container (owner request 2026-10-29): two product columns from
 * 320 CSS px, 8px gap, and tighter grid-only section spacing — so a 360px phone
 * fits 2 x 2 full cards instead of one column.
 *
 * The 380px single-column gate is the root cause on a 360px phone; it must not
 * come back. List mode keeps its exact existing spacing and row cards.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params: _params,
    className,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <a href={String(to)} className={className} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/favorites/components/FavoriteHeart", () => ({
  FavoriteHeart: () => <div data-testid="favorite-heart" />,
}));
vi.mock("@/features/cart/state/cartStore", () => {
  const state: { lines: Array<Record<string, unknown>> } = { lines: [] };
  const useCartStore = Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
    getState: () => state,
    setState: (patch: Partial<typeof state>) => Object.assign(state, patch),
  });
  return { useCartStore };
});
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { updateQuantity: vi.fn(), removeLine: vi.fn() },
}));
vi.mock("@/core/services/haptics", () => ({ HapticService: { impact: vi.fn() } }));
vi.mock("@/core/services/audio", () => ({ AudioService: { playClick: vi.fn() } }));

import { MenuCategorySection } from "./MenuCategorySection";
import type { MenuCategoryModel, Product } from "../models";
import type { MenuCategoryBucket } from "../state/menuSnapshot";

const category: MenuCategoryModel = {
  id: "cat_burgers",
  name: "Burgers",
  itemCount: 4,
};

const makeProduct = (index: number): Product => ({
  id: `prod_${index}`,
  categoryId: category.id,
  name: `Burger ${index}`,
  description: `Burger ${index} description`,
  price: 199 + index,
  veg: true,
  inStock: true,
});

const bucket: MenuCategoryBucket = {
  items: [1, 2, 3, 4].map(makeProduct),
  page: 1,
  pageSize: 20,
  total: 4,
  hasMore: false,
  loading: false,
};

const render = (viewMode: "grid" | "list"): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(
    <MenuCategorySection
      category={category}
      bucket={bucket}
      viewMode={viewMode}
      stickyOffset={96}
      isActive
      onRegister={vi.fn()}
      onVisible={vi.fn()}
      onLoadMore={vi.fn()}
      onAdd={vi.fn()}
    />,
  );
  document.body.append(host);
  return host;
};

const classTokens = (el: Element): string[] => ((el as HTMLElement).className ?? "").split(/\s+/);

const findWithToken = (host: HTMLElement, token: string): HTMLElement | undefined =>
  Array.from(host.querySelectorAll<HTMLElement>("div, section"))
    .filter((el) => classTokens(el).includes(token))
    .find((el) => el.querySelectorAll('[data-testid="product-card-link"]').length > 0);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("MenuCategorySection — compact two-column grid from 320px", () => {
  it("grid container is two columns with an 8px gap and no 380px single-column gate", () => {
    const host = render("grid");
    const grid = findWithToken(host, "grid-cols-2")!;
    expect(grid).toBeDefined();
    expect(classTokens(grid)).toContain("grid");
    expect(classTokens(grid)).toContain("gap-2");
    // The old gate is the regression: 1 column below 380 CSS px.
    expect(grid.className).not.toContain("grid-cols-1");
    expect(grid.className).not.toContain("min-[380px]");
    expect(grid.querySelectorAll('[data-testid="product-card-link"]').length).toBe(4);
  });

  it("grid cards are the compact variant (2:1 image inside the grid)", () => {
    const host = render("grid");
    const compactImages = Array.from(host.querySelectorAll<HTMLElement>("div")).filter((el) =>
      classTokens(el).includes("aspect-[2/1]"),
    );
    expect(compactImages.length).toBe(4);
  });

  it("lets enlarged text grow into one column instead of clipping controls", () => {
    const grid = findWithToken(render("grid"), "grid-cols-2")!;
    expect(grid.style.gridTemplateColumns).toContain("auto-fit");
    expect(grid.style.gridTemplateColumns).toContain("8rem");
    expect(grid.style.gridTemplateColumns).toContain("50%");
  });

  it("grid-only section spacing is tighter; nothing else moves", () => {
    const gridHost = render("grid");
    const gridSection = gridHost.querySelector("section")!;
    expect(classTokens(gridSection)).toContain("pt-3");
    expect(classTokens(gridSection)).not.toContain("pt-6");
    const gridHeading = gridSection.querySelector("div")!;
    expect(classTokens(gridHeading)).toContain("pb-2");

    const listHost = render("list");
    const listSection = listHost.querySelector("section")!;
    expect(classTokens(listSection)).toContain("pt-6");
    const listHeading = listSection.querySelector("div")!;
    expect(classTokens(listHeading)).toContain("pb-3");
  });

  it("list mode is untouched: stacked rows, no two-column grid, row cards", () => {
    const host = render("list");
    expect(host.querySelector("section")!.querySelector(".grid-cols-2")).toBeNull();
    const stacked = findWithToken(host, "space-y-4")!;
    expect(stacked).toBeDefined();
    expect(stacked.querySelectorAll('[data-testid="product-card-link"]').length).toBe(4);
    // Row cards keep their 96px thumbnail, never the compact 2:1 frame.
    expect(
      Array.from(host.querySelectorAll<HTMLElement>("div")).filter((el) =>
        classTokens(el).includes("h-24"),
      ).length,
    ).toBe(4);
    expect(
      Array.from(host.querySelectorAll<HTMLElement>("div")).filter((el) =>
        classTokens(el).includes("aspect-[2/1]"),
      ).length,
    ).toBe(0);
  });
});
