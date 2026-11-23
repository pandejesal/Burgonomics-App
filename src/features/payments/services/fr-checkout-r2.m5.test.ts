import { describe, expect, it } from "vitest";
import {
  cashPriceChangedPaise,
  isZeroCashDue,
  payBlockedByZeroTotal,
} from "@/features/payments/services/cashCheckoutDecision";

/** fr-checkout r2 — M5: price reconfirmation paise, zero-due and the Pay button. */
describe("M5 — server PRICE_CHANGED reconfirmation", () => {
  it("reads the server paise from the refusal's details", () => {
    expect(
      cashPriceChangedPaise({
        code: "PRICE_CHANGED",
        details: { totals: { split: { totalAmountPaise: 6200 } } },
      } as never),
    ).toBe(6200);
  });

  it("never invents a paise when the server did not send a total", () => {
    expect(cashPriceChangedPaise({ code: "PRICE_CHANGED" } as never)).toBeNull();
    expect(cashPriceChangedPaise({ code: "COD_UNAVAILABLE" } as never)).toBeNull();
  });

  it("a zero total is a valid cash amount", () => {
    expect(payBlockedByZeroTotal(0, "cash")).toBe(false);
    expect(isZeroCashDue(0)).toBe(true);
  });

  it("a zero total still blocks an online payment", () => {
    expect(payBlockedByZeroTotal(0, "online")).toBe(true);
    expect(isZeroCashDue(11900)).toBe(false);
  });
});
