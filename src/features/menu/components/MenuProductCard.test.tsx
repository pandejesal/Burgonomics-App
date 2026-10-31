/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The card links through TanStack Router but renders standalone here;
// TanStack's Link dereferences the router, so stub it with a plain anchor.
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

// Browser-bound collaborators outside the badge's scope: keep this suite
// hermetic (no favorites/cart side-effect chains, no Capacitor/WebAudio).
vi.mock("@/features/favorites/components/FavoriteHeart", () => ({
  FavoriteHeart: () => null,
}));
// Cart store stub: zustand v5 serves `getInitialState()` to server snapshots,
// so `renderToStaticMarkup` can never observe a real store mutation. This
// fake lets the suite drive the card's quantity selector directly — the
// component's subscription contract (quantity -> ADD/stepper morph) is what
// is under test here, not zustand itself.
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
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn() },
}));
vi.mock("@/core/services/audio", () => ({
  AudioService: { playClick: vi.fn() },
}));

import { MenuProductCard, getDistinctiveOverlayBadge } from "./MenuProductCard";
import type { Product } from "../models";
import { useCartStore } from "@/features/cart/state/cartStore";
import type { CartLine } from "@/features/cart/models";

describe("MT-04: Menu Image Badging & Visual Differentiation Suite", () => {
  const plainProduct: Product = {
    id: "prod_classic_smash",
    categoryId: "cat_burgers",
    name: "Classic Smash Burger",
    description: "Double patty, cheddar & pickles",
    price: 299,
    veg: true,
    inStock: true,
  };

  describe("1. Distinctive Overlay Badge — Big Bang Series", () => {
    it("returns 'Big Bang Series' with tone 'orange' for Big Bang products", () => {
      expect(
        getDistinctiveOverlayBadge({ ...plainProduct, name: "Big Bang Double Cheese Burger" }),
      ).toEqual({ label: "Big Bang Series", tone: "orange" });

      // The series can also be declared via the canonical category label.
      expect(
        getDistinctiveOverlayBadge({ ...plainProduct, categoryName: "Big Bang Series" }),
      ).toEqual({ label: "Big Bang Series", tone: "orange" });
    });
  });

  describe("2. Distinctive Overlay Badge — Sizzling Series", () => {
    it("returns 'Sizzling Hot' with tone 'amber' for Sizzling products", () => {
      expect(
        getDistinctiveOverlayBadge({ ...plainProduct, name: "Sizzling Paneer Platter" }),
      ).toEqual({ label: "Sizzling Hot", tone: "amber" });

      expect(
        getDistinctiveOverlayBadge({ ...plainProduct, categoryName: "Sizzling Hot Plates" }),
      ).toEqual({ label: "Sizzling Hot", tone: "amber" });
    });
  });

  describe("3. Distinctive Overlay Badge — Explicit Product Badges", () => {
    it("uses the first explicit badge's label and maps its tone", () => {
      expect(
        getDistinctiveOverlayBadge({
          ...plainProduct,
          badges: [{ id: "badge_best", label: "Bestseller", tone: "primary" }],
        }),
      ).toEqual({ label: "Bestseller", tone: "orange" });

      // 'success' badges surface in emerald; label always mirrors the badge.
      expect(
        getDistinctiveOverlayBadge({
          ...plainProduct,
          badges: [{ id: "badge_chef", label: "Chef's Special", tone: "success" }],
        }),
      ).toEqual({ label: "Chef's Special", tone: "emerald" });
    });
  });

  describe("4. Distinctive Overlay Badge — Plain Products", () => {
    it("returns null for a plain product with no badges or series match", () => {
      expect(getDistinctiveOverlayBadge(plainProduct)).toBeNull();
    });
  });

  describe("5. MenuProductCard Image Badge Render", () => {
    it('renders data-testid="product-image-badge" for a Big Bang product', () => {
      const html = renderToStaticMarkup(
        <MenuProductCard
          product={{
            ...plainProduct,
            id: "prod_big_bang",
            name: "Big Bang Firehouse Burger",
            imageUrl: "/img/big-bang.png",
          }}
        />,
      );

      expect(html).toContain('data-testid="product-image-badge"');
      expect(html).toContain("Big Bang Series");
    });
  });
});

/**
 * B04 — touch floors, control roles and 320px reflow markup.
 *
 * jsdom does no layout, so geometry is asserted as the exact utility tokens
 * that produce it (`min-h-[44px]`, `w-11 h-11`, `flex-wrap` …). Real pixel
 * measurement belongs to the A02 browser harness; these are the regressions
 * that stop the tokens from silently moving back.
 */
