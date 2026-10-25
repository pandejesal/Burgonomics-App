import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MENU_IMAGE_MAP, resolveItemImage } from "./menuImageMap";

/**
 * Audit guard for the menu image map.
 *
 * Three regressions this pins down, all of which shipped at some point:
 *
 * 1. **Broken paths** — a mapping pointing at a file that was renamed during
 *    the `/images/menu/` reorganisation renders a silent skeleton (prod serves
 *    Linux, so near-miss casing 404s there while looking fine on Windows).
 * 2. **Shared paths** — two different items pointing at one file render
 *    pixel-identical rows in the same category (Kurkure Momos Burger ∕ Kurkure
 *    Momos, Cheese Jalapeño Burger ∕ Cheese Slice, Make It A Meal ∕ Any Classic
 *    Burger Meal, Onion Rings ∕ Classic Salted Fries, Peri Peri ∕ Peri Peri
 *    Fries).
 * 3. **Fallback leaks** — an upstream banner/placeholder URL surviving
 *    `resolveItemImage` and rendering as a product thumbnail.
 *
 * Known and deliberately NOT asserted: several *files* under `public/images/menu`
 * are byte-identical to each other even though no two items now map to the same
 * path (e.g. `big-bang-burgers/great-indian-burger.jpg` ==
 * `classic-burgers/veggie-loaded-burger.jpg`, and
 * `coolers/lemon-iced-tea.jpg` == `coolers/peach-iced-tea.jpg`). Re-sourcing
 * each from its own ULTRA FINAL MENU PICS original did not split them, because
 * the originals are themselves byte-identical pairs:
 * `Big Bang/Great Indian.jpg` == `Classic Burgers/Veggie loaded.jpg` and
 * `Beverages/Lemon Iced Tea.jpg` == `Beverages/Peach.jpg`. That is an upstream
 * asset-pipeline issue — the photo set has a single shot per family — not
 * something the mapping layer can resolve without inventing photos.
 */

const publicDir = fileURLToPath(new URL("../../../../public", import.meta.url));

function listPublicFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(publicDir, "");
  return out;
}

const publicFiles = fs.existsSync(publicDir) ? listPublicFiles() : [];
const publicFileSet = new Set(publicFiles);
const publicFilesByLower = new Map(publicFiles.map((f) => [f.toLowerCase(), f]));

/** Same product or one upstream photo: POS spellings and site photo families. */
const SHARED_BY_DESIGN: ReadonlyArray<ReadonlyArray<string>> = [
  ["Hazlenut Cold Coffee", "Hazelnut Cold Coffee"],
  // burgonomics.com publishes one dipper shot and one UFO shot; using the real
  // shared photo beats an unrelated sibling's picture.
  ["Classic Dipper Burger", "Cheese Dipper Burger"],
  ["Galaxy Seal Hero Burger", "Orbit X Paneer Burger", "Cosmic Lava Cheese Burger"],
];

describe("menuImageMap — mapping integrity", () => {
  it("resolves against a real public/ directory", () => {
    expect(publicFiles.length).toBeGreaterThan(0);
  });

  it("maps every item to a file that exists, with exact casing", () => {
    const broken: string[] = [];
    for (const [name, value] of Object.entries(MENU_IMAGE_MAP)) {
      const rel = value.replace(/^\//, "");
      if (publicFileSet.has(rel)) continue;
      const caseHit = publicFilesByLower.get(rel.toLowerCase());
      broken.push(
        caseHit ? `${name} → ${value} (case mismatch, actual: /${caseHit})` : `${name} → ${value} (missing)`,
      );
    }
    expect(broken).toEqual([]);
  });

  it("uses root-absolute /images/ paths only", () => {
    const bad = Object.entries(MENU_IMAGE_MAP)
      .filter(([, value]) => !value.startsWith("/images/"))
      .map(([name, value]) => `${name} → ${value}`);
    expect(bad).toEqual([]);
  });

  it("gives every distinct item its own photo", () => {
    const ownersByPath = new Map<string, string[]>();
    for (const [name, value] of Object.entries(MENU_IMAGE_MAP)) {
      ownersByPath.set(value, [...(ownersByPath.get(value) ?? []), name]);
    }

    const violations: string[] = [];
    for (const [value, owners] of ownersByPath) {
      if (owners.length < 2) continue;
      const isKnownAlias = SHARED_BY_DESIGN.some(
        (group) => owners.length === group.length && group.every((name) => owners.includes(name)),
      );
      if (!isKnownAlias) violations.push(`${value} ← ${owners.join(" ∕ ")}`);
    }
    expect(violations).toEqual([]);
  });

  it("covers every item that has no photo of its own upstream", () => {
    // `references/verification/8.2/integration-gate.json → nullImageItems`:
    // these fall through to this map, so each must have an explicit entry.
    const nullImageItems = [
      "American Burger",
      "BlueBerry Shake",
      "Cheese Dipper Burger",
      "Cheese Jalapeño Burger",
      "Cheese Slice",
      "Classic Dipper Burger",
      "Cosmic Lava Cheese Burger",
      "Gochuchang Burger",
      "Kurkure Momos Burger",
      "Make It A Meal",
      "Mint Fries",
      "Onion Rings (5 pcs.)",
      "Orbit X Paneer Burger",
    ];
    const missing = nullImageItems.filter((name) => !MENU_IMAGE_MAP[name]);
    expect(missing).toEqual([]);
  });
});

describe("resolveItemImage — precedence and fallbacks", () => {
  it("prefers an explicit upstream photo over the map", () => {
    expect(resolveItemImage("American Burger", "/images/menu/custom/own-photo.jpg")).toBe(
      "/images/menu/custom/own-photo.jpg",
    );
  });

  it("ignores upstream banner/placeholder URLs and uses the item's photo", () => {
    expect(resolveItemImage("American Burger", "/images/menu/banners/hero-meal.jpg")).toBe(
      MENU_IMAGE_MAP["American Burger"],
    );
    expect(resolveItemImage("Veg Momos", "/img/placeholder.png")).toBe(MENU_IMAGE_MAP["Veg Momos"]);
  });

  it("never returns a banner/placeholder as the final answer", () => {
    // Unmapped name + banner URL: the banner must not leak through.
    const resolved = resolveItemImage("Seasonal Special", "/images/menu/banners/myob-banner.jpg");
    expect(resolved).not.toContain("banner");
    expect(publicFileSet.has(resolved.replace(/^\//, ""))).toBe(true);
  });

  it("matches the map case-insensitively after trimming", () => {
    expect(resolveItemImage("  great indian burger ")).toBe(MENU_IMAGE_MAP["Great Indian Burger"]);
    expect(resolveItemImage("CHEESE BURST BURGER")).toBe(MENU_IMAGE_MAP["Cheese Burst Burger"]);
  });

  it("resolves known aliases (POS spelling variants) to one photo", () => {
    expect(resolveItemImage("Hazlenut Cold Coffee")).toBe(resolveItemImage("Hazelnut Cold Coffee"));
  });

  it("resolves unmapped keyword families to files that exist", () => {
    const samples = [
      "Mystery Brownie",
      "Mystery Shake",
      "House Iced Coffee",
      "Truffle Pizza",
      "Alfredo Pasta",
      "Steamed Momos Special",
      "Loaded Fries Special",
      "Chef Burger",
      "Seasonal Special",
    ];
    for (const name of samples) {
      const resolved = resolveItemImage(name);
      expect(publicFileSet.has(resolved.replace(/^\//, "")), `${name} → ${resolved}`).toBe(true);
    }
  });
});
