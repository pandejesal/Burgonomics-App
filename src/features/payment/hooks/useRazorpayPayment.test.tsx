/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/core/network/http";

// C01 call-site regression (A08 B1/B9): drives the REAL useRazorpayPayment
// hook through the four post-gateway fixture states and asserts the money
// invariants at the call site itself - reconciliation persisted (uid-scoped),
// status waiting (recovery panel, not a failed/re-pay state), no
// markPaymentFailed, no cart clear, no confirmation navigation.

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  createPaymentOrder: vi.fn(),
  verifyPayment: vi.fn(),
  initialize: vi.fn(async () => {}),
  openCheckout: vi.fn(),
  markPaymentFailed: vi.fn(async () => ({ success: true, data: { id: "ord" } })),
  finalizePaidOrder: vi.fn(async (): Promise<ApiResult<{ id: string }>> => ({ success: true, data: { id: "ord_final" } })),
  cartClear: vi.fn(async () => ({ success: true })),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/core/services/audio", () => ({
  AudioService: { playSuccess: vi.fn(), playClick: vi.fn() },
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { notification: vi.fn(async () => {}), impact: vi.fn(async () => {}), selection: vi.fn() },
}));
vi.mock("@/features/orders", () => ({
  orderRepository: {
    markPaymentFailed: mocks.markPaymentFailed,
    finalizePaidOrder: mocks.finalizePaidOrder,
  },
}));
vi.mock("@/features/cart", () => ({
  cartRepository: { clear: mocks.cartClear },
}));
vi.mock("@/features/auth/state/authStore", async () => {
  const { create } = await import("zustand");
  const useAuthStore = create(() => ({
    user: { id: "cust_hook_1", name: "Test Customer", phone: "+910000000000" },
    isBootstrapped: true,
  }));
  return { useAuthStore, selectIsAuthenticated: (s: { user: unknown }) => !!s.user };
});
vi.mock("@/features/payments", async () => {
  const { usePaymentStore } = await vi.importActual<
    typeof import("@/features/payments/state/paymentStore")
  >("@/features/payments/state/paymentStore");
  return {
    usePaymentStore,
    paymentRepository: {
      createPaymentOrder: mocks.createPaymentOrder,
      verifyPayment: mocks.verifyPayment,
      cancelPayment: vi.fn(),
      retryPayment: vi.fn(),
      validateForPayment: vi.fn(),
      getPaymentStatus: vi.fn(),
    },
    razorpayAdapter: {
      initialize: mocks.initialize,
      openCheckout: mocks.openCheckout,
    },
  };
});

import { useRazorpayPayment } from "./useRazorpayPayment";
import { usePaymentStore } from "@/features/payments/state/paymentStore";
import { fail, ok } from "@/core/network/http";
import { toast } from "sonner";
import { userMessageFor } from "@/core/errors/userMessages";

const GATEWAY_ORDER = {
  orderId: "order_rzp_hook",
  razorpayOrderId: "order_rzp_hook",
  keyId: "rzp_test_key",
  amount: 199,
  currency: "INR" as const,
  receipt: "rcpt_hook",
};

const CALLBACK_RESULT = {
  orderId: "order_rzp_hook",
  paymentId: "pay_hook_1",
  signature: "sig_hook_1",
  method: "upi" as const,
};

let root: Root | null = null;
let hook: ReturnType<typeof useRazorpayPayment> | null = null;

function Probe() {
  hook = useRazorpayPayment();
  return null;
}

async function mountHook() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Probe />));
}

/** Run one full checkout attempt: create -> popup -> onSuccess(fixture). */
async function runCheckout(verifyResult: unknown) {
  mocks.createPaymentOrder.mockResolvedValue(ok(GATEWAY_ORDER));
  mocks.verifyPayment.mockResolvedValue(verifyResult);
  mocks.openCheckout.mockImplementation(async (handlers: {
    onSuccess: (r: typeof CALLBACK_RESULT) => Promise<void> | void;
  }) => {
    await handlers.onSuccess(CALLBACK_RESULT);
  });
  await act(async () => {
    await hook!.initiatePayment("online");
  });
}

const persistedRecord = () =>
  sessionStorage.getItem("burgonomics:payment_reconciliation:cust_hook_1");

function expectReconciliationInvariants(reason: string) {
  const state = usePaymentStore.getState();
  expect(state.status).toBe("waiting");
  expect(state.reconciliationPending).toBe(true);
  expect(state.reconciliationReason).toBe(reason);
  // No new pay invite and no order downgrade at the call site.
  expect(state.failure?.retryable).toBe(false);
  expect(state.failure?.paymentId).toBe("pay_hook_1");
  expect(mocks.markPaymentFailed).not.toHaveBeenCalled();
  expect(mocks.cartClear).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  // Auth-scoped persistence (state auth scoping preserved).
  const record = persistedRecord();
  expect(record).toBeTruthy();
  expect(record).toContain(reason);
  expect(record).toContain("order_rzp_hook");
  expect(sessionStorage.getItem("burgonomics:payment_reconciliation:cust_other_user")).toBeNull();
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  usePaymentStore.getState().reset();
});

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  hook = null;
  document.body.innerHTML = "";
});

