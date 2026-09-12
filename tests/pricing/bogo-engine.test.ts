import { describe, it, expect } from 'vitest';

export interface BogoItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
}

export interface BogoResult {
  qualifyingItemCount: number;
  freeItemCount: number;
  totalDiscount: number;
  finalSubtotal: number;
}

/**
 * La Pino'z style BOGO Engine:
 * For every 2 qualifying items in the cart, the cheaper item is free.
 */
export function calculateBogoDiscount(items: BogoItem[], promoCode = 'BOGO'): BogoResult {
  if (promoCode !== 'BOGO') {
    const rawSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return {
      qualifyingItemCount: 0,
      freeItemCount: 0,
      totalDiscount: 0,
      finalSubtotal: rawSubtotal,
    };
  }

  // Expand all items into individual unit prices
  const unitPrices: number[] = [];
  for (const item of items) {
    for (let q = 0; q < item.quantity; q++) {
      unitPrices.push(item.price);
    }
  }

  // Sort descending by price (highest to lowest)
  unitPrices.sort((a, b) => b - a);

  const totalUnits = unitPrices.length;
  const freeItemCount = Math.floor(totalUnits / 2);

  // Group into pairs: [0, 1], [2, 3], etc. In each pair, the second (lower or equal) is free.
  let totalDiscount = 0;
  for (let i = 0; i < freeItemCount; i++) {
    const freeItemPrice = unitPrices[i * 2 + 1];
    totalDiscount += freeItemPrice;
  }

  const rawSubtotal = unitPrices.reduce((sum, p) => sum + p, 0);
  const finalSubtotal = rawSubtotal - totalDiscount;

  return {
    qualifyingItemCount: totalUnits,
    freeItemCount,
    totalDiscount,
    finalSubtotal,
  };
}

describe('Customer App Core — La Pino\'z BOGO (Buy 1 Get 1) Engine', () => {
  it('gives 0 discount for a single item in cart', () => {
    const items: BogoItem[] = [
      { id: '1', name: 'Classic Truffle Burger', price: 299, quantity: 1, category: 'Burgers' },
    ];
    const res = calculateBogoDiscount(items, 'BOGO');

    expect(res.qualifyingItemCount).toBe(1);
    expect(res.freeItemCount).toBe(0);
    expect(res.totalDiscount).toBe(0);
    expect(res.finalSubtotal).toBe(299);
  });

  it('makes the lower-priced item free when 2 items with different prices are ordered', () => {
    const items: BogoItem[] = [
      { id: '1', name: 'Signature Double Melt', price: 349, quantity: 1, category: 'Burgers' },
      { id: '2', name: 'Classic Truffle Burger', price: 249, quantity: 1, category: 'Burgers' },
    ];
    const res = calculateBogoDiscount(items, 'BOGO');

    expect(res.qualifyingItemCount).toBe(2);
    expect(res.freeItemCount).toBe(1);
    expect(res.totalDiscount).toBe(249); // Cheaper item is free
    expect(res.finalSubtotal).toBe(349);
  });

  it('makes 1 item free when 3 items are in cart, charging the 2 most expensive items', () => {
    const items: BogoItem[] = [
      { id: '1', name: 'Supreme Burger', price: 399, quantity: 1, category: 'Burgers' },
      { id: '2', name: 'Double Melt', price: 349, quantity: 1, category: 'Burgers' },
      { id: '3', name: 'Classic Burger', price: 199, quantity: 1, category: 'Burgers' },
    ];
    // Pair 1: 399 & 349 -> 349 free
    // Leftover: 199 -> paid
    // Final: 399 + 199 = 598
    const res = calculateBogoDiscount(items, 'BOGO');

    expect(res.qualifyingItemCount).toBe(3);
    expect(res.freeItemCount).toBe(1);
    expect(res.totalDiscount).toBe(349);
    expect(res.finalSubtotal).toBe(598);
  });

  it('makes 2 items free when 4 items are in cart', () => {
    const items: BogoItem[] = [
      { id: '1', name: 'Supreme Burger', price: 400, quantity: 2, category: 'Burgers' },
      { id: '2', name: 'Classic Burger', price: 200, quantity: 2, category: 'Burgers' },
    ];
    // Units: [400, 400, 200, 200]
    // Pair 1: [400, 400] -> 400 free
    // Pair 2: [200, 200] -> 200 free
    // Total discount = 600
    // Final subtotal = 600
    const res = calculateBogoDiscount(items, 'BOGO');

    expect(res.qualifyingItemCount).toBe(4);
    expect(res.freeItemCount).toBe(2);
    expect(res.totalDiscount).toBe(600);
    expect(res.finalSubtotal).toBe(600);
  });
});
