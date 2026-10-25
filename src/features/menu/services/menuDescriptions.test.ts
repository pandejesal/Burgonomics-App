import { describe, expect, it } from "vitest";
import { lookupMenuDescription, normalizeMenuName } from "./menuDescriptions";

/**
 * Firestore/Petpooja descriptions win; this fallback exists so a product whose
 * POS record carries no description never renders a blank card. Names drift
 * (punctuation, accents, casing), so matching is normalized.
 */
describe("lookupMenuDescription", () => {
  it("matches canonical catalog names", () => {
    expect(lookupMenuDescription("Jr. Hero Burger")).toContain("crispy Aloo Patty");
    expect(lookupMenuDescription("Cheese Jalapeño Burger")).toContain("jalapeños");
    expect(lookupMenuDescription("Classic Cold Coffee")).toBe(
      "The perfect mix of sweet, bold, and creamy."
    );
  });

  it("tolerates punctuation, case and accent drift", () => {
    expect(lookupMenuDescription("  cheese jalapeno burger ")).toContain("ghost pepper");
    expect(normalizeMenuName("2 Jr. Hero Burger")).toBe("2 jr hero burger");
    expect(lookupMenuDescription("ONION RINGS (5 PCS.)")).toContain("onion rings");
  });

  it("returns an empty string for unknown or missing names", () => {
    expect(lookupMenuDescription("Sizzling Mystery Burger")).toBe("");
    expect(lookupMenuDescription(undefined)).toBe("");
    expect(lookupMenuDescription("   ")).toBe("");
  });
});
