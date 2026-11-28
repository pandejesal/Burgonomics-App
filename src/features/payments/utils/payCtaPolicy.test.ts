import { describe, expect, it } from "vitest";
import { payCtaPolicy } from "./payCtaPolicy";
import { COURIER_COD_DISABLED, STORE_CLOSED, STORE_NOT_LINKED } from "./paymentFailure";

/**
 * The /payment bottom button must never read "do not pay again" for a refusal
 * that charged nothing, and must never block the one action that fixes such an
 * order (paying online). These are the cases that decide it.
 */
describe("payCtaPolicy", () => {
  it("keeps the CTA live for the delivery-cash refusal and asks for online payment", () => {
    const policy = payCtaPolicy({
      status: "failed",
      failureCode: COURIER_COD_DISABLED,
      retryable: false,
      reconciliationPending: false,
    });
    expect(policy.onlineRequired).toBe(true);
    expect(policy.payBlocked).toBe(false);
  });

  it("still blocks when reconciliation is pending, because money may have moved", () => {
    const policy = payCtaPolicy({
      status: "waiting",
      failureCode: COURIER_COD_DISABLED,
      retryable: false,
      reconciliationPending: true,
    });
    expect(policy.payBlocked).toBe(true);
    // Reconciliation outranks the code: the label must stay "under review",
    // not "Pay Online" on a disabled button.
    expect(policy.onlineRequired).toBe(false);
  });

  it("lets reconciliation outrank the other pre-write refusals too", () => {
    for (const code of [STORE_CLOSED, STORE_NOT_LINKED]) {
      const policy = payCtaPolicy({
        status: "waiting",
        failureCode: code,
        retryable: false,
        reconciliationPending: true,
      });
      expect(policy.payBlocked).toBe(true);
      expect(policy.outletClosed).toBe(false);
      expect(policy.storeNotLinked).toBe(false);
    }
  });

  it("blocks a closed outlet without calling it a reconciliation", () => {
    const policy = payCtaPolicy({
      status: "failed",
      failureCode: STORE_CLOSED,
      retryable: false,
      reconciliationPending: false,
    });
    expect(policy.payBlocked).toBe(true);
    expect(policy.outletClosed).toBe(true);
    expect(policy.onlineRequired).toBe(false);
  });

  it("blocks an unlinked outlet and names it", () => {
    const policy = payCtaPolicy({
      status: "failed",
      failureCode: STORE_NOT_LINKED,
      retryable: false,
      reconciliationPending: false,
    });
    expect(policy.payBlocked).toBe(true);
    expect(policy.storeNotLinked).toBe(true);
  });

  it("leaves a retryable failure, and a successful payment, unblocked", () => {
    expect(
      payCtaPolicy({ status: "failed", failureCode: "GATEWAY_ERROR", retryable: true, reconciliationPending: false })
        .payBlocked,
    ).toBe(false);
    expect(
      payCtaPolicy({ status: "success", failureCode: STORE_CLOSED, retryable: false, reconciliationPending: false })
        .payBlocked,
    ).toBe(false);
  });

  it("does not treat a genuinely unknown outcome as an online-required refusal", () => {
    const policy = payCtaPolicy({
      status: "failed",
      failureCode: "PAYMENT_RECONCILIATION_PENDING",
      retryable: false,
      reconciliationPending: false,
    });
    expect(policy.onlineRequired).toBe(false);
    expect(policy.payBlocked).toBe(true);
  });
});
