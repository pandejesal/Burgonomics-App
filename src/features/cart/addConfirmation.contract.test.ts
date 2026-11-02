import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every add path below ends on a screen showing FloatingCartBar: /menu and
 * /search render it directly, and the product page navigates to /menu. Toasts
 * sit at the same bottom offset as the bar, so a success toast stacked a second
 * card, with a duplicate "View Cart", on top of it. On a phone that took about a
 * sixth of the screen for no new information.
 *
 * Failures still toast: the bar cannot report them. Favourites is excluded on
 * purpose: it has no bar, so its toast is the only confirmation.
 */
const ADD_PATHS = [
  "src/routes/menu.index.tsx",
  "src/routes/search.tsx",
  "src/routes/menu.product.$productId.tsx",
  "src/features/menu/components/ProductCustomizerModal.tsx",
];

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("add-to-cart confirmation", () => {
  it.each(ADD_PATHS)("%s confirms through the cart bar, not a toast", (path) => {
    expect(source(path)).not.toMatch(/toast\.success\([^)]*(added|Added)/);
  });

  it.each(ADD_PATHS)("%s still reports a failed add", (path) => {
    expect(source(path)).toContain(`toast.error("Couldn't add to cart"`);
  });

  it("keeps the confirmation on Favourites, which has no cart bar", () => {
    const favourites = source("src/routes/profile.favorites.tsx");
    expect(favourites).not.toContain("<FloatingCartBar");
    expect(favourites).toMatch(/toast\.success\(`Added /);
  });
});
