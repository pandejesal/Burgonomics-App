import { describe, it, expect } from 'vitest';
import {
  validateReorderItems,
  type ReorderItemRef,
} from '../src/features/orders/utils/reorderValidation';

/**
 * 1-Tap Reorder live-catalog gate.
 *
 * The availability rule this suite pins USED to live only here in the test
 * file (a `validate1TapReorder` nothing in src/ imported) — the shipping
 * reorder hook added snapshot lines unchecked and renewed the cart price lock
 * that deferred the very revalidation that would have caught it. The rule now
 * exists in production (`src/features/orders/utils/reorderValidation.ts`) and
 * is wired into `useReorderItems`; these tests import the production module.
 */

interface CatalogItem {
  id: string;
  name: string;
  inStock: boolean;
}

describe('Customer App — 1-Tap Reorder live-catalog availability gate', () => {
  const liveCatalog: CatalogItem[] = [
    { id: 'p1', name: 'Classic Smash Burger', inStock: true },
    { id: 'p2', name: 'Double Truffle Melt', inStock: true },
    { id: 'p3', name: 'Peri Peri Fries', inStock: false }, // 86ed on the outlet board
  ];

  const item = (productId: string, name: string): ReorderItemRef => ({ productId, name });

  it('accepts every item whose live product is explicitly in stock', () => {
    const result = validateReorderItems(
      [item('p1', 'Classic Smash Burger'), item('p2', 'Double Truffle Melt')],
      liveCatalog,
    );

    expect(result.unavailableItems).toHaveLength(0);
    expect(result.reOrderable).toHaveLength(2);
  });

  it('fails closed for an 86ed product (explicit inStock:false)', () => {
    const result = validateReorderItems([item('p3', 'Peri Peri Fries')], liveCatalog);

    expect(result.unavailableItems).toEqual(['Peri Peri Fries']);
    expect(result.reOrderable).toHaveLength(0);
  });

  it('fails closed for a product missing from the live catalog', () => {
    const result = validateReorderItems([item('p_deleted', 'Retired Burger')], liveCatalog);

    expect(result.unavailableItems).toEqual(['Retired Burger']);
  });

  it('fails closed for a snapshot line without a product reference', () => {
    const result = validateReorderItems([{ name: 'Mystery Item' }], liveCatalog);

    expect(result.unavailableItems).toEqual(['Mystery Item']);
  });

  it('fails closed when the live catalog could not be read (empty catalog)', () => {
    const result = validateReorderItems(
      [item('p1', 'Classic Smash Burger'), item('p2', 'Double Truffle Melt')],
      [],
    );

    expect(result.unavailableItems).toEqual(['Classic Smash Burger', 'Double Truffle Melt']);
    expect(result.reOrderable).toHaveLength(0);
  });

  it('splits a mixed basket into re-orderable and unavailable (modal contract)', () => {
    const result = validateReorderItems(
      [item('p1', 'Classic Smash Burger'), item('p3', 'Peri Peri Fries')],
      liveCatalog,
    );

    expect(result.unavailableItems).toEqual(['Peri Peri Fries']);
    expect(result.reOrderable).toHaveLength(1);
    expect(result.reOrderable[0].productId).toBe('p1');
  });
});
