/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuCategory } from "@/features/menu/services/menuService";

const effects = vi.hoisted(() => ({
  navigate: vi.fn(),
  selection: vi.fn(),
  menuStoreRead: vi.fn(),
  setActiveCategory: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => effects.navigate }));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { selection: effects.selection },
}));
vi.mock("@/features/menu/state/menuStore", () => ({
  useMenuStore: (selector: (state: { setActiveCategory: (id: string) => void }) => unknown) => {
    effects.menuStoreRead();
    return selector({ setActiveCategory: effects.setActiveCategory });
  },
}));

import { CategoryGrid } from "./CategoryGrid";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const category = (id: string, name: string, order = 1): MenuCategory => ({
  id, name, order, itemCount: 17,
});
const categories: MenuCategory[] = [
  category("pp-combos", "Combos"),
  category("pp-burger-first", "UFO Burgers", 20),
  category("pp-drink-first", "Cold Coffee", 15),
  category("pp-burger-second", "Classic Burgers", 1),
  category("pp-drink-second", "Shakes", 2),
  category("pp-sides", "Sides"),
  category("pp-pizza", "Pizza"),
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(loadedCategories = categories) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<CategoryGrid categories={loadedCategories} />));
}

function shortcut(label: string): HTMLButtonElement {
  const button = host?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Missing shortcut: ${label}`);
  return button;
}

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.clearAllMocks();
});

describe("Home's available photographed menu shortcuts", () => {
  it("renders the available photographed labels, not empty primary cards or unverified counts", async () => {
    await mount();
    expect(Array.from(host!.querySelectorAll("h4"), (heading) => heading.textContent)).toEqual([
      "Burgers", "Sides", "Shakes & Drinks",
    ]);
    expect(host!.querySelectorAll("button")).toHaveLength(3);
    expect(host!.textContent).not.toMatch(/Combos|Pizza|UFO Burgers|Cold Coffee|17 items/);
    for (const button of host!.querySelectorAll("button")) {
      expect(button.classList.contains("min-h-11")).toBe(true);
      expect(button.classList.contains("focus-visible:outline-ring")).toBe(true);
      // Squares are preferred; enlarged text can grow the row without clipping.
      // Labels stay outside the transforming photo during a photo swap.
      expect(button.classList.contains("before:aspect-square")).toBe(true);
      expect(button.classList.contains("grid-cols-1")).toBe(true);
      expect(button.classList.contains("aspect-square")).toBe(false);
    }
    const burgers = shortcut("Burgers");
    burgers.focus();
    expect(document.activeElement).toBe(burgers);
  });

  it("uses the first actual member's real ID and never eagerly fetches in menuStore", async () => {
    await mount();
    for (const [label, id] of [
      ["Burgers", "pp-burger-first"],
      ["Sides", "pp-sides"],
      ["Shakes & Drinks", "pp-drink-first"],
    ]) {
      await act(async () => shortcut(label).click());
      expect(effects.navigate).toHaveBeenLastCalledWith({
        to: "/menu", search: { category: id },
      });
    }
    expect(effects.navigate).toHaveBeenCalledTimes(3);
    expect(effects.setActiveCategory).not.toHaveBeenCalled();
    expect(effects.menuStoreRead).not.toHaveBeenCalled();
  });

  it("hides unlisted Wraps rather than showing an empty primary card or substituting burger art", async () => {
    await mount();
    expect(host!.querySelector('[aria-label="Wraps"]')).toBeNull();
    expect(host!.textContent).not.toContain("Not listed for this store");
    expect(effects.navigate).not.toHaveBeenCalled();
    expect(effects.selection).not.toHaveBeenCalled();
  });

  it("uses the verified group photos and neutral text after any image fails", async () => {
    await mount();
    expect(shortcut("Burgers").querySelector("img")?.getAttribute("src"))
      .toBe("/images/menu/classic-burgers/hero-burger.jpg");
    expect(shortcut("Sides").querySelector("img")?.getAttribute("src"))
      .toBe("/images/menu/fries/salted-fries.jpg");
    expect(shortcut("Shakes & Drinks").querySelector("img")?.getAttribute("src"))
      .toBe("/images/menu/thick-shakes/oreo-shake.jpg");

    await act(async () => {
      for (const image of host!.querySelectorAll("img")) image.dispatchEvent(new Event("error"));
    });
    expect(host!.querySelector("img, svg")).toBeNull();
    // Photo tiles that failed say so; the unavailable category never had a photo.
    for (const label of ["Burgers", "Sides", "Shakes & Drinks"]) {
      expect(shortcut(label).textContent).toContain("Photo unavailable");
    }
    expect(host!.querySelector('[aria-label="Wraps"]')).toBeNull();
  });

  it("does not turn a loaded Wraps name into a primary tile without a verified photograph", async () => {
    await mount([...categories, {
      ...category("pp-loaded-wraps", "Wraps"),
      imageUrl: "/images/menu/classic-burgers/hero-burger.jpg",
    }]);
    expect(host!.querySelector('[aria-label="Wraps"]')).toBeNull();
    expect(effects.navigate).not.toHaveBeenCalled();
  });

  it("hides the primary grid when only unrelated categories are loaded", async () => {
    await mount([category("pp-combos", "Combos"), category("pp-pasta", "Pasta")]);
    expect(host!.querySelectorAll("button")).toHaveLength(0);
    expect(host!.querySelector("img")).toBeNull();
    expect(effects.navigate).not.toHaveBeenCalled();
  });

  it("does not fabricate a shortcut grid on empty data", async () => {
    await mount([]);
    expect(host!.innerHTML).toBe("");
  });
});
