/**
 * CartService — Pure pricing calculation engine and cart validation logic.
 *
 * Encapsulates all line item calculations, fee additions, GST taxes,
 * packing charges, and promo evaluation.
 */
import type { ApiResult } from "@/core/network/http";
import { ok, delay } from "@/core/network/http";
import type {
  AppliedPromo,
  CartLine,
  CartTotals,
  CartValidation,
  Fulfillment,
} from "@/features/cart/models";

// ── Fee Schedule Defaults (INR) ─────────────────────────────────────────────
const GST_TAX_RATE = 0.05; // 5% GST standard rate for food service
const PACKING_CHARGE_PER_ITEM = 5; // Packing charge per item in order
const FLAT_DELIVERY_FEE = 29; // Standard flat delivery fee for delivery orders

/**
 * Computes the unit price of a single line item including all selected modifiers.
 */
export function computeLineUnitPrice(line: CartLine): number {
  if (!line) return 0;
  const basePrice = Number.isFinite(line.unitPrice) && line.unitPrice >= 0 ? line.unitPrice : 0;
  const modifierList = Array.isArray(line.modifiers) ? line.modifiers : [];

  const modifiersTotal = modifierList.reduce((accumulated, modifier) => {
    const priceDelta = modifier && Number.isFinite(modifier.priceDelta) ? modifier.priceDelta : 0;
    return accumulated + priceDelta;
  }, 0);

  return basePrice + modifiersTotal;
}

/**
 * Computes the total line price for a item taking quantity into account.
 */
export function computeLineTotal(line: CartLine): number {
  if (!line) return 0;
  const validQuantity = Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0;
  return computeLineUnitPrice(line) * validQuantity;
}

export interface CalculateInput {
  lines: CartLine[];
  fulfillment: Fulfillment;
  promo?: AppliedPromo | null;
}

/**
 * Calculates complete order totals breakdown (subtotal, discounts, GST, fees, grand total).
 */
export function calculateTotals(input: CalculateInput): CartTotals {
  const { lines = [], fulfillment, promo } = input;

  const subtotal = lines.reduce((runningTotal, line) => {
    return runningTotal + computeLineTotal(line);
  }, 0);

  const itemDiscount = 0;
  const promoDiscount = promo?.discount ?? 0;

  const taxableAmount = Math.max(0, subtotal - itemDiscount - promoDiscount);
  const taxes = Math.round(taxableAmount * GST_TAX_RATE);

  const totalItemCount = lines.reduce((count, line) => {
    const qty = Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0;
    return count + qty;
  }, 0);

  const packingFee = lines.length ? totalItemCount * PACKING_CHARGE_PER_ITEM : 0;
  const deliveryFee = lines.length && fulfillment === "delivery" ? FLAT_DELIVERY_FEE : 0;

  const grandTotal = Math.max(
    0,
    subtotal - itemDiscount - promoDiscount + taxes + packingFee + deliveryFee,
  );

  return {
    subtotal,
    itemDiscount,
    promoDiscount,
    taxes,
    deliveryFee,
    packingFee,
    grandTotal,
    currency: "INR",
  };
}

/**
 * Validates availability of cart items prior to checkout.
 */
export async function validateCartMock(lines: CartLine[]): Promise<ApiResult<CartValidation>> {
  await delay(150);
  const issues = lines
    .filter((line) => line.availability === "unavailable")
    .map((line) => ({
      lineId: line.lineId,
      code: "unavailable" as const,
      message: line.unavailableReason ?? `${line.name} is currently out of stock.`,
    }));

  return ok({ valid: issues.length === 0, issues });
}

/**
 * Prepares a secure checkout token handle for payment processing.
 */
export async function prepareCheckoutMock(
  lines: CartLine[],
): Promise<ApiResult<{ checkoutToken: string }>> {
  await delay(200);
  if (!lines.length) {
    return {
      success: false,
      error: { code: "EMPTY_CART", message: "Your cart is empty. Please add items to proceed." },
    };
  }

  return ok({ checkoutToken: `chk_${Date.now()}` });
}
