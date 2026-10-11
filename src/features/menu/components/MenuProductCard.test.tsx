/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
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
