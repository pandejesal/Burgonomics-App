/**
 * 1-Tap Reorder availability validation against the LIVE branch catalog.
 *
 * A reorder line is added from a frozen order snapshot: whatever stock state
 * the item had at purchase time says nothing about the outlet's current
 * 86-board. The previous implementation of this rule lived only inside the
 * test file, so the shipping reorder flow added snapshot lines unchecked and
 * even renewed the cart's price lock — which defers exactly the menu
 * revalidation that would have caught it (useReorderItems + cartStore).
 *
 * Fail-closed, matching the menu contract in `menuService.mapProductDoc`: a
 * product that is missing from the live catalog or not explicitly
 * `inStock === true` is treated as unavailable. Pricing is NOT decided here —
 * the server's authoritative pricing gate and the cart's own revalidation
 * remain the only price truth; this function only decides re-orderability.
 */

export interface ReorderItemRef {
  /** Snapshot cart lines carry the product reference in `productId`. */
  productId?: string;
  name: string;
}

export interface ReorderCatalogItem {
  id: string;
  inStock: boolean;
}

export interface ReorderValidationResult {
  /** Names of items that must NOT be added to the cart. */
  unavailableItems: string[];
  /** Snapshot items that cleared the live availability check. */
  reOrderable: ReorderItemRef[];
}

export function validateReorderItems(
  pastItems: readonly ReorderItemRef[],
  liveCatalog: readonly ReorderCatalogItem[],
): ReorderValidationResult {
  const live = new Map(liveCatalog.map((item) => [item.id, item]));

  const unavailableItems: string[] = [];
  const reOrderable: ReorderItemRef[] = [];

  for (const item of pastItems) {
    const liveItem = item.productId ? live.get(item.productId) : undefined;
    if (!liveItem || liveItem.inStock !== true) {
      unavailableItems.push(item.name);
      continue;
    }
    reOrderable.push(item);
  }

  return { unavailableItems, reOrderable };
}