describe("B04: MenuProductCard touch floors, roles and reflow tokens", () => {
  const product: Product = {
    id: "prod_classic_smash",
    categoryId: "cat_burgers",
    name: "Classic Smash Burger",
    description: "Double patty, cheddar & pickles",
    price: 299,
    veg: true,
    inStock: true,
  };

  const line = (quantity = 2): CartLine => ({
    lineId: "line_b4_1",
    productId: product.id,
    storeId: "store_test",
    name: product.name,
    unitPrice: product.price,
    quantity,
    modifiers: [],
    availability: "available",
  });

  const render = (ui: React.ReactElement): HTMLElement => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(ui);
    document.body.append(host);
    return host;
  };

  const addButton = (host: HTMLElement): HTMLButtonElement =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Add Classic Smash Burger to cart"]')!;

  afterEach(() => {
    useCartStore.setState({ lines: [] });
    document.body.innerHTML = "";
  });

  it("grid ADD is a 44px target (was 32px) and its row keeps the same 44px floor", () => {
    const host = render(<MenuProductCard product={product} layout="grid" />);
    const add = addButton(host);
    expect(add).not.toBeNull();
    expect(add.className).toContain("min-h-[44px]");
    expect(add.className).toContain("min-w-[50px]");
    expect(add.className).not.toContain("min-h-[32px]");
    // The wrapper shares the floor, so flipping ADD -> stepper cannot change
    // the price-row height.
    expect(add.parentElement!.className).toContain("min-h-[44px]");
    expect(add.parentElement!.className).toContain("ml-auto");
  });

  it("row ADD keeps its existing 44px x 72px target", () => {
    const host = render(<MenuProductCard product={product} layout="row" />);
    const add = addButton(host);
    expect(add.className).toContain("min-h-[44px]");
    expect(add.className).toContain("min-w-[72px]");
    expect(add.parentElement!.className).toContain("min-h-[44px]");
  });

  it("row price row wraps instead of overflowing (320px reflow) and price is never squeezed", () => {
    const host = render(<MenuProductCard product={product} layout="row" />);
    const add = addButton(host);
    const priceRow = add.parentElement!.parentElement!;
    expect(priceRow.className).toContain("flex-wrap");
    expect(priceRow.firstElementChild!.className).toContain("shrink-0");
  });

  it("grid price is a photo plate, so the action row never shares width with it", () => {
    // Compact-grid design (owner + parent, 2026-10-29): the price moved onto
    // the image, which removes the price/stepper wrap that cost 28px on a
    // filled 360px card. The row layout keeps the wrap contract asserted above.
    const host = render(<MenuProductCard product={product} layout="grid" />);
    const plate = host.querySelector('[data-testid="product-price-badge"]')!;
    expect(plate.textContent).toContain("₹299.00");
    const add = addButton(host)!;
    const actionRow = add.parentElement!.parentElement!;
    expect(actionRow.textContent).toBe("Add");
    expect(actionRow.className).not.toContain("flex-wrap");
    // The ADD keeps its 44px floor either way.
    expect(add.className).toContain("min-h-[44px]");
    expect(add.className).toContain("min-w-[50px]");
  });

  it("sold out disables ADD and names the state instead of the action", () => {
    const host = render(<MenuProductCard product={{ ...product, inStock: false }} layout="grid" />);
    const soldOut = host.querySelector<HTMLButtonElement>("button[disabled]")!;
    expect(soldOut).not.toBeNull();
    expect(soldOut.getAttribute("aria-label")).toBe("Classic Smash Burger is sold out");
    expect(soldOut.textContent).toBe("Sold out");
    // Non-colour signal + accessible card name both carry the state.
    expect(host.textContent).toContain("Sold Out");
    expect(host.querySelector("a")!.getAttribute("aria-label")).toBe(
      "Classic Smash Burger, ₹299.00, sold out",
    );
  });

  it("card link exposes the full title and price in its accessible name", () => {
    const host = render(<MenuProductCard product={product} layout="row" />);
    expect(host.querySelector("a")!.getAttribute("aria-label")).toBe(
      "Classic Smash Burger, ₹299.00",
    );
  });

  it("long titles/descriptions wrap without hiding their full text", () => {
    const name = "Classic Smash Burger With An Unreasonably Long Menu Title That Never Fits";
    const description =
      "A very long description that the card clamps to two lines for layout reasons.";
    const host = render(
      <MenuProductCard product={{ ...product, name, description }} layout="grid" />,
    );

    const title = Array.from(host.querySelectorAll("h3")).find((h) => h.textContent === name)!;
    expect(title.className).not.toContain("truncate");
    expect(title.className).toContain("break-words");
    expect(title.getAttribute("title")).toBe(name);
    expect(host.querySelector("a")!.getAttribute("aria-label")).toBe(`${name}, ₹299.00`);

    const desc = Array.from(host.querySelectorAll("p")).find((p) => p.textContent === description)!;
    expect(desc).toBeDefined();
    expect(desc.className).not.toContain("line-clamp");
    expect(desc.textContent).toBe(description);
  });

  it("in-cart row stepper: 44px +/- targets, quantity roles, and no ADD left behind", () => {
    useCartStore.setState({ lines: [line(3)] });
    const host = render(<MenuProductCard product={product} layout="row" />);

    expect(addButton(host)).toBeNull();

    const minus = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Decrease quantity of Classic Smash Burger"]',
    )!;
    const plus = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase quantity of Classic Smash Burger"]',
    )!;
    expect(minus).not.toBeNull();
    expect(plus).not.toBeNull();
    expect(minus.className).toContain("min-h-[44px]");
    expect(minus.className).toContain("min-w-[44px]");
    expect(plus.className).toContain("min-w-[44px]");
    expect(minus.parentElement!.className).toContain("h-11");
    expect(minus.parentElement!.parentElement!.className).toContain("min-h-[44px]");
    expect(host.textContent).toContain("3");
  });

  it("in-cart grid stepper keeps 44px +/- targets as the price row wraps", () => {
    useCartStore.setState({ lines: [line(1)] });
    const host = render(<MenuProductCard product={product} layout="grid" />);

    const minus = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Decrease quantity of Classic Smash Burger"]',
    )!;
    expect(minus).not.toBeNull();
    expect(minus.className).toContain("min-h-[44px]");
    expect(minus.className).toContain("min-w-[44px]");
    expect(minus.parentElement!.className).toContain("h-11");
    expect(minus.parentElement!.parentElement!.className).toContain("min-h-[44px]");
    expect(host.textContent).toContain("1");
  });

  it("uses green primary tokens for Add and retains the real series badge", () => {
    const host = render(
      <MenuProductCard product={{ ...product, name: "Big Bang Firehouse Burger" }} layout="grid" />,
    );
    const add = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add Big Bang Firehouse Burger to cart"]',
    )!;
    expect(add).not.toBeNull();
    expect(add.className).toContain("bg-primary");
    expect(add.className).toContain("text-primary-foreground");
    expect(add.className).not.toContain("bg-accent");
    expect(add.className).not.toContain("#FF6600");
    expect(host.querySelector('[data-testid="product-image-badge"]')!.textContent).toBe(
      "Big Bang Series",
    );
  });
});

