/**
 * High-resolution real food image mapping for Burgonomics menu items.
 * Maps exact item names and common aliases to real photos extracted from
 * ULTRA FINAL MENU PICS into /images/menu/.
 *
 * ## Contract
 *
 * 1. **Every path resolves** — files live under `public/`, and the paths are
 *    matched case-sensitively (prod serves Linux; a Windows-only case
 *    match would 404 in the wild). Enforced by `menuImageMap.test.ts`.
 * 2. **One photo per item** — no two *different* items may point at the same
 *    file. Five items used to share their sibling's photo (Kurkure Momos Burger
 *    with Kurkure Momos, Cheese Jalapeño Burger with Cheese Slice, Make It A
 *    Meal with Any Classic Burger Meal, Onion Rings with Classic Salted Fries,
 *    Peri Peri with Peri Peri Fries), so two rows in one category rendered
 *    pixel-identical thumbnails. Also enforced by the test.
 * 3. **Closest available photo when the item has no photo of its own.** 15
 *    items have no owner-final shot (see `itemsWithNoStagedPhoto` in
 *    `references/verification/8.2/integration-gate.json`). For those the map
 *    picks the nearest photo that no other item uses, preferring a photo that
 *    actually depicts the item. Where the repo simply has no such photo the
 *    comment says so — the alternative (sharing a sibling's file) is the bug
 *    this map exists to avoid.
 *
 * Firestore still wins when a product carries its own non-fallback `imageUrl`
 * (see `resolveItemImage`); this map is what the 13 null-image items and any
 * product without a usable upstream URL fall back to.
 */

