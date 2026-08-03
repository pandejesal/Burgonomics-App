import { PaymentSpecs } from './payment.specifications';
import type { Payment } from '@prisma/client';

const base = (overrides: Partial<Payment> = {}): Payment =>
  ({
    id: 'pmt_1',
    orderId: 'ord_1',
    userId: 'u_1',
    receipt: 'r_1',
    gateway: 'razorpay',
    gatewayOrderId: 'order_1',
    gatewayPaymentId: null,
    amount: '100.00' as unknown as never,
    amountRefunded: '0.00' as unknown as never,
    currency: 'INR',
    method: null,
    status: 'CREATED',
    failureCode: null,
    failureDescription: null,
    notes: null,
    metadata: null,
    capturedAt: null,
    failedAt: null,
    verifiedAt: null,
    expiresAt: new Date(Date.now() + 5 * 60_000),
    correlationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as unknown as Payment;

describe('PaymentSpecs', () => {
  it('marks terminal states correctly', () => {
    expect(PaymentSpecs.isTerminal(base({ status: 'FAILED' }))).toBe(true);
    expect(PaymentSpecs.isTerminal(base({ status: 'REFUNDED' }))).toBe(true);
    expect(PaymentSpecs.isTerminal(base({ status: 'CREATED' }))).toBe(false);
  });

  it('allows verification only from CREATED/AUTHORIZED', () => {
    expect(PaymentSpecs.isVerifiable(base({ status: 'CREATED' }))).toBe(true);
    expect(PaymentSpecs.isVerifiable(base({ status: 'AUTHORIZED' }))).toBe(true);
    expect(PaymentSpecs.isVerifiable(base({ status: 'VERIFIED' }))).toBe(false);
  });

  it('detects expiry', () => {
    expect(PaymentSpecs.isExpired(base({ expiresAt: new Date(Date.now() - 1_000) }))).toBe(true);
    expect(PaymentSpecs.isExpired(base({ expiresAt: new Date(Date.now() + 60_000) }))).toBe(false);
  });

  it('permits refunds up to remaining balance', () => {
    const captured = base({ status: 'CAPTURED' });
    expect(PaymentSpecs.canRefund(captured, '50')).toBe(true);
    expect(PaymentSpecs.canRefund(captured, '100')).toBe(true);
    expect(PaymentSpecs.canRefund(captured, '150')).toBe(false);
    expect(PaymentSpecs.canRefund(captured, '0')).toBe(false);
  });

  it('rejects refunds on non-captured payments', () => {
    expect(PaymentSpecs.canRefund(base({ status: 'CREATED' }), '10')).toBe(false);
  });
});
