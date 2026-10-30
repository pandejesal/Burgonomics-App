/**
 * Deep-link resolution for `?category=`.
 *
 * Home's shortcut pills send ids (`beverages`, `cat_burgers`, …) that are not
 * guaranteed to exist in the selected store's real category id space, so the
 * menu has to translate a URL parameter into a section without ever guessing.
 *
 * Rules, in priority order:
 * 1. An exact real id wins (ids are opaque, so a case-insensitive fallback is
 *    still a real id and never a name guess).
 * 2. A normalised name matches only when exactly one category has it.
 * 3. Anything else is `unknown` or `ambiguous` and must be shown to the user.
 *
 * There is deliberately no first-token / fuzzy fallback: the previous
 * implementation matched on any shared word, so `?category=beverages` could
 * land on "Beverages" *or* "Beverage Combos" depending on array order, and a
 * dead shortcut id silently opened the first category instead.
 */
import type { MenuCategoryModel } from "../models";

export type CategoryResolution =
  | { status: "none" }
  | { status: "unknown"; param: string }
  | { status: "ambiguous"; param: string; candidates: string[] }
  | { status: "resolved"; param: string; id: string; matchedBy: "id" | "name" };

/** Lowercase, collapse punctuation/whitespace — display names only. */
export function normalizeCategoryToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveCategoryParam(
  param: string | undefined | null,
  categories: ReadonlyArray<Pick<MenuCategoryModel, "id" | "name">>,
): CategoryResolution {
  if (typeof param !== "string") return { status: "none" };
  const raw = param.trim();
  if (!raw) return { status: "none" };

  const exact =
    categories.find((category) => category.id === raw) ??
    categories.find((category) => category.id.toLowerCase() === raw.toLowerCase());
  if (exact) return { status: "resolved", param: raw, id: exact.id, matchedBy: "id" };

  const target = normalizeCategoryToken(raw);
  if (!target) return { status: "unknown", param: raw };

  const byName = categories.filter(
    (category) => normalizeCategoryToken(category.name) === target,
  );
  if (byName.length === 1) {
    return { status: "resolved", param: raw, id: byName[0].id, matchedBy: "name" };
  }
  if (byName.length > 1) {
    return {
      status: "ambiguous",
      param: raw,
      candidates: byName.map((category) => category.name),
    };
  }
  return { status: "unknown", param: raw };
}
