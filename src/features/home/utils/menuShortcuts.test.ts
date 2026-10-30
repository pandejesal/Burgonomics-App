import { describe, expect, it } from "vitest";
import type { MenuCategory } from "@/features/menu/services/menuService";
import { resolveHomeMenuShortcuts } from "./menuShortcuts";

const category = (id: string, name: string, order = 1): MenuCategory => ({
  id, name, order, itemCount: 3,
});

describe("Home presentation shortcuts", () => {
  it("does not invent groups for an empty store menu", () => {
    expect(resolveHomeMenuShortcuts([])).toEqual([]);
  });

  it("returns exactly four presentation labels in the approved order, not the whole taxonomy", () => {
    const shortcuts = resolveHomeMenuShortcuts([
      category("classic-burgers", "Classic Burgers"),
      category("combos", "Combos"),
      category("pizza", "Pizza"),
      category("pasta", "Pasta"),
      category("momos", "Momos"),
      category("sides", "Sides"),
    ]);
    expect(shortcuts.map(({ label }) => label)).toEqual([
      "Burgers", "Wraps", "Sides", "Shakes & Drinks",
    ]);
    expect(shortcuts[2].members.map(({ id }) => id)).toEqual(["sides"]);
  });

  it("preserves opaque IDs, original category objects, and the provided menu order", () => {
    const categories = [
      category("pp-9824", "UFO Burgers", 20),
      category("pp-1299", "Cold Coffee", 15),
      category("pp-5552", "Classic Burgers", 1),
      category("pp-2873", "Coolers", 2),
      category("pp-9881", "Shakes", 3),
    ];
    const shortcuts = resolveHomeMenuShortcuts(categories);
    expect(shortcuts[0].members).toEqual([categories[0], categories[2]]);
    expect(shortcuts[0].members[0]).toBe(categories[0]);
    expect(shortcuts[3].members).toEqual([categories[1], categories[3], categories[4]]);
    expect(shortcuts[3].members[0]).toBe(categories[1]);
    expect(categories.map(({ order }) => order)).toEqual([20, 15, 1, 2, 3]);
  });

  it.each([
    ["big-bang-burgers", "Big Bang Burgers", "burgers"],
    ["classic-burgers", "Classic Burgers", "burgers"],
    ["sizzling", "Sizzling", "burgers"],
    ["sydney-s-viral", "Sydney’s Viral", "burgers"],
    ["ufo-burgers", "UFO Burgers", "burgers"],
    ["sides", "Sides", "sides"],
    ["shakes", "Shakes", "drinks"],
    ["coolers", "Coolers", "drinks"],
    ["cold-coffee", "Cold Coffee", "drinks"],
  ])("recognizes the explicit %s ID or its name without replacing the ID", (id, name, key) => {
    for (const loadedCategory of [category(id, "Unnamed"), category("opaque-pos-id", ` ${name} `)]) {
      const group = resolveHomeMenuShortcuts([loadedCategory]).find((shortcut) => shortcut.key === key);
      expect(group?.members).toEqual([loadedCategory]);
    }
  });

  it("does not misclassify unknown categories or sweep other foods into Sides", () => {
    const shortcuts = resolveHomeMenuShortcuts([
      category("combos", "Burger Combos"),
      category("pizza", "Pizza"),
      category("pasta", "Pasta"),
      category("momos", "Momos"),
      category("fries", "Fries"),
      category("extras", "Sides and Pizza"),
      category("new-drinks", "New Drinks"),
    ]);
    expect(shortcuts.every(({ members, imageUrl }) => members.length === 0 && imageUrl === null)).toBe(true);
  });

  it("requires a loaded Wraps name, not an assumed Wraps ID, and never supplies a photo", () => {
    const noWraps = resolveHomeMenuShortcuts([category("wraps", "Unrecognized")]);
    expect(noWraps[1]).toMatchObject({ members: [], imageUrl: null });

    const loadedWraps = category("pp-5618", "Wraps");
    const withWraps = resolveHomeMenuShortcuts([loadedWraps]);
    expect(withWraps[1]).toMatchObject({ members: [loadedWraps], imageUrl: null });
  });

  it("does not enable a recognized name without a usable real ID", () => {
    const shortcuts = resolveHomeMenuShortcuts([category(" ", "Classic Burgers")]);
    expect(shortcuts.every(({ members }) => members.length === 0)).toBe(true);
  });
});
