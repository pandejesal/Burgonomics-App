/** @vitest-environment jsdom */
/**
 * Compact grid presentation (owner request 2026-10-29: "menu items a little
 * smaller in grid view to include 4 items in one screen" — 2 columns x 2 rows).
 *
 * jsdom does no layout, so this pins the exact utility tokens that produce the
 * measured geometry (parent measures pixels in the browser): a 2:1 grid image,
 * 8px body padding, 4px stacking gap, a 14px/leading-tight two-line title, and
 * sr-only description/meta/badge rows so the body is only title + price + ADD.
 *
 * The full name/description/badges must stay in the DOM (and the link's
 * accessible name must keep title + price), and nothing may be clipped or
 * height-capped: at 200% zoom the card grows instead of hiding content.
 *
 * Row (list) layout is out of scope and asserted to be untouched.
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
  const useCartStore = Object.assign(
    (selector: (s: typeof state) => unknown) => selector(state),
    {
      getState: () => state,
      setState: (patch: Partial<typeof state>) => Object.assign(state, patch),
    },
  );
  return { useCartStore };
});
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { updateQuantity: vi.fn(), removeLine: vi.fn() },
}));
vi.mock("@/core/services/haptics", () => ({ HapticService: { impact: vi.fn() } }));
vi.mock("@/core/services/audio", () => ({ AudioService: { playClick: vi.fn() } }));

import { MenuProductCard } from "./MenuProductCard";
import type { Product } from "../models";
import { useCartStore } from "@/features/cart/state/cartStore";

const LONG_NAME = "Classic Smash Burger With An Unreasonably Long Menu Title";
const LONG_DESCRIPTION =
  "A very long description that the compact grid keeps in the DOM for browse mode and for the card link name.";

const product: Product = {
  id: "prod_compact",
  categoryId: "cat_burgers",
  name: LONG_NAME,
  description: LONG_DESCRIPTION,
  price: 299,
  veg: true,
  inStock: true,
  prepTimeMinutes: 20,
  badges: [{ id: "badge_best", label: "Bestseller", tone: "primary" }],
};

const render = (ui: React.ReactElement): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(ui);
  document.body.append(host);
  return host;
};

/** Elements whose class list contains an exact utility token. */
const withToken = (host: HTMLElement, token: string): HTMLElement[] =>
  Array.from(host.querySelectorAll<HTMLElement>("div, span, p, h3, a, button")).filter((el) =>
    (el.className ?? "").split(/\s+/).includes(token),
  );

const textNode = (host: HTMLElement, tag: string, text: string): HTMLElement | undefined =>
  Array.from(host.querySelectorAll<HTMLElement>(tag)).find((el) => el.textContent === text);

