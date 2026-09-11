import { describe, it, expect, vi } from 'vitest';

// Loop 14/120: the client preview must refuse inactive/expired coupons just
// like the server pricing engine — never promise savings refused at charge.

vi.mock('../src/core/config/firebase', () => ({ db: {} }));

const liveOffers: Record<string, any>[] = [
  {
    id: 'off_live',
    code: 'LIVE10',
    title: 'Live offer',
    status: 'active',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    discount: { mode: 'flat', value: 50 },
  },
  {
    id: 'off_dead',
    code: 'DEAD10',
    title: 'Inactive offer',
    status: 'paused',
    discount: { mode: 'flat', value: 50 },
  },
  {
    id: 'off_old',
    code: 'OLD10',
    title: 'Expired offer',
    status: 'active',
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
    discount: { mode: 'flat', value: 50 },
  },
];

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn(() => ({})),
    getDocs: vi.fn(async () => ({
      empty: false,
      forEach: (cb: (d: any) => void) =>
        liveOffers.forEach((o) => cb({ data: () => o })),
    })),
    doc: vi.fn(() => ({})),
    getDoc: vi.fn(async () => ({ exists: false })),
  };
});

import { offersService } from '../src/features/offers/services/offersService';

describe('offersService liveness gate (Loop 14/120)', () => {
  it('applies a live coupon', async () => {
    const res = await offersService.apply({ code: 'LIVE10', subtotal: 500 } as any);
    expect(res.success).toBe(true);
  });

  it('refuses an inactive coupon at apply time', async () => {
    const res = await offersService.apply({ code: 'DEAD10', subtotal: 500 } as any);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('COUPON_INACTIVE');
  });

  it('refuses an expired coupon at validate and apply time', async () => {
    const v = await offersService.validateCoupon('OLD10', { subtotal: 500 } as any);
    expect(v.success).toBe(false);
    const a = await offersService.apply({ code: 'OLD10', subtotal: 500 } as any);
    expect(a.success).toBe(false);
    if (!a.success) expect(a.error.code).toBe('COUPON_EXPIRED');
  });
});
