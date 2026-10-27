/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  setActiveCategory: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => fixture.navigate,
}));

vi.mock("@/core/services/haptics", () => ({
  HapticService: { selection: vi.fn() },
}));

vi.mock("@/features/menu/state/menuStore", () => ({
  useMenuStore: (selector: (state: { setActiveCategory: typeof fixture.setActiveCategory }) => unknown) =>
    selector({ setActiveCategory: fixture.setActiveCategory }),
}));

import { CategoryGrid } from "./CategoryGrid";
import type { MenuCategory } from "@/features/menu/services/menuService";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fixture.navigate.mockReset();
  fixture.setActiveCategory.mockReset();
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

async function mount(ui: React.ReactElement) {
  await act(async () => root.render(ui));
  await act(async () => {});
}

describe("CategoryGrid fallback icons & honest imagery", () => {
  const sampleCategories: MenuCategory[] = [
    { id: "cat_burgers", name: "Big Bang Burgers", itemCount: 10 },
    { id: "cat_pizza", name: "Artisan Pizzas", itemCount: 5 },
    { id: "cat_pasta", name: "Italian Pastas", itemCount: 4 },
    { id: "cat_shakes", name: "Thick Shakes & Coolers", itemCount: 6 },
    { id: "cat_sides", name: "Loaded Sides", itemCount: 8 },
  ];

  it("renders honest semantic Lucide icons in brand green when imageUrl is missing", async () => {
    await mount(<CategoryGrid categories={sampleCategories} />);

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(5);

    // No fake images rendered for missing imageUrls
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(0);

    // Each button must contain an honest Lucide SVG icon with brand primary color (forest green)
    buttons.forEach((btn) => {
      const icon = btn.querySelector("svg");
      expect(icon, "Lucide icon svg").not.toBeNull();
      expect(icon!.className.baseVal || icon!.getAttribute("class")).toContain("text-primary");
    });
  });

  it("renders SafeImage when imageUrl is provided and healthy", async () => {
    const catsWithImage: MenuCategory[] = [
      {
        id: "cat_with_img",
        name: "Gourmet Burgers",
        itemCount: 3,
        imageUrl: "/images/menu/burgers/classic.jpg",
      },
    ];

    await mount(<CategoryGrid categories={catsWithImage} />);

    const img = container.querySelector<HTMLImageElement>("img");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("/images/menu/burgers/classic.jpg");
  });

  it("falls back to semantic Lucide icon if SafeImage encounters an error", async () => {
    const catsWithBrokenImage: MenuCategory[] = [
      {
        id: "cat_broken",
        name: "Artisan Pizzas",
        itemCount: 2,
        imageUrl: "https://invalid-domain.example/non-existent.jpg",
      },
    ];

    await mount(<CategoryGrid categories={catsWithBrokenImage} />);

    const img = container.querySelector<HTMLImageElement>("img");
    expect(img).not.toBeNull();

    // Trigger image error
    await act(async () => {
      img!.dispatchEvent(new Event("error"));
    });

    // After error, img is replaced with semantic Lucide icon in brand green
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon!.className.baseVal || icon!.getAttribute("class")).toContain("text-primary");
    expect(container.querySelector("img")).toBeNull();
  });

  it("handles category clicks: sets active category in store and navigates to /menu", async () => {
    await mount(<CategoryGrid categories={sampleCategories} />);

    const firstButton = container.querySelector<HTMLButtonElement>("button");
    expect(firstButton).not.toBeNull();

    await act(async () => {
      firstButton!.click();
    });

    expect(fixture.setActiveCategory).toHaveBeenCalledWith("cat_burgers");
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/menu",
      search: { category: "cat_burgers" },
    });
  });
});
