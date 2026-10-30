/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/features/menu/models";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Review repairs (E + G):
 * - repeated matches in one highlight query are all marked;
 * - the card no longer nests buttons inside the navigation anchor.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: (props: {
    children?: React.ReactNode;
    to: string;
    "aria-label"?: string;
    "data-testid"?: string;
  }) => (
    <a
      href={props.to}
      aria-label={props["aria-label"]}
      data-testid={props["data-testid"]}
    >
      {props.children}
    </a>
  ),
}));

vi.mock("@/features/favorites/components/FavoriteHeart", () => ({
  FavoriteHeart: ({ className }: { className?: string }) => (
    <button type="button" aria-label="Save to favourites" className={className}>
      ♥
    </button>
  ),
}));

vi.mock("@/features/cart/state/cartStore", () => {
  const state = { lines: [] as unknown[] };
  const useCartStore = (selector: (value: typeof state) => unknown) => selector(state);
  (useCartStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useCartStore };
});

vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { updateQuantity: vi.fn() },
}));

vi.mock("@/core/services/haptics", () => ({ HapticService: { impact: vi.fn() } }));
vi.mock("@/core/services/audio", () => ({ AudioService: { playClick: vi.fn() } }));

vi.mock("motion/react", () => {
  const clean = (props: Record<string, unknown>) => {
    const { initial, animate, exit, transition, ...rest } = props;
    void initial;
    void animate;
    void exit;
    void transition;
    return rest;
  };
  return {
    useReducedMotion: () => true,
    motion: {
      div: (props: Record<string, unknown>) => <div {...clean(props)} />,
      button: (props: Record<string, unknown>) => <button {...clean(props)} />,
      span: (props: Record<string, unknown>) => <span {...clean(props)} />,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { MenuProductCard, highlightText } from "./MenuProductCard";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    categoryId: "cat_a",
    name: "Classic Burger",
    description: "A burger",
    price: 199,
    veg: true,
    inStock: true,
    customizable: false,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("highlightText (E)", () => {
  it("marks every match in the same string, not just the first", async () => {
    await act(async () => {
      root.render(<div>{highlightText("Burger burger", "burger")}</div>);
    });
    expect(container.querySelectorAll("mark")).toHaveLength(2);
  });
});

describe("card interactive nesting (G)", () => {
  it("keeps navigation and controls as siblings in both layouts", async () => {
    for (const layout of ["row", "grid"] as const) {
      await act(async () => {
        root.render(<MenuProductCard product={product()} layout={layout} />);
      });

      const link = container.querySelector<HTMLAnchorElement>('[data-testid="product-card-link"]')!;
      expect(link).not.toBeNull();
      expect(link.getAttribute("aria-label")).toContain("Classic Burger");

      // No anchor may contain a button/link (and vice versa).
      expect(container.querySelectorAll("a a, a button, button a")).toHaveLength(0);

      const add = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Add"),
      )!;
      const favourite = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Save to favourites"]',
      )!;
      expect(add).toBeDefined();
      expect(favourite).not.toBeNull();
      expect(link.contains(add)).toBe(false);
      expect(link.contains(favourite)).toBe(false);

      const onAdd = vi.fn();
      await act(async () => {
        root.render(<MenuProductCard product={product()} layout={layout} onAdd={onAdd} />);
      });
      const addWithHandler = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Add"),
      )!;
      await act(async () => addWithHandler.click());
      expect(onAdd).toHaveBeenCalledTimes(1);
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
    }
  });
});