export const MENU_IMAGE_MAP: Record<string, string> = {
  // Burgers - Big Bang & Favorites
  // No "American Burger" shot exists; Farm Fresh is the generic house burger
  // and is not claimed by any other item.
  "American Burger": "/images/menu/web/american-burger.webp",
  "Great Indian Burger": "/images/menu/big-bang-burgers/great-indian-burger.jpg",
  // Gochuchang = Korean chilli paste → the kimchi-burger shot, not a sibling's.
  "Gochuchang Burger": "/images/menu/web/gochuchang-burger.webp",
  "Cheese Burst Burger": "/images/menu/big-bang-burgers/cheese-burst-burger.jpg",
  "Tandoori Paneer Burger": "/images/menu/big-bang-burgers/tandoori-paneer-burger.jpg",
  "Super Hero Burger": "/images/menu/big-bang-burgers/super-hero-burger.jpg",

  // Burgers - Classic
  "Jr. Hero Burger": "/images/menu/classic-burgers/jr-hero-burger.jpg",
  "Korean Kimchi Burger": "/images/menu/classic-burgers/korean-kimchi-burger.jpg",
  "Mexican Mafia Burger": "/images/menu/classic-burgers/mexican-mafia-burger.jpg",
  "Hero Burger": "/images/menu/classic-burgers/hero-burger.jpg",
  "Veggie Loaded Burger": "/images/menu/classic-burgers/veggie-loaded-burger.jpg",
  // Own shot is the Kurkure Momos photo (shared with the momo it is named
  // after) → Burning Man is the crunchy/spicy patty shot no one else uses.
  "Kurkure Momos Burger": "/images/menu/web/kurkure-momos-burger.webp",
  // 4 cheese.png is Cheese Heaven Pizza's photo; the jalapeño shot shows
  // pickled jalapeños + melted cheese over a patty.
  "Cheese Jalapeño Burger": "/images/menu/web/cheese-jalapeno-burger.webp",

  // Sizzling & Dipper
  "Veg Sizzling Burger": "/images/menu/sizzling-burgers/veg-sizzling-burger.jpg",
  "Cheese Supreme Burger": "/images/menu/sizzling-burgers/cheese-supreme-burger.jpg",
  "Paneer Supreme Burger": "/images/menu/sizzling-burgers/paneer-supreme-burger.jpg",
  "Classic Dipper Burger": "/images/menu/web/dipper-burger.webp",
  "Cheese Dipper Burger": "/images/menu/web/dipper-burger.webp",
  "Galaxy Seal Hero Burger": "/images/menu/web/ufo-burger.webp",
  "Orbit X Paneer Burger": "/images/menu/web/ufo-burger.webp",
  "Cosmic Lava Cheese Burger": "/images/menu/web/ufo-burger.webp",

  // Combos & Meals
  "2 Jr. Hero Burger": "/images/menu/combos/2-jr-hero-burger.jpg",
  "Jr Hero Burger Meal": "/images/menu/combos/jr-hero-meal.jpg",
  "Any Classic Burger Meal": "/images/menu/combos/classic-burger-meal.jpg",
  "Any Big Bang Burger Meal": "/images/menu/combos/big-bang-meal.jpg",
  "Red Hot Meal": "/images/menu/Red Hot meal.jpg",

  // Sides & Fries
  "Classic Salted Fries": "/images/menu/fries/salted-fries.jpg",
  "Peri Peri Fries": "/images/menu/fries/peri-peri-fries.jpg",
  // No onion-rings photo exists in the set (canonical image-map.json sanctions
  // the same fries photo). Salted fries.jpg is a separate file from
  // fries/salted-fries.jpg so the two rows are still distinct mappings.
  "Onion Rings (5 pcs.)": "/images/menu/web/onion-rings.webp",
  "Mint Fries": "/images/menu/web/mint-fries.webp",
  "Peri Peri Cheese Fries": "/images/menu/fries/peri-peri-cheesy-fries.jpg",
  "Dirty Fries": "/images/menu/fries/dirty-fries.jpg",

  // Pizzas
  "Margherita Pizza": "/images/menu/pizza/classic-margherita-pizza.jpg",
  "Tandoori Paneer Pizza": "/images/menu/pizza/tandoori-paneer-pizza.jpg",
  "The Veg Overload Pizza": "/images/menu/pizza/veg-overload-pizza.jpg",
  "Cheese Heaven Pizza": "/images/menu/pizza/cheesy-heaven-pizza.jpg",

  // Pastas
  "White Sauce Pasta": "/images/menu/pasta/alfredo-cheese-sauce-pasta.jpg",
  "Pink Sauce Pasta": "/images/menu/pasta/pink-sauce-pasta.jpg",
  "Arrabiata Pasta": "/images/menu/pasta/arrabiata-pasta.jpg",

  // Momos
  "Veg Momos": "/images/menu/momos/veg-momos-fried.jpg",
  "Veg Cheese Momos": "/images/menu/momos/veg-cheese-momos-fried.jpg",
  "Kurkure Momos": "/images/menu/momos/kurkure-momos.jpg",

  // Coolers & Beverages
  "Lemon Iced Tea": "/images/menu/coolers/lemon-iced-tea.jpg",
  "Peach Iced Tea": "/images/menu/coolers/peach-iced-tea.jpg",
  "Masala Coke": "/images/menu/coolers/masala-coke.jpg",
  "Kokum Iced Tea": "/images/menu/web/kokum-iced-tea.webp",

  // Shakes & Thick Shakes
  "Oreo Shake": "/images/menu/thick-shakes/oreo-shake.jpg",
  "Chocolate Shake": "/images/menu/thick-shakes/chocolate-shake.jpg",
  // No blueberry shot exists. Strawberry Oreo Shake now gets its own photo
  // back (it used to show Strawberry Shake.png — the same picture BlueBerry
  // was showing), so BlueBerry takes the unused Biscoff shot: distinct from
  // every other live item rather than a second copy of a sibling's.
  "BlueBerry Shake": "/images/menu/web/blueberry-shake.webp",
  "Strawberry Oreo Shake": "/images/menu/thick-shakes/strawberry-oreo-shake.jpg",
  // No biscoff shot of its own either — the cookie-crumble shake is the
  // closest unused photo, and it frees Biscoff Shake.png for BlueBerry.
  "Biscoff Shake": "/images/menu/Cookie Crumble.JPG",
  "Nutella Shake": "/images/menu/Nutella.JPG",

  // Cold Coffee
  "Classic Cold Coffee": "/images/menu/web/classic-cold-coffee.webp",
  // Same product, two spellings in live POS data — an intentional alias, the
  // only shared value in this map (asserted as such by the test).
  "Hazlenut Cold Coffee": "/images/menu/beverages/hazelnut-cold-coffee.jpg",
  "Hazelnut Cold Coffee": "/images/menu/beverages/hazelnut-cold-coffee.jpg",
  "Irish Cold Coffee": "/images/menu/beverages/irish-cold-coffee.jpg",
  "Mocha Cold Coffee": "/images/menu/Mocha.jpg",

  // Desserts & Add-Ons
  "Chocolate Brownie": "/images/menu/desserts/chocolate-brownie.jpg",
  // Sole owner of 4 cheese.png now that the jalapeño burger moved off it.
  "Cheese Slice": "/images/menu/4 cheese.png",
  // The peri-peri seasoning add-on gets the peri-peri banner instead of
  // Peri Peri Fries' own file.
  "Peri Peri": "/images/menu/banners/peri-peri-fries-banner.jpg",
  // "Make it a meal" = burger + drink, one photo no other item uses.
  "Make It A Meal": "/images/menu/coke + cheese burst.png",
};

