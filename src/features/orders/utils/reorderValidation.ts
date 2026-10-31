/**
 * 1-Tap Reorder planning against the LIVE outlet catalogue.
 *
 * A reorder line is a frozen snapshot: whatever stock, options and prices the
 * item had at purchase time says nothing about the outlet's current 86-board,
 * menu revisions or price list. This module turns snapshot lines plus their
 * freshly-read product details into an explicit plan:
 *
 *   - lines that may be added, priced from LIVE data (never the snapshot)
 *   - lines that must be rejected, with a customer-readable reason
 *   - price changes that the customer has to confirm BEFORE anything is added
 *
 * It is pure: the hook owns fetching, fencing and cart mutation. Nothing here
 * substitutes an option, guesses a variant, floors a quantity, or falls back to
 * a snapshot price. Invalid monetary data is a rejection — never `x || 0`.
 *
 * Finite NEGATIVE deltas are legitimate (a smaller/cheaper variation), so they
 * are preserved: only the all-in price has to stay finite and non-negative.
 */
import type { CartLine, CartModifier } from "@/features/cart/models";
import type { CustomizationGroup, ProductDetails } from "@/features/menu/models";

export type ReorderRejectionCode =
  | "product_missing"
  | "out_of_stock"
  | "variation_retired"
  | "addon_retired"
  | "quantity_invalid"
  /** The live group rules (required / min / max / single-select) no longer
   *  accept the snapshot's selection, or the snapshot itself is corrupt. */
  | "selection_invalid"
  /** Missing, non-finite or negative money that cannot be verified. */
  | "price_invalid";

export interface ReorderRejection {
  /** Item name as the customer saw it on the past order. */
  name: string;
  code: ReorderRejectionCode;
  /** Visible explanation — shown verbatim in the review dialog. */
  message: string;
}

export interface ReorderPriceChange {
  name: string;
  previousUnitPrice: number;
  nextUnitPrice: number;
}

export interface ReorderPlanLine {
  source: CartLine;
  product: ProductDetails;
  /** Modifiers rebuilt from the LIVE option rows (names and deltas). */
  modifiers: CartModifier[];
  quantity: number;
  /** All-in live unit price: base + live modifier deltas. */
  unitPrice: number;
  previousUnitPrice: number;
}

export interface ReorderPlan {
  lines: ReorderPlanLine[];
  rejected: ReorderRejection[];
  priceChanges: ReorderPriceChange[];
  hasPriceChanges: boolean;
}

/** The cart cannot hold more than 99 of one line; a snapshot above that is corrupt. */
const MAX_LINE_QUANTITY = 99;

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function resolveProductId(line: CartLine): string | undefined {
  const productId = (line as { productId?: unknown }).productId;
  return typeof productId === "string" && productId.length > 0 ? productId : undefined;
}

/**
 * A money field is only trustworthy when it is an actual finite number. An
 * absent delta means "no surcharge"; anything else (NaN, Infinity, "40", null
 * from a broken doc) is invalid data and must NOT be coerced to 0.
 */
function readMoney(raw: unknown): { ok: true; value: number } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: 0 };
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { ok: false };
  return { ok: true, value: raw };
}

function readSelectionBounds(group: CustomizationGroup): {
  minSelect: number;
  maxSelect: number | undefined;
} {
  const required = group.required === true;
  const minSelect =
    typeof group.minSelect === "number" && Number.isFinite(group.minSelect)
      ? Math.max(0, Math.floor(group.minSelect))
      : required
        ? 1
        : 0;

  const declaredMax =
    typeof group.maxSelect === "number" && Number.isFinite(group.maxSelect)
      ? Math.max(0, Math.floor(group.maxSelect))
      : undefined;
  // A single-select group can never hold more than one option, so the live
  // declaration cannot widen it past 1 (a corrupt max="5" must not let a
  // radio group carry five options).
  const maxSelect = group.selection === "single" ? Math.min(declaredMax ?? 1, 1) : declaredMax;

  return { minSelect, maxSelect };
}

/**
 * Map snapshot modifiers onto the live customization model and check the live
 * group rules. A missing group, a missing/86ed option, a duplicate selection,
 * a required group the customer no longer satisfies, or a broken price is a
 * rejection — never a substitution and never a silent drop.
 */
