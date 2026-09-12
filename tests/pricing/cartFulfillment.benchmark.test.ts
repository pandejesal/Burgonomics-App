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
  promoDiscountPercent?: number;
  promoMaxDiscount?: number;
  grillCoinsRedeemed?: number;
  deliveryDistanceKm?: number;
}

export interface CartCalculationResult {
  itemCount: number;
  subtotal: number;
  gstAmount: number;
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

    expect(result.subtotal).toBe(747);
    expect(result.gstAmount).toBe(37.35);
    expect(result.deliveryFee).toBe(50);
    expect(result.packagingFee).toBe(15);
    expect(result.discountAmount).toBe(74.7);
    expect(result.coinsDeduction).toBe(20);
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
    expect(result.finalTotal).toBe(733);
  });

  it('STRESS BENCHMARK: executes 1,000 multi-item cart calculations with sub-millisecond latency', () => {
    const testItems: CartItem[] = [
      { id: 'item_1', name: 'Smash OG Single', price: 199, quantity: 2 },
      { id: 'item_2', name: 'Double Truffle Melt', price: 349, quantity: 1 },
      { id: 'item_3', name: 'Peri Peri Loaded Fries', price: 179, quantity: 3 },
      { id: 'item_4', name: 'Cold Pressed Lemonade', price: 99, quantity: 2 },
    ];

    // JIT Warmup pass
    for (let w = 0; w < 100; w++) {
      calculateCart({
        items: testItems,
        fulfillmentMode: 'delivery',
        deliveryDistanceKm: 4,
      });
    }

    const startTime = performance.now();
    const iterations = 1000;
    let accumulatedTotal = 0;

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

      accumulatedTotal += calc.finalTotal;
    }

    const duration = performance.now() - startTime;
    const avgPerOpMs = duration / iterations;

    console.log(
      `[Benchmark: Customer App Cart] Executed ${iterations} cart recalculations in ${duration.toFixed(
        2
      )}ms (Throughput: ${(1000 / avgPerOpMs).toFixed(0)} ops/sec, Avg: ${avgPerOpMs.toFixed(4)}ms/op)`
    );

    expect(accumulatedTotal).toBeGreaterThan(0);
    expect(avgPerOpMs).toBeLessThan(0.1); // Sub-0.1ms per calculation
  });
});
