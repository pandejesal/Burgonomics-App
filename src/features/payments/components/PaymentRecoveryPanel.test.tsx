/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// C01 (A08 B9): rendered evidence that the post-gateway recovery surface shows
// the exact payment id, an explicit do-not-pay-again instruction, support and
// existing-order actions, and NO Retry/Pay action - for the four fixture
// states that used to strand payers on a spinner or invite a double charge.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(async () => {}), selection: vi.fn(), notification: vi.fn(async () => {}) },
}));
vi.mock("@/core/services/audio", () => ({
  AudioService: { playClick: vi.fn(), playSuccess: vi.fn() },
}));

import { PaymentRecoveryPanel } from "./PaymentRecoveryPanel";
import { resolveVerifyOutcome } from "@/features/payments/utils/paymentRecovery";
import { fail, ok } from "@/core/network/http";
import type { PaymentVerification } from "@/features/payments/models";

let root: Root | null = null;
let host: HTMLElement | null = null;

async function renderPanel(
  props: React.ComponentProps<typeof PaymentRecoveryPanel>,
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<PaymentRecoveryPanel {...props} />));
  return host;
}

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
});

const buttonLabels = () =>
  Array.from(document.querySelectorAll("button")).map((b) => b.textContent?.trim() ?? "");

// The four fixture states (ApiResult shapes exactly as paymentsService returns
// them on the wire - see tests/payment-response-wire.test.ts for the HTTP
// mapping that produces each one).
const FIXTURES: Array<{
  name: string;
  reason: string;
  verify: Parameters<typeof resolveVerifyOutcome>[0]["verify"];
}> = [
  {
    name: "503 SERVICE_UNAVAILABLE after the gateway opened",
    reason: "PAYMENT_SYNC_PENDING",
    verify: fail("SERVICE_UNAVAILABLE", "backend unavailable", true),
  },
  {
    name: "bad signature (401 INVALID_SIGNATURE)",
    reason: "PAYMENT_SYNC_PENDING",
    verify: fail("INVALID_SIGNATURE", "Signature mismatch", false),
  },
  {
    name: "finalize threw after a verified payment",
    reason: "PAYMENT_SYNC_PENDING",
    // The call sites route a thrown finalize straight to PAYMENT_SYNC_PENDING
    // reconciliation; a failed verify-with-code mirrors the same decision.
    verify: fail("VERIFY_GATEWAY_ERROR", "Failed to finish order after payment.", true),
  },
  {
    name: "exhausted 202 TRANSFER_IN_PROGRESS (bounded same-request retry)",
    reason: "TRANSFER_IN_PROGRESS",
    verify: fail("TRANSFER_IN_PROGRESS", "Transfer in progress", true),
  },
];

describe("PaymentRecoveryPanel - rendered recovery states (C01 / A08 B9)", () => {
  it.each(FIXTURES)("$name: exact payment id, do-not-pay-again, support + orders, no new pay", async (fx) => {
    const outcome = resolveVerifyOutcome({
      verify: fx.verify,
      internalOrderId: "ord_fixture",
      gatewayOrderId: "order_rzp_fixture",
      paymentId: "pay_fixture_42",
    });

    // Decision-layer invariant: none of these states may ever reach the
    // markPaymentFailed branch at any call site.
    expect(outcome.kind).toBe("reconciliation");
    if (outcome.kind !== "reconciliation") return;
    expect(outcome.reason).toBe(fx.reason);

    const onContactSupport = vi.fn();
    const onCheckOrders = vi.fn();
    await renderPanel({
      reason: outcome.reason,
      paymentId: outcome.paymentId ?? null,
      orderId: outcome.gatewayOrderId,
      onContactSupport,
      onCheckOrders,
    });

    const text = host!.textContent ?? "";
    // Exact payment id from the callback is rendered...
    expect(text).toContain("pay_fixture_42");
    // ...with the do-not-pay-again instruction...
    expect(text).toContain("Do not pay again");
    // ...and never the old false "no money has been charged" reassurance.
    expect(text).not.toContain("no money has been charged");

    // Only support + existing-order recovery: no Retry / Pay / Try again.
    const labels = buttonLabels();
    expect(labels).toEqual(["Contact support", "Check my orders"]);
    expect(labels.join(" ")).not.toMatch(/retry|pay again|try again/i);

    const [supportBtn, ordersBtn] = Array.from(document.querySelectorAll("button"));
    await act(async () => supportBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => ordersBtn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onContactSupport).toHaveBeenCalledTimes(1);
    expect(onCheckOrders).toHaveBeenCalledTimes(1);
  });

  it("PAYMENT_NOT_CAPTURED (held authorization): no new pay, support-led release path", async () => {
    const outcome = resolveVerifyOutcome({
      verify: fail("PAYMENT_NOT_CAPTURED", "payment not captured", false),
      internalOrderId: "ord_hold",
      gatewayOrderId: "order_rzp_hold",
      paymentId: "pay_hold_7",
    });
    expect(outcome.kind).toBe("reconciliation");
    if (outcome.kind !== "reconciliation") return;

    await renderPanel({
      reason: outcome.reason,
      paymentId: outcome.paymentId ?? null,
      orderId: null,
      onContactSupport: vi.fn(),
      onCheckOrders: vi.fn(),
    });

    const text = host!.textContent ?? "";
    expect(text).toContain("pay_hold_7");
    expect(text).toContain("Do not pay again until its status is resolved");
    expect(text).toContain("pending authorization");
    expect(buttonLabels()).toEqual(["Contact support", "Check my orders"]);
  });

  it("ORDER_TERMINAL: recovery is 'open the order', never pay again", async () => {
    const outcome = resolveVerifyOutcome({
      verify: fail("ORDER_TERMINAL", "Order already terminal", false),
      internalOrderId: "ord_terminal",
      gatewayOrderId: "order_rzp_terminal",
      paymentId: "pay_terminal_1",
    });
    expect(outcome.kind).toBe("reconciliation");
    if (outcome.kind !== "reconciliation") return;

    await renderPanel({
      reason: outcome.reason,
      paymentId: outcome.paymentId ?? null,
      orderId: null,
      onContactSupport: vi.fn(),
      onCheckOrders: vi.fn(),
    });

    const text = host!.textContent ?? "";
    expect(text).toContain("Order needs review");
    expect(text).not.toContain("Order already confirmed");
    expect(text).toContain("Do not pay again");
    expect(buttonLabels()).toEqual(["Contact support", "Check my orders"]);
  });

  it("falls back to the order reference when the payment id is unknown (post-reload)", async () => {
    // No callback after a reload: only the gateway order id survived.
    await renderPanel({
      reason: "PAYMENT_SYNC_PENDING",
      paymentId: null,
      orderId: "order_rzp_reloaded",
      onContactSupport: vi.fn(),
      onCheckOrders: vi.fn(),
    });

    const text = host!.textContent ?? "";
    expect(text).toContain("order_rzp_reloaded");
    expect(text).not.toContain("undefined");
  });

  it("does not claim verification success for an unverified 200 envelope", () => {
    const outcome = resolveVerifyOutcome({
      verify: ok({ verified: false, confirmedOrderId: "", paymentId: "pay_x" } as PaymentVerification),
      internalOrderId: "ord_x",
      gatewayOrderId: "order_rzp_x",
      paymentId: "pay_x",
    });
    expect(outcome.kind).toBe("reconciliation");
    if (outcome.kind !== "reconciliation") return;
    expect(outcome.reason).toBe("PAYMENT_SYNC_PENDING");
    expect(outcome.serverCode).toBe("VERIFICATION_FAILED");
  });
});
