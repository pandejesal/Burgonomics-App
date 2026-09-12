import { describe, it, expect } from 'vitest';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export type FulfillmentMode = 'delivery' | 'takeaway' | 'dinein';

export interface CartCalculationInput {
  items: CartItem[];
  fulfillmentMode: FulfillmentMode;
  promoDiscountPercent?: number; // e.g. 10 for 10% off
  promoMaxDiscount?: number;
  grillCoinsRedeemed?: number; // 1 coin = 1 INR
  deliveryDistanceKm?: number;
}

export interface CartCalculationResult {
  itemCount: number;
  subtotal: number;
  gstAmount: number; // 5% GST
  deliveryFee: number;
  packagingFee: number;
  discountAmount: number;
  coinsDeduction: number;
  finalTotal: number;
}

export function calculateCart(input: CartCalculationInput): CartCalculationResult {
  const itemCount = input.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // 5% Restaurant GST
  const gstAmount = Math.round(subtotal * 0.05 * 100) / 100;

  // Delivery & Packaging Fees based on fulfillment mode
  let deliveryFee = 0;
  let packagingFee = 0;

  if (input.fulfillmentMode === 'delivery') {
    const dist = input.deliveryDistanceKm || 3;
    // ₹30 base up to 3km, + ₹10 per km beyond
    deliveryFee = dist <= 3 ? 30 : 30 + Math.ceil(dist - 3) * 10;
    packagingFee = 15;
  } else if (input.fulfillmentMode === 'takeaway') {
    deliveryFee = 0;
    packagingFee = 15;
  } else if (input.fulfillmentMode === 'dinein') {
    deliveryFee = 0;
    packagingFee = 0;
  }

  // Promo Discount Calculation
  let discountAmount = 0;
  if (input.promoDiscountPercent && input.promoDiscountPercent > 0) {
    const rawDiscount = (subtotal * input.promoDiscountPercent) / 100;
    discountAmount = input.promoMaxDiscount
      ? Math.min(rawDiscount, input.promoMaxDiscount)
      : rawDiscount;
    discountAmount = Math.round(discountAmount * 100) / 100;
  }

  // Grill Coins deduction
  const coinsDeduction = Math.min(input.grillCoinsRedeemed || 0, subtotal - discountAmount);

  // Final Total calculation with rounding to integer INR
  const rawTotal =
    subtotal + gstAmount + deliveryFee + packagingFee - discountAmount - coinsDeduction;
  const finalTotal = Math.max(0, Math.round(rawTotal));

  return {
    itemCount,
    subtotal,
    gstAmount,
    deliveryFee,
    packagingFee,
    discountAmount,
    coinsDeduction,
    finalTotal,
  };
}

describe('Customer App Core — 3-Way Fulfillment & Cart Stress Benchmark', () => {
  it('correctly calculates Delivery fulfillment mode pricing', () => {
    const result = calculateCart({
      items: [
        { id: '1', name: 'Truffle Smash Burger', price: 299, quantity: 2 },
        { id: '2', name: 'Peri Peri Crispy Fries', price: 149, quantity: 1 },
      ],
      fulfillmentMode: 'delivery',
      deliveryDistanceKm: 4.5,
      promoDiscountPercent: 10,
      promoMaxDiscount: 100,
      grillCoinsRedeemed: 20,
    });

    // Subtotal: 299*2 + 149 = 747
    expect(result.subtotal).toBe(747);
    // GST (5% of 747): 37.35
    expect(result.gstAmount).toBe(37.35);
    // Delivery (4.5km -> 30 + ceil(1.5)*10 = 50)
    expect(result.deliveryFee).toBe(50);
    // Packaging: 15
    expect(result.packagingFee).toBe(15);
    // Discount (10% of 747 = 74.7)
    expect(result.discountAmount).toBe(74.7);
    // Coins: 20
    expect(result.coinsDeduction).toBe(20);
    // Total: 747 + 37.35 + 50 + 15 - 74.7 - 20 = 754.65 -> rounded 755
    expect(result.finalTotal).toBe(755);
  });

  it('correctly calculates Takeaway fulfillment mode pricing with zero delivery fee', () => {
    const result = calculateCart({
      items: [{ id: '1', name: 'Double Cheese Overload', price: 349, quantity: 1 }],
      fulfillmentMode: 'takeaway',
    });

    expect(result.subtotal).toBe(349);
    expect(result.deliveryFee).toBe(0);
    expect(result.packagingFee).toBe(15);
    expect(result.gstAmount).toBe(17.45);
    // Total: 349 + 17.45 + 15 = 381.45 -> rounded 381
    expect(result.finalTotal).toBe(381);
  });

  it('correctly calculates Dine-In fulfillment mode with zero delivery and zero packaging fees', () => {
    const result = calculateCart({
      items: [{ id: '1', name: 'Double Cheese Overload', price: 349, quantity: 2 }],
      fulfillmentMode: 'dinein',
    });

    expect(result.subtotal).toBe(698);
    expect(result.deliveryFee).toBe(0);
    expect(result.packagingFee).toBe(0);
    expect(result.gstAmount).toBe(34.9);
    // Total: 698 + 34.9 = 732.9 -> rounded 733
    expect(result.finalTotal).toBe(733);
  });

  it('STRESS BENCHMARK: executes 1,000 multi-item cart calculations in under 50ms', () => {
    const testItems: CartItem[] = [
      { id: 'item_1', name: 'Smash OG Single', price: 199, quantity: 2 },
      { id: 'item_2', name: 'Double Truffle Melt', price: 349, quantity: 1 },
      { id: 'item_3', name: 'Peri Peri Loaded Fries', price: 179, quantity: 3 },
      { id: 'item_4', name: 'Cold Pressed Lemonade', price: 99, quantity: 2 },
    ];

    const startTime = performance.now();
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const mode: FulfillmentMode =
        i % 3 === 0 ? 'delivery' : i % 3 === 1 ? 'takeaway' : 'dinein';
      const calc = calculateCart({
        items: testItems,
        fulfillmentMode: mode,
        deliveryDistanceKm: 3 + (i % 10),
        promoDiscountPercent: i % 2 === 0 ? 15 : 0,
        promoMaxDiscount: 150,
        grillCoinsRedeemed: i % 5 === 0 ? 50 : 0,
      });

      expect(calc.finalTotal).toBeGreaterThan(0);
      expect(calc.itemCount).toBe(8);
    }

    const duration = performance.now() - startTime;
    console.log(
      `[Benchmark: Customer App Cart] Executed ${iterations} cart recalculations in ${duration.toFixed(
        2
      )}ms (Avg: ${(duration / iterations).toFixed(4)}ms/op)`
    );

    expect(duration).toBeLessThan(50); // Must complete in < 50ms
  });
});
