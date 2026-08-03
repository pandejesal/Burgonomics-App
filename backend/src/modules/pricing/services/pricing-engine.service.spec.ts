import { PricingEngineService } from './pricing-engine.service';
import type { CartItemEntity } from '@modules/cart/entities/cart-item.entity';

describe('PricingEngineService', () => {
  const svc = new PricingEngineService();

  const item = (over: Partial<CartItemEntity> = {}): CartItemEntity =>
    ({
      id: 'i1',
      cartId: 'c1',
      productId: 'p1',
      productPetpoojaId: 'pp1',
      name: 'Burger',
      quantity: 2,
      unitPrice: '100',
      taxRate: '5',
      notes: null,
      modifiers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as CartItemEntity;

  it('sums subtotal from items', () => {
    const t = svc.priceCart({ items: [item()], fulfillment: 'TAKEAWAY', currency: 'INR' });
    expect(t.subtotal).toBe('200.00');
    expect(t.taxes).toBe('10.00');
  });

  it('applies delivery fee only for DELIVERY fulfillment', () => {
    const takeaway = svc.priceCart({
      items: [item()],
      fulfillment: 'TAKEAWAY',
      currency: 'INR',
      deliveryFee: 30,
    });
    expect(takeaway.deliveryFee).toBe('0.00');
    const delivery = svc.priceCart({
      items: [item()],
      fulfillment: 'DELIVERY',
      currency: 'INR',
      deliveryFee: 30,
    });
    expect(delivery.deliveryFee).toBe('30.00');
  });

  it('discounts reduce taxable base', () => {
    const t = svc.priceCart({
      items: [item()],
      fulfillment: 'TAKEAWAY',
      currency: 'INR',
      couponDiscount: '50',
    });
    expect(t.couponDiscount).toBe('50.00');
    expect(Number(t.grandTotal)).toBeLessThan(210);
  });
});