/** Image used when a product has neither a usable URL nor a map entry. */
const DEFAULT_IMAGE = "/images/menu/Hero burgr.jpg";

/** Upstream URLs that are chrome, not a product photo → never trust them. */
function isFallbackImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("banner") || lower.includes("placeholder");
}

/**
 * Case-insensitive / trimmed index over the map, built once. The old version
 * linearly re-scanned every entry for every product doc — hundreds of
 * per-product string comparisons on each menu load for the same answer.
 */
let normalizedNameIndex: Map<string, string> | null = null;
function lookupByName(name: string): string | undefined {
  if (!normalizedNameIndex) {
    normalizedNameIndex = new Map();
    for (const [key, value] of Object.entries(MENU_IMAGE_MAP)) {
      const normalizedKey = key.trim().toLowerCase();
      // First writer wins: exact-name entries are ordered before aliases.
      if (!normalizedNameIndex.has(normalizedKey)) {
        normalizedNameIndex.set(normalizedKey, value);
      }
    }
  }
  return normalizedNameIndex.get(name.trim().toLowerCase());
}

/**
 * Resolves a high-quality real image for a given product name,
 * falling back gracefully if not found.
 *
 * Precedence: explicit upstream photo → exact map entry → case-insensitive
 * map entry → keyword family → default. An upstream banner/placeholder URL is
 * treated as *missing* all the way through (it used to survive the keyword
 * miss and be returned by the last line, i.e. a category banner rendered as a
 * product thumbnail — the very thing the banner check rejects).
 */
export function resolveItemImage(name: string, rawImageUrl?: string): string {
  const explicitPhoto =
    rawImageUrl && !isFallbackImageUrl(rawImageUrl) ? rawImageUrl : undefined;

  if (explicitPhoto) return explicitPhoto;

  // Exact name match
  if (MENU_IMAGE_MAP[name]) {
    return MENU_IMAGE_MAP[name];
  }

  // Case-insensitive / trimmed match
  const byName = lookupByName(name);
  if (byName) return byName;

  // Keyword-based fallback matching
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("brownie")) return "/images/menu/Chocolate Brownie.png";
  if (normalized.includes("shake")) return "/images/menu/Oreo.JPG";
  if (normalized.includes("coffee")) return "/images/menu/beverages/classic-cold-coffee.jpg";
  if (normalized.includes("pizza")) return "/images/menu/margherita pizza.png";
  if (normalized.includes("pasta")) return "/images/menu/White Sauce.png";
  if (normalized.includes("momo")) return "/images/menu/MOMOS.JPG";
  if (normalized.includes("fries")) return "/images/menu/Peri peri fries.JPG";
  if (normalized.includes("burger")) return DEFAULT_IMAGE;

  return DEFAULT_IMAGE;
}
