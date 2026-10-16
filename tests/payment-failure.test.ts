import { describe, it, expect } from "vitest";

// Pins the money-safety branches of the payment FailurePanel against the
// REAL decision helper: a wrong branch either invites a double charge (Retry
// on paid money) or strands a payer (no support path).

import { describePaymentFailure } from "../src/features/payments/utils/paymentFailure";

describe("Payment FailurePanel branches (real decision logic)", () => {
  it("paid-but-no-order hides Retry, shows support, never claims no charge", () => {
    const c = describePaymentFailure({
      status: "failed",
      message: "Payment of pay_123 succeeded but the order could not be created.",
      retryable: false,
    });
    expect(c.title).toBe("Payment received — order pending");
    expect(c.showRetry).toBe(false);
    expect(c.showContactSupport).toBe(true);
    expect(c.body).toContain("Do not pay again");
    expect(c.body).not.toContain("no money has been charged");
    // No refund promise: we can't promise an outcome we haven't verified.
    expect(c.body).not.toMatch(/refund/i);
    expect(c.body).toContain("we will look into it");
  });

  it("ordinary failures offer a safe Retry without a charge absolute", () => {
    const c = describePaymentFailure({
      status: "failed",
      message: "Verification failed.",
      retryable: true,
    });
    expect(c.title).toBe("Payment failed");
    expect(c.showRetry).toBe(true);
    expect(c.showContactSupport).toBe(false);
    expect(c.body).toContain("You can try again");
    // The old "no money has been charged" reassurance was unverifiable.
    expect(c.body).not.toContain("no money has been charged");
  });

  it("cancellations keep the abandonment copy with Retry", () => {
    const c = describePaymentFailure({
      status: "cancelled",
      message: "You closed the payment window.",
      retryable: true,
    });
    expect(c.title).toBe("Payment cancelled");
    expect(c.showRetry).toBe(true);
    expect(c.body).not.toContain("no money has been charged");
  });

  it("no branch promises a refund or asserts money did not move", () => {
    const cases = [
      { status: "failed", message: "x", retryable: false },
      { status: "failed", message: "x", retryable: true },
      { status: "cancelled", message: "x", retryable: true },
    ];
    for (const input of cases) {
      const c = describePaymentFailure(input);
      expect(c.body).not.toMatch(/refund/i);
      expect(c.body).not.toContain("no money has been charged");
    }
  });
});