function resolveModifiers(
  line: CartLine,
  groups: CustomizationGroup[],
): { ok: true; modifiers: CartModifier[] } | { ok: false; reason: ReorderRejectionCode } {
  const groupById = new Map(groups.map((group) => [String(group.id), group]));
  const selectedByGroup = new Map<string, CartModifier[]>();
  const resolved: CartModifier[] = [];

  for (const modifier of line.modifiers ?? []) {
    const group = groupById.get(String(modifier.groupId));
    if (!group) {
      // The whole group disappeared from the live menu (retired variation or
      // add-on section) — the snapshot cannot be honoured.
      return { ok: false, reason: "variation_retired" };
    }
    const option = group.options.find(
      (candidate) => String(candidate.id) === String(modifier.optionId),
    );
    if (!option) {
      // A single-select group is the item's size/variation; a multi-select
      // group is an add-on. Both are rejections, but the customer copy differs.
      return {
        ok: false,
        reason: group.selection === "single" ? "variation_retired" : "addon_retired",
      };
    }
    if (option.outOfStock === true) {
      return {
        ok: false,
        reason: group.selection === "single" ? "variation_retired" : "addon_retired",
      };
    }
    const delta = readMoney(option.priceDelta);
    if (!delta.ok) return { ok: false, reason: "price_invalid" };

    const groupKey = String(group.id);
    const optionKey = String(option.id);
    const bucket = selectedByGroup.get(groupKey) ?? [];
    if (bucket.some((chosen) => chosen.optionId === optionKey)) {
      // The same option twice in one group would be charged twice and is a
      // corrupt snapshot, not something the customer can be shown as valid.
      return { ok: false, reason: "selection_invalid" };
    }

    const live: CartModifier = {
      groupId: groupKey,
      groupName: group.name,
      optionId: optionKey,
      name: option.name,
      priceDelta: delta.value,
    };
    bucket.push(live);
    selectedByGroup.set(groupKey, bucket);
    resolved.push(live);
  }

  // Live cardinality: a newly-required group, a raised min, a lowered max or a
  // single-select group with several snapshot rows must all block the add.
  for (const group of groups) {
    const chosen = selectedByGroup.get(String(group.id)) ?? [];
    const { minSelect, maxSelect } = readSelectionBounds(group);
    if (chosen.length < minSelect) return { ok: false, reason: "selection_invalid" };
    if (maxSelect !== undefined && chosen.length > maxSelect) {
      return { ok: false, reason: "selection_invalid" };
    }
  }

  return { ok: true, modifiers: resolved };
}

function rejectionMessage(name: string, code: ReorderRejectionCode): string {
  switch (code) {
    case "product_missing":
      return `${name} is no longer on this outlet's menu.`;
    case "out_of_stock":
      return `${name} is out of stock right now.`;
    case "variation_retired":
      return `${name} is missing its selected size/variation on the current menu.`;
    case "addon_retired":
      return `${name} has an add-on that is no longer available.`;
    case "quantity_invalid":
      return `${name} has no valid quantity to reorder.`;
    case "selection_invalid":
      return `${name} needs its menu choices reviewed — the options changed since that order.`;
    case "price_invalid":
      return `${name} has a price we can't verify right now.`;
  }
}

/**
 * Build the plan. `details` is the live read keyed by product id; a `null`
 * value means "this id is not on the outlet menu", which is a rejection — a
 * failed READ is handled by the caller and must not reach here.
 */