describe("useRazorpayPayment - post-gateway recovery call sites (C01 / A08 B1+B9)", () => {
  it("401 INVALID_SIGNATURE: reconciliation, no markPaymentFailed, no re-pay", async () => {
    await mountHook();
    await runCheckout(fail("INVALID_SIGNATURE", "Signature mismatch", false));
    expectReconciliationInvariants("PAYMENT_SYNC_PENDING");
  });

  it("503 SERVICE_UNAVAILABLE: reconciliation, no markPaymentFailed, no re-pay", async () => {
    await mountHook();
    await runCheckout(fail("SERVICE_UNAVAILABLE", "backend unavailable", true));
    expectReconciliationInvariants("PAYMENT_SYNC_PENDING");
  });

  it("exhausted 202: TRANSFER_IN_PROGRESS reconciliation, no markPaymentFailed", async () => {
    await mountHook();
    await runCheckout(fail("TRANSFER_IN_PROGRESS", "Transfer in progress", true));
    expectReconciliationInvariants("TRANSFER_IN_PROGRESS");
  });

  it("finalize throw after verified payment: reconciliation, no cart clear or navigation", async () => {
    mocks.finalizePaidOrder.mockRejectedValueOnce(new Error("finalize exploded"));
    await mountHook();
    await runCheckout(
      ok({ verified: true, confirmedOrderId: "ord_hook", paymentId: "pay_hook_1" }),
    );
    expect(mocks.finalizePaidOrder).toHaveBeenCalledTimes(1);
    expectReconciliationInvariants("PAYMENT_SYNC_PENDING");
  });

  it("finalize returning failure (paid-but-no-order): reconciliation, no navigation", async () => {
    mocks.finalizePaidOrder.mockResolvedValueOnce(fail("SERVER_DOC_SHAPE_INVALID", "bad doc", false));
    await mountHook();
    await runCheckout(
      ok({ verified: true, confirmedOrderId: "ord_hook", paymentId: "pay_hook_1" }),
    );
    expectReconciliationInvariants("PAYMENT_SYNC_PENDING");
  });

  it("control: a server-proven decline still takes the uncaptured (mark-failed + retryable) path", async () => {
    usePaymentStore.getState().setInternalOrderId("ord_pending_ctrl");
    await mountHook();
    await runCheckout(fail("PAYMENT_DECLINED", "declined by bank", true));

    const state = usePaymentStore.getState();
    expect(state.status).toBe("failed");
    expect(state.reconciliationPending).toBe(false);
    expect(state.failure?.code).toBe("PAYMENT_DECLINED");
    expect(state.failure?.retryable).toBe(true);
    expect(mocks.markPaymentFailed).toHaveBeenCalledTimes(1);
    expect(mocks.markPaymentFailed).toHaveBeenCalledWith("ord_pending_ctrl");
    expect(mocks.cartClear).not.toHaveBeenCalled();
  });

  it("control: a fully verified payment still clears the cart and navigates once", async () => {
    usePaymentStore.getState().setInternalOrderId("ord_hook");
    await mountHook();
    await runCheckout(
      ok({ verified: true, confirmedOrderId: "ord_hook", paymentId: "pay_hook_1" }),
    );

    const state = usePaymentStore.getState();
    expect(state.status).toBe("success");
    expect(state.reconciliationPending).toBe(false);
    expect(persistedRecord()).toBeNull();
    expect(mocks.cartClear).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.markPaymentFailed).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D1 gateway-failure truth (P1-8 + "keep the harder failure state"): the third
// gateway path in this repo (`src/routes/payment.tsx`) already logs the raw
// provider error and renders `toUserMessage(err)`, and it refuses to relabel a
// real failure as USER_CANCELLED on Razorpay's post-failure `modal.ondismiss`.
// The hook was adopted with the older behaviour, so the same money-time
// callback produced customer-visible provider text and could downgrade a hard
// failure into a "user cancelled" state that re-offers a retry.
// ---------------------------------------------------------------------------
const RAW_GATEWAY_TRACE = "RZP-TRACE-9931 card 4111111111111111 declined at issuer";

async function runGatewayFailure(
  err: { code: string; description: string; source?: string },
  thenDismiss = false,
) {
  mocks.createPaymentOrder.mockResolvedValue(ok(GATEWAY_ORDER));
  mocks.openCheckout.mockImplementation(async (handlers: {
    onFailure: (e: typeof err) => void;
    onCancel: () => void;
  }) => {
    handlers.onFailure(err);
    // Razorpay fires `modal.ondismiss` even after `payment.failed`.
    if (thenDismiss) handlers.onCancel();
  });
  await act(async () => {
    await hook!.initiatePayment("online");
  });
}

describe("useRazorpayPayment - gateway-reported failure truth (D1)", () => {
  it("never echoes raw provider text into the failure panel or toast", async () => {
    await mountHook();
    await runGatewayFailure({ code: "BAD_REQUEST_ERROR", description: RAW_GATEWAY_TRACE });

    const state = usePaymentStore.getState();
    expect(state.status).toBe("failed");
    expect(state.failure?.code).toBe("BAD_REQUEST_ERROR");
    // Curated mapper output, identical to the committed route's handling.
    expect(state.failure?.message).toBe(userMessageFor("BAD_REQUEST_ERROR"));
    expect(JSON.stringify(state.failure)).not.toContain("RZP-TRACE-9931");
    expect(JSON.stringify(state.failure)).not.toContain("4111111111111111");

    const toastPayloads = JSON.stringify(vi.mocked(toast.error).mock.calls);
    expect(toastPayloads).toContain(userMessageFor("BAD_REQUEST_ERROR"));
    expect(toastPayloads).not.toContain("RZP-TRACE-9931");
    expect(toastPayloads).not.toContain("4111111111111111");

    // A failed attempt must never look like a paid order.
    expect(mocks.markPaymentFailed).not.toHaveBeenCalled();
    expect(mocks.cartClear).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("keeps a hard gateway failure when Razorpay dismisses the modal afterwards", async () => {
    await mountHook();
    await runGatewayFailure(
      { code: "BAD_REQUEST_ERROR", description: RAW_GATEWAY_TRACE },
      true,
    );

    const state = usePaymentStore.getState();
    expect(state.status).toBe("failed");
    expect(state.failure?.code).toBe("BAD_REQUEST_ERROR");
    expect(state.failure?.retryable).toBe(true);
    // No false abandonment prompt for a failure that was already explained.
    expect(hook!.abandonmentOpen).toBe(false);
  });

  it("does not relabel a reconciliation-pending attempt as user-cancelled", async () => {
    // Money may have moved (503 / unverified 200): dismiss must not clear the
    // reconciliation latch or replace the do-not-pay-again copy.
    mocks.createPaymentOrder.mockResolvedValue(ok(GATEWAY_ORDER));
    mocks.verifyPayment.mockResolvedValue(fail("SERVICE_UNAVAILABLE", "backend unavailable", true));
    mocks.openCheckout.mockImplementation(async (handlers: {
      onSuccess: (r: typeof CALLBACK_RESULT) => Promise<void> | void;
      onCancel: () => void;
    }) => {
      await handlers.onSuccess(CALLBACK_RESULT);
      handlers.onCancel();
    });
    await mountHook();
    await act(async () => {
      await hook!.initiatePayment("online");
    });

    const state = usePaymentStore.getState();
    expect(state.status).toBe("waiting");
    expect(state.reconciliationPending).toBe(true);
    expect(state.failure?.code).toBe("PAYMENT_SYNC_PENDING");
    expect(state.failure?.retryable).toBe(false);
    expect(hook!.abandonmentOpen).toBe(false);
    expect(persistedRecord()).toContain("PAYMENT_SYNC_PENDING");
  });

  it("does not relabel a successful payment as user-cancelled", async () => {
    usePaymentStore.getState().setInternalOrderId("ord_hook");
    mocks.createPaymentOrder.mockResolvedValue(ok(GATEWAY_ORDER));
    mocks.verifyPayment.mockResolvedValue(
      ok({ verified: true, confirmedOrderId: "ord_hook", paymentId: "pay_hook_1" }),
    );
    mocks.openCheckout.mockImplementation(async (handlers: {
      onSuccess: (r: typeof CALLBACK_RESULT) => Promise<void> | void;
      onCancel: () => void;
    }) => {
      await handlers.onSuccess(CALLBACK_RESULT);
      handlers.onCancel();
    });
    await mountHook();
    await act(async () => {
      await hook!.initiatePayment("online");
    });

    const state = usePaymentStore.getState();
    expect(state.status).toBe("success");
    expect(state.reconciliationPending).toBe(false);
    expect(state.failure).toBeNull();
    expect(hook!.abandonmentOpen).toBe(false);
    // Exactly one confirmation navigation, no post-success duplicate work.
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.cartClear).toHaveBeenCalledTimes(1);
  });
});
