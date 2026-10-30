import { describe, expect, it } from "vitest";
import { normalizeCategoryToken, resolveCategoryParam } from "./categoryResolve";

const categories = [
  { id: "cat_burgers", name: "Burgers" },
  { id: "cat_beverages", name: "Beverages" },
  { id: "cat_beverage_combos", name: "Beverage Combos" },
  { id: "cat_cold_drinks", name: "Cold Drinks" },
  { id: "cat_sides", name: "Cold Drinks" }, // real duplicate display name
];

describe("resolveCategoryParam", () => {
  it("returns none for a missing or blank param", () => {
    expect(resolveCategoryParam(undefined, categories)).toEqual({ status: "none" });
    expect(resolveCategoryParam("   ", categories)).toEqual({ status: "none" });
  });

  it("lets an exact real id win over any name match", () => {
    expect(resolveCategoryParam("cat_burgers", categories)).toEqual({
      status: "resolved",
      param: "cat_burgers",
      id: "cat_burgers",
      matchedBy: "id",
    });
  });

  it("accepts a case-insensitive id, still resolving to the real id", () => {
    const result = resolveCategoryParam("CAT_BURGERS", categories);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.id).toBe("cat_burgers");
  });

  it("resolves a uniquely normalised name", () => {
    const result = resolveCategoryParam("cold-drinks", [{ id: "x", name: "Cold Drinks!" }]);
    expect(result).toEqual({ status: "resolved", param: "cold-drinks", id: "x", matchedBy: "name" });
    expect(normalizeCategoryToken("  Cold   Drinks! ")).toBe("cold drinks");
  });

  it("reports ambiguity instead of picking the first of two identical names", () => {
    const result = resolveCategoryParam("Cold Drinks", categories);
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") expect(result.candidates).toEqual(["Cold Drinks", "Cold Drinks"]);
  });

  it("does not fall back to a shared first word", () => {
    // "Beverage" is a prefix word of two categories; the old matcher picked one
    // of them in array order.
    expect(resolveCategoryParam("beverage", categories).status).toBe("unknown");
    expect(resolveCategoryParam("beverages", categories)).toEqual({
      status: "resolved",
      param: "beverages",
      id: "cat_beverages",
      matchedBy: "name",
    });
  });

  it("reports an unknown shortcut id instead of silently opening the first category", () => {
    expect(resolveCategoryParam("home_shortcut_beverages", categories)).toEqual({
      status: "unknown",
      param: "home_shortcut_beverages",
    });
  });
});