/**
 * P1-12 — the prep-time badge is a fact or it is absent. Nothing may invent a
 * number when the doc never carried one (menuService maps absent -> undefined).
 */
describe("P1-12: prep-time meta renders only for a real positive value", () => {
  const base: Product = {
    id: "prod_prep",
    categoryId: "cat_burgers",
    name: "Prep Time Probe Burger",
    description: "Double patty, cheddar & pickles",
    price: 299,
    veg: true,
    inStock: true,
  };

  const render = (ui: React.ReactElement): HTMLElement => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(ui);
    document.body.append(host);
    return host;
  };

  afterEach(() => {
    document.body.innerHTML = "";
  });

  /** The badge is the only span whose text is exactly "<n>m". */
  const prepBadge = (host: HTMLElement): HTMLElement | undefined =>
    Array.from(host.querySelectorAll<HTMLElement>("span")).find((s) =>
      /^\d+m$/.test((s.textContent ?? "").trim()),
    );

  it("renders '<n>m' when the product carries a positive prep time", () => {
    const host = render(
      <MenuProductCard product={{ ...base, prepTimeMinutes: 20 }} layout="row" />,
    );
    expect(prepBadge(host)?.textContent?.trim()).toBe("20m");
  });

  it("renders no prep badge when the doc omitted prepTimeMinutes", () => {
    const host = render(<MenuProductCard product={base} layout="row" />);
    expect(prepBadge(host)).toBeUndefined();
  });

  it("renders no prep badge for a non-positive value (no invented 15m/0m)", () => {
    for (const value of [0, -5, Number.NaN]) {
      const host = render(
        <MenuProductCard product={{ ...base, prepTimeMinutes: value }} layout="grid" />,
      );
      expect(prepBadge(host)).toBeUndefined();
    }
  });
});
