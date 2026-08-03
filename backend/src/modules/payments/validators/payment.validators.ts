import { ValidationError } from '@common/errors';
import { MAX_PAYMENT_AMOUNT, MIN_PAYMENT_AMOUNT } from '../constants';

export const PaymentValidators = {
  amountRupees(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError('Amount must be a positive number');
    }
    if (amount < MIN_PAYMENT_AMOUNT) {
      throw new ValidationError(`Amount must be ≥ ₹${MIN_PAYMENT_AMOUNT}`);
    }
    if (amount > MAX_PAYMENT_AMOUNT) {
      throw new ValidationError(`Amount must be ≤ ₹${MAX_PAYMENT_AMOUNT}`);
    }
    const rounded = Math.round(amount * 100);
    if (Math.abs(rounded / 100 - amount) > 1e-9) {
      throw new ValidationError('Amount has more than 2 decimals of precision');
    }
  },
  currency(currency: string): void {
    if (currency !== 'INR') {
      throw new ValidationError(`Currency ${currency} is not supported`);
    }
  },
  receipt(receipt: string): void {
    if (!receipt || receipt.length > 40) {
      throw new ValidationError('Receipt must be 1–40 chars');
    }
  },
} as const;

export function rupeesToPaise(amount: number | string): number {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return Math.round(n * 100);
}

export function paiseToRupeesString(paise: number): string {
  return (paise / 100).toFixed(2);
}