export function buildReorderPlan(
  sourceLines: readonly CartLine[],
  details: ReadonlyMap<string, ProductDetails | null>,
): ReorderPlan {
  const lines: ReorderPlanLine[] = [];
  const rejected: ReorderRejection[] = [];
  const priceChanges: ReorderPriceChange[] = [];

  for (const line of sourceLines) {
    const name = line.name || "This item";
    const productId = resolveProductId(line);

    if (!productId) {
      rejected.push({
        name,
        code: "product_missing",
        message: rejectionMessage(name, "product_missing"),
      });
      continue;
    }

    const product = details.get(productId) ?? null;
    if (!product) {
      rejected.push({
        name,
        code: "product_missing",
        message: rejectionMessage(name, "product_missing"),
      });
      continue;
    }
    if (product.inStock !== true) {
      rejected.push({
        name,
        code: "out_of_stock",
        message: rejectionMessage(name, "out_of_stock"),
      });
      continue;
    }

    // Integer 1..99 only. A snapshot quantity of 1.5 or 250 is corrupt data and
    // must be rejected, not floored/clamped into a different number than the
    // customer sees.
    const quantity = (line as { quantity?: unknown }).quantity;
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_LINE_QUANTITY
    ) {
      rejected.push({
        name,
        code: "quantity_invalid",
        message: rejectionMessage(name, "quantity_invalid"),
      });
      continue;
    }

    // The base price has no "absent means zero" reading: a missing price is
    // unverifiable money, so the line is rejected rather than priced at ₹0.
    const baseRaw = (product as { price?: unknown }).price;
    const basePrice: { ok: boolean; value: number } =
      typeof baseRaw === "number" && Number.isFinite(baseRaw)
        ? { ok: true, value: baseRaw }
        : { ok: false, value: 0 };
    if (!basePrice.ok || basePrice.value < 0) {
      rejected.push({
        name,
        code: "price_invalid",
        message: rejectionMessage(name, "price_invalid"),
      });
      continue;
    }

    const modifierResult = resolveModifiers(line, product.customizations ?? []);
    if (!modifierResult.ok) {
      rejected.push({
        name,
        code: modifierResult.reason,
        message: rejectionMessage(name, modifierResult.reason),
      });
      continue;
    }

    const modifierDelta = modifierResult.modifiers.reduce(
      (sum, modifier) => sum + modifier.priceDelta,
      0,
    );
    const unitPrice = round2(basePrice.value + modifierDelta);
    // A cheaper variation is fine (negative deltas are legitimate), but the
    // all-in price must still be a finite, non-negative amount.
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      rejected.push({
        name,
        code: "price_invalid",
        message: rejectionMessage(name, "price_invalid"),
      });
      continue;
    }

    const previousPrice = readMoney((line as { unitPrice?: unknown }).unitPrice);
    const previousUnitPrice =
      previousPrice.ok && previousPrice.value >= 0 ? round2(previousPrice.value) : unitPrice;

    if (unitPrice !== previousUnitPrice) {
      priceChanges.push({ name, previousUnitPrice, nextUnitPrice: unitPrice });
    }

    lines.push({
      source: line,
      product,
      modifiers: modifierResult.modifiers,
      quantity,
      unitPrice,
      previousUnitPrice,
    });
  }

  return { lines, rejected, priceChanges, hasPriceChanges: priceChanges.length > 0 };
}

/** Fulfilment modes the customer app can actually place today. */
export const SUPPORTED_FULFILLMENTS = ["delivery", "takeaway", "dinein"] as const;

export type SupportedFulfillment = (typeof SUPPORTED_FULFILLMENTS)[number];

export function isSupportedFulfillment(value: unknown): value is SupportedFulfillment {
  return typeof value === "string" && (SUPPORTED_FULFILLMENTS as readonly string[]).includes(value);
}

/**
 * Legacy availability gate kept for the tracking-reorder contract.
 *
 * Splits a snapshot basket against a live catalogue read. Fail-closed: a line
 * without a product reference, a product missing from the catalogue, or an
 * item that is not explicitly in stock is unavailable. An empty catalogue
 * (a failed read) makes every line unavailable.
 */
export interface ReorderItemRef {
  productId?: string;
  name?: string;
}

export interface ReorderAvailability {
  reOrderable: ReorderItemRef[];
  unavailableItems: string[];
}

export function validateReorderItems(
  items: readonly ReorderItemRef[],
  liveCatalog: readonly { id: string; name?: string; inStock: boolean }[],
): ReorderAvailability {
  const byId = new Map(liveCatalog.map((entry) => [String(entry.id), entry]));
  const reOrderable: ReorderItemRef[] = [];
  const unavailableItems: string[] = [];

  for (const item of items) {
    const productId =
      typeof item.productId === "string" && item.productId.length > 0 ? item.productId : undefined;
    const name = item.name || "This item";
    const live = productId ? byId.get(productId) : undefined;
    if (!productId || !live || live.inStock !== true) {
      unavailableItems.push(name);
      continue;
    }
    reOrderable.push(item);
  }

  return { reOrderable, unavailableItems };
}

/**
 * Identity of a plan as the customer would see it. Used by the hook to decide
 * whether a fresh read at confirmation time produced the SAME offer the open
 * dialog is describing, or a different one that must be shown again.
 */
export function planSignature(plan: ReorderPlan): string {
  const lineKey = plan.lines
    .map(
      (line) =>
        `${String(line.product.id)}|${line.quantity}|${line.unitPrice}|${line.modifiers
          .map((modifier) => `${modifier.groupId}:${modifier.optionId}:${modifier.priceDelta}`)
          .join("+")}`,
    )
    .sort()
    .join(";");
  const rejectedKey = plan.rejected
    .map((entry) => `${entry.name}:${entry.code}`)
    .sort()
    .join(";");
  return `${lineKey}#${rejectedKey}`;
}
