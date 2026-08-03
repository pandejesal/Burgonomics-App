import type { Payment, Refund } from '@prisma/client';

/**
 * Specifications encode invariants for the Payments domain. They are
 * pure functions used by services to guard state transitions.
 */
export const PaymentSpecs = {
  isTerminal(p: Payment): boolean {
    return (
      p.status === 'FAILED' ||
      p.status === 'REFUNDED' ||
      p.status === 'CANCELLED' ||
      p.status === 'EXPIRED'
    );
  },
  isVerifiable(p: Payment): boolean {
    return p.status === 'CREATED' || p.status === 'AUTHORIZED';
  },
  isCaptured(p: Payment): boolean {
    return p.status === 'CAPTURED' || p.status === 'VERIFIED';
  },
  canRefund(p: Payment, deltaRupees: string): boolean {
    if (!PaymentSpecs.isCaptured(p) && p.status !== 'PARTIALLY_REFUNDED') return false;
    const remaining = Number(p.amount) - Number(p.amountRefunded);
    const delta = Number(deltaRupees);
    return remaining > 0 && delta > 0 && delta <= remaining + 1e-6;
  },
  isExpired(p: Payment): boolean {
    return Boolean(p.expiresAt && p.expiresAt.getTime() < Date.now());
  },
  hasBeenRefunded(refunds: Refund[]): boolean {
    return refunds.some((r) => r.status === 'PROCESSED');
  },
} as const;
