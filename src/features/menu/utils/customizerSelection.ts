/**
 * Customizer selection rules, kept pure so the money- and cardinality-sensitive
 * decisions can be tested without a modal.
 *
 * The model allows a NEGATIVE `priceDelta` (a discount), so negative deltas are
 * legitimate. What must never pass: a non-finite price/delta, a negative base
 * price, or a basket of selections whose combined unit price drops below zero.
 */
import type { CustomizationGroup, CustomizationOption } from "../models";

export type ModifierSelections = Record<string, string[]>;

/** Real, non-negative money. */
export function isValidMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** A finite delta, including legitimate negative discount deltas. */
export function isValidDelta(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Options a customer may actually pick right now. */
export function isOptionSelectable(option: CustomizationOption | undefined): boolean {
  if (!option) return false;
  if (option.outOfStock === true) return false;
  return isValidDelta(option.priceDelta);
}

export function minSelections(group: CustomizationGroup): number {
  const declared = Math.floor(group.minSelect ?? (group.required ? 1 : 0));
  const min = Number.isFinite(declared) ? Math.max(0, declared) : 0;
  return Math.min(min, maxSelections(group));
}

export function maxSelections(group: CustomizationGroup): number {
  if (group.selection === "single") return 1;
  const declared = Math.floor(group.maxSelect ?? 0);
  return Number.isFinite(declared) && declared > 0 ? declared : Number.POSITIVE_INFINITY;
}

/**
 * Defaults for mandatory single-choice groups: an in-stock flagged default,
 * else the first in-stock option. A group whose options are all 86ed gets NO
 * selection — the old `|| options[0]` auto-selected an unavailable option and
 * let the add go through.
 */
export function defaultSelections(groups: ReadonlyArray<CustomizationGroup>): ModifierSelections {
  const next: ModifierSelections = {};
  for (const group of groups) {
    if (group.selection !== "single" || !group.required) continue;
    const selectable = group.options.filter(isOptionSelectable);
    const preferred = selectable.find((option) => option.isDefault) ?? selectable[0];
    if (preferred) next[group.id] = [preferred.id];
  }
  return next;
}

/**
 * Drop unknown/retired/out-of-stock options, de-duplicate and clamp each group
 * to its cardinality. Used for both user toggles and "repeat last
 * customization", so a cart line cannot resurrect a retired modifier.
 */
export function sanitizeSelections(
  groups: ReadonlyArray<CustomizationGroup>,
  selections: ModifierSelections,
): ModifierSelections {
  const next: ModifierSelections = {};
  for (const group of groups) {
    const selectable = new Set(group.options.filter(isOptionSelectable).map((option) => option.id));
    const current = selections[group.id] ?? [];
    const unique = [...new Set(current)].filter(
      (optionId) => typeof optionId === "string" && selectable.has(optionId),
    );
    next[group.id] = unique.slice(0, maxSelections(group));
  }
  return next;
}

export function isSelectionValid(
  groups: ReadonlyArray<CustomizationGroup>,
  selections: ModifierSelections,
): boolean {
  for (const group of groups) {
    const chosen = selections[group.id] ?? [];
    const selectable = new Set(group.options.filter(isOptionSelectable).map((option) => option.id));
    if (chosen.some((optionId) => !selectable.has(optionId))) return false;
    if (new Set(chosen).size !== chosen.length) return false;
    const count = chosen.length;
    if (count < minSelections(group)) return false;
    if (count > maxSelections(group)) return false;
    if (group.required && count < 1) return false;
  }
  return true;
}

/**
 * Unit price = base + selected deltas. Returns `null` when the base price is
 * not real money or the combined result is negative/non-finite, so the CTA can
 * refuse instead of rendering a made-up number.
 */
export function unitPriceFor(
  basePrice: unknown,
  groups: ReadonlyArray<CustomizationGroup>,
  selections: ModifierSelections,
): number | null {
  if (!isValidMoney(basePrice)) return null;
  let total = basePrice;
  for (const group of groups) {
    const chosen = selections[group.id] ?? [];
    for (const optionId of chosen) {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!isOptionSelectable(option)) continue;
      total += option!.priceDelta;
    }
  }
  if (!Number.isFinite(total) || total < 0) return null;
  return total;
}

export function isValidQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99;
}