const addButton = (host: HTMLElement): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="Add ${LONG_NAME} to cart"]`);

afterEach(() => {
  useCartStore.setState({ lines: [] });
  document.body.innerHTML = "";
});

describe("compact grid — 2:1 image, 8px body, 14px two-line title", () => {
  it("grid image is 2:1 (was aspect-square) and the row image keeps its 96px tile", () => {
    const grid = render(<MenuProductCard product={product} layout="grid" />);
    expect(withToken(grid, "aspect-[2/1]").length).toBeGreaterThan(0);
    expect(withToken(grid, "aspect-square").length).toBe(0);

    const row = render(<MenuProductCard product={product} layout="row" />);
    expect(withToken(row, "h-24").length).toBeGreaterThan(0);
    expect(withToken(row, "aspect-[2/1]").length).toBe(0);
  });

  it("grid body uses p-2 and gap-1; the row body still uses p-4", () => {
    const grid = render(<MenuProductCard product={product} layout="grid" />);
    const gridBody = withToken(grid, "flex-col").find(
      (el) => (el.className ?? "").includes("flex-1"),
    )!;
    expect(gridBody.className).toContain("p-2");
    expect(gridBody.className).toContain("gap-1");
    expect(gridBody.className).not.toContain("p-3");

    const row = render(<MenuProductCard product={product} layout="row" />);
    const rowCard = withToken(row, "p-4")[0];
    expect(rowCard).toBeDefined();
  });

  it("keeps the price plate below the 44px favourite target, including wrapped compare prices", () => {
    const ordinary = render(<MenuProductCard product={product} layout="grid" />);
    expect(withToken(ordinary, "aspect-[2/1]")[0].classList.contains("min-h-20")).toBe(true);
    const discounted = render(<MenuProductCard product={{ ...product, compareAtPrice: 399 }} layout="grid" />);
    expect(withToken(discounted, "aspect-[2/1]")[0].classList.contains("min-h-24")).toBe(true);
  });

  it("grid title is 14px/leading-tight, clamped to two visual lines, but keeps the full name in DOM, title attr and link name", () => {
    const host = render(<MenuProductCard product={product} layout="grid" />);
    const title = textNode(host, "h3", LONG_NAME)!;
    expect(title).toBeDefined();
    expect(title.className).toContain("text-sm");
    expect(title.className).toContain("leading-tight");
    expect(title.className).toContain("line-clamp-2");
    expect(title.className).toContain("break-words");
    expect(title.getAttribute("title")).toBe(LONG_NAME);
    expect(title.textContent).toBe(LONG_NAME);

    const link = host.querySelector("a")!;
    expect(link.getAttribute("aria-label")).toBe(`${LONG_NAME}, ₹299.00`);
  });

  it("grid description is sr-only (full text retained, no line-clamp); the row description stays visible and relaxed", () => {
    const grid = render(<MenuProductCard product={product} layout="grid" />);
    const gridDescription = textNode(grid, "p", LONG_DESCRIPTION)!;
    expect(gridDescription).toBeDefined();
    expect(gridDescription.className).toContain("sr-only");
    expect(gridDescription.className).not.toContain("line-clamp");

    const row = render(<MenuProductCard product={product} layout="row" />);
    const rowDescription = textNode(row, "p", LONG_DESCRIPTION)!;
    expect(rowDescription).toBeDefined();
    expect(rowDescription.className).not.toContain("sr-only");
    expect(rowDescription.className).toContain("leading-relaxed");
  });

  it("grid announces prep-time, badges and Customisable instead of painting them (the Add + action carries the state)", () => {
    const host = render(<MenuProductCard product={{ ...product, customizable: true }} layout="grid" />);

    const prep = Array.from(host.querySelectorAll<HTMLElement>("span")).find(
      (s) => (s.textContent ?? "").trim() === "20m",
    )!;
    expect(prep).toBeDefined();
    expect(prep.className).toContain("sr-only");

    // The declaration list stays reachable for assistive tech.
    expect(host.textContent).toContain("Bestseller");
    const badgeList = Array.from(host.querySelectorAll<HTMLElement>("div")).find(
      (el) => (el.textContent ?? "") === "Bestseller" && (el.className ?? "").includes("flex-wrap"),
    )!;
    expect(badgeList).toBeDefined();
    expect(badgeList.className).toContain("sr-only");

    const customisable = Array.from(host.querySelectorAll<HTMLElement>("span")).find(
      (span) => (span.textContent ?? "").trim() === "Customisable",
    )!;
    expect(customisable).toBeDefined();
    expect(customisable.className).toContain("sr-only");

    // …and the visible action still proves the product is customisable.
    const add = host.querySelector<HTMLButtonElement>(`button[aria-label="Add ${LONG_NAME} to cart"]`)!;
    expect(add.textContent).toBe("Add +");
  });

  it("keeps the veg indicator, the favourite target, the real price and the 44px ADD in the grid", () => {
    const host = render(<MenuProductCard product={product} layout="grid" />);
    // Veg marker and favourite target are both still on the compact card.
    expect(host.querySelector('[role="img"][aria-label="Vegetarian"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="favorite-heart"]')).not.toBeNull();
    expect(host.textContent).toContain("₹299.00");
    const add = addButton(host);
    expect(add).not.toBeNull();
    expect(add!.className).toContain("min-h-[44px]");
    expect(add!.className).toContain("min-w-[50px]");
  });

  it("grid price is a readable plate on the photo (bottom-right), so the body is title + action only", () => {
    const host = render(
      <MenuProductCard product={{ ...product, compareAtPrice: 399 }} layout="grid" />,
    );
    const plate = host.querySelector<HTMLElement>('[data-testid="product-price-badge"]')!;
    expect(plate).not.toBeNull();
    // Full price, plus the struck-through compare price, both untruncated.
    expect(plate.textContent).toContain("₹299.00");
    expect(plate.textContent).toContain("₹399.00");
    expect(plate.className).toContain("bg-surface");
    expect(plate.className).toContain("text-text-primary");
    expect(plate.className).toContain("bottom-1.5");
    expect(plate.className).toContain("right-1.5");
    expect(plate.className).not.toContain("truncate");
    expect(plate.className).not.toContain("line-clamp");
    // It sits inside the photo frame, not in the text body.
    expect(plate.closest('[class*="aspect-[2/1]"]')).not.toBeNull();

    const body = withToken(host, "flex-col").find((el) => (el.className ?? "").includes("p-2"))!;
    expect(body.textContent).not.toContain("₹299.00");
    // The action row is the ADD alone: no price to squeeze it at 320px.
    const actionRow = addButton(host)!.parentElement!.parentElement!;
    expect(actionRow.textContent).toBe("Add");
    expect(actionRow.className).not.toContain("flex-wrap");
  });

  it("grid in-cart stepper keeps 44px +/- targets at the compact width", () => {
    useCartStore.setState({
      lines: [
        {
          lineId: "l1",
          productId: product.id,
          storeId: "store_test",
          name: product.name,
          unitPrice: product.price,
          quantity: 2,
          modifiers: [],
          availability: "available",
        } as never,
      ],
    });
    const host = render(<MenuProductCard product={product} layout="grid" />);
    const minus = host.querySelector<HTMLButtonElement>(
      `button[aria-label="Decrease quantity of ${LONG_NAME}"]`,
    )!;
    const plus = host.querySelector<HTMLButtonElement>(
      `button[aria-label="Increase quantity of ${LONG_NAME}"]`,
    )!;
    expect(minus).not.toBeNull();
    expect(plus).not.toBeNull();
    expect(minus.className).toContain("min-w-[44px]");
    expect(plus.className).toContain("min-w-[44px]");
    expect(minus.parentElement!.className).toContain("h-11");
    expect(addButton(host)).toBeNull();
  });

  it("sold-out state stays visible on the image and on the action", () => {
    const host = render(<MenuProductCard product={{ ...product, inStock: false }} layout="grid" />);
    expect(host.textContent).toContain("Sold Out");
    const soldOut = host.querySelector<HTMLButtonElement>("button[disabled]")!;
    expect(soldOut.textContent).toBe("Sold out");
    expect(host.querySelector("a")!.getAttribute("aria-label")).toContain("sold out");
  });

  it("never caps the card height or clips its body (must grow at 200% zoom)", () => {
    const host = render(<MenuProductCard product={product} layout="grid" />);
    const card = withToken(host, "border").find(
      (el) => (el.className ?? "").includes("rounded-2xl") && (el.className ?? "").includes("flex-col"),
    )!;
    expect(card).toBeDefined();
    expect(card.className).not.toContain("max-h-");
    expect(card.className).not.toContain("h-[");
    expect(card.className).not.toContain("overflow-y-");
  });

  it("the series badge owns top-left, capped short of the 44px favourite corner, and the discount takes bottom-left", () => {
    const host = render(<MenuProductCard product={{ ...product, discountPercentage: 20 }} layout="grid" />);
    const overlay = host.querySelector<HTMLElement>('[data-testid="product-image-badge"]')!;
    expect(overlay).not.toBeNull();
    expect(overlay.textContent).toBe("Bestseller");
    expect(overlay.className).not.toContain("sr-only");
    expect(overlay.className).toContain("top-1.5");
    expect(overlay.className).toContain("left-1.5");
    // 3.25rem keeps the label clear of the favourite disc plus its inset.
    expect(overlay.className).toContain("max-w-[calc(100%-3.25rem)]");

    // The discount plate must not share top-left with the series badge.
    const discount = Array.from(host.querySelectorAll<HTMLElement>("span")).find((el) =>
      (el.textContent ?? "").includes("% OFF"),
    )!;
    expect(discount).toBeDefined();
    expect(discount.className).toContain("bottom-1.5");
    expect(discount.className).not.toContain("top-1.5");
  });
});
