import { PaymentValidators, rupeesToPaise, paiseToRupeesString } from './payment.validators';

describe('PaymentValidators', () => {
  it('rejects non-positive amounts', () => {
    expect(() => PaymentValidators.amountRupees(0)).toThrow();
    expect(() => PaymentValidators.amountRupees(-5)).toThrow();
  });
  it('rejects >2-decimal precision', () => {
    expect(() => PaymentValidators.amountRupees(10.123)).toThrow();
  });
  it('accepts valid amounts', () => {
    expect(() => PaymentValidators.amountRupees(100.5)).not.toThrow();
  });
  it('only supports INR', () => {
    expect(() => PaymentValidators.currency('USD')).toThrow();
    expect(() => PaymentValidators.currency('INR')).not.toThrow();
  });
});

describe('paise conversion', () => {
  it('converts rupees to paise without floating drift', () => {
    expect(rupeesToPaise(100.5)).toBe(10050);
    expect(rupeesToPaise('99.99')).toBe(9999);
  });
  it('converts paise back to rupees string', () => {
    expect(paiseToRupeesString(10050)).toBe('100.50');
  });
});
