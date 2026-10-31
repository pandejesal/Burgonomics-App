/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// R01 â€” payment response wire contract.
//
// The real Cloud Function success payload is
//   { success: true, confirmedOrderId, paymentId, transfer, deliveryOtp }
// and HTTP 202 answers { error, code: "TRANSFER_IN_PROGRESS" }.
// These tests pin the client's normalization / fail-closed behaviour
// against those REAL shapes (not the older hand-made `{ verified: true }`
// stub), plus central attachment of the pending internal order id and
// typed 202 handling.

const { mockSetDoc, mockGetDoc, mockDoc } = vi.hoisted(() => ({
  mockSetDoc: vi.fn(),
  mockGetDoc: vi.fn(),
  mockDoc: vi.fn((...args: unknown[]) => args),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: mockDoc,
  getDoc: mockGetDoc,
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  setDoc: mockSetDoc,
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

vi.mock("../src/core/config/firebase", () => ({
  auth: { currentUser: { uid: "cust_wire_1" } },
  db: {},
  getAppCheckToken: vi.fn(async () => null),
}));

import { paymentsService } from "../src/features/payments/services/paymentsService";
import { isUncapturedPaymentError } from "../src/features/payments/services/paymentsService";
import { resolveVerifyOutcome } from "../src/features/payments/utils/paymentRecovery";
import { paymentRepository } from "../src/features/payments/repositories/PaymentRepository";
import { usePaymentStore } from "../src/features/payments/state/paymentStore";

type FetchCall = [string, RequestInit & { body?: string }];

function responseFor(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Status",
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function stubFetch(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(async (...args: FetchCall) => responseFor(payload, status, headers));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastBody(fetchMock: ReturnType<typeof stubFetch>): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1) as FetchCall;
  return JSON.parse(call[1].body as string);
}

beforeEach(() => {
  mockSetDoc.mockReset().mockResolvedValue(undefined);
  mockGetDoc.mockReset();
  mockDoc.mockClear();
  usePaymentStore.getState().reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("paymentsService.verify â€” real backend wire (R01)", () => {
  it("normalizes the real server success shape (no `verified`) into verified=true when ids match", async () => {
    const fetchMock = stubFetch({
      success: true,
      confirmedOrderId: "ord_internal_9",
      paymentId: "pay_9",
      transfer: null,
      deliveryOtp: "1234",
    });

    const res = await paymentsService.verify({
      orderId: "order_rzp_gateway9",
      paymentId: "pay_9",
      signature: "sig_9",
      method: "upi",
      internalOrderId: "ord_internal_9",
    });

    const body = lastBody(fetchMock);
    expect(body.orderId).toBe("ord_internal_9");
    expect(body.razorpayOrderId).toBe("order_rzp_gateway9");
    expect(body.razorpayPaymentId).toBe("pay_9");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(true);
    expect(res.data.confirmedOrderId).toBe("ord_internal_9");
  });

  it("fails closed when the server omits a success indicator", async () => {
    stubFetch({
      confirmedOrderId: "ord_internal_9",
      paymentId: "pay_9",
    });

    const res = await paymentsService.verify({
      orderId: "order_rzp_gateway9",
      paymentId: "pay_9",
      signature: "sig_9",
      method: "upi",
      internalOrderId: "ord_internal_9",
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(false);
  });

  it("fails closed when confirmedOrderId does not match the attempted order", async () => {
    stubFetch({
      success: true,
      confirmedOrderId: "ord_someone_else",
      paymentId: "pay_9",
    });

    const res = await paymentsService.verify({
      orderId: "order_rzp_gateway9",
      paymentId: "pay_9",
      signature: "sig_9",
      method: "upi",
      internalOrderId: "ord_internal_9",
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(false);
  });

  it("fails closed when the payment id does not match the attempted payment", async () => {
    stubFetch({
      success: true,
      confirmedOrderId: "ord_internal_9",
      paymentId: "pay_DIFFERENT",
    });

    const res = await paymentsService.verify({
      orderId: "order_rzp_gateway9",
      paymentId: "pay_9",
      signature: "sig_9",
      method: "upi",
      internalOrderId: "ord_internal_9",
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(false);
  });

  it("does not treat an arbitrary `verified: true` flag as verification without backend success", async () => {
    stubFetch({
      verified: true,
      confirmedOrderId: "ord_internal_9",
      paymentId: "pay_9",
    });

    const res = await paymentsService.verify({
      orderId: "order_rzp_gateway9",
      paymentId: "pay_9",
      signature: "sig_9",
      method: "upi",
      internalOrderId: "ord_internal_9",
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(false);
  });

  it("types HTTP 202 TRANSFER_IN_PROGRESS as a retryable pending failure, not success", async () => {
    const fetchMock = stubFetch(
      { error: "Transfer in progress elsewhere", code: "TRANSFER_IN_PROGRESS" },
      202,
      { "Retry-After": "2" },
    );

    const res = await paymentsService.verify({
      orderId: "order_rzp_gateway9",
      paymentId: "pay_9",
      signature: "sig_9",
      method: "upi",
      internalOrderId: "ord_internal_9",
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("TRANSFER_IN_PROGRESS");
    expect(res.error.retryable).toBe(true);
    expect(res.error.message).toContain("Transfer in progress");
  });

  it("keeps signature mismatch separate from 202 pending (invalid signature never hits the network)", async () => {
    const fetchMock = stubFetch({});
    const res = await paymentsService.verify({
      orderId: "order_rzp_x",
      paymentId: "pay_x",
      signature: "force_fail",
      method: "online",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("VERIFICATION_FAILED");
  });
});

describe("PaymentRepository.verifyPayment â€” central pending id attachment (R01)", () => {
  it("attaches the pending internal order id from the payment store when the result omits it (checkout path)", async () => {
    usePaymentStore.getState().setInternalOrderId("ord_pending_central");

    const fetchMock = stubFetch({
      success: true,
      confirmedOrderId: "ord_pending_central",
      paymentId: "pay_central",
    });

    const res = await paymentRepository.verifyPayment({
      orderId: "order_rzp_gateway_central",
      paymentId: "pay_central",
      signature: "sig_central",
      method: "upi",
    });

    const body = lastBody(fetchMock);
    expect(body.orderId).toBe("ord_pending_central");
    expect(body.razorpayOrderId).toBe("order_rzp_gateway_central");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(true);
    expect(res.data.confirmedOrderId).toBe("ord_pending_central");
  });

  it("does not override an explicitly provided internal order id", async () => {
    usePaymentStore.getState().setInternalOrderId("ord_store_should_be_ignored");

    const fetchMock = stubFetch({
      success: true,
      confirmedOrderId: "ord_explicit",
      paymentId: "pay_explicit",
    });

    await paymentRepository.verifyPayment({
      orderId: "order_rzp_gateway_explicit",
      paymentId: "pay_explicit",
      signature: "sig_explicit",
      method: "upi",
      internalOrderId: "ord_explicit",
    });

    const body = lastBody(fetchMock);
    expect(body.orderId).toBe("ord_explicit");
  });

  it("passes pending transfer failures through as typed pending results from the repository", async () => {
    usePaymentStore.getState().setInternalOrderId("ord_pending_202");

    stubFetch({ error: "Transfer in progress elsewhere", code: "TRANSFER_IN_PROGRESS" }, 202, {
      "Retry-After": "2",
    });

    const res = await paymentRepository.verifyPayment({
      orderId: "order_rzp_gateway_202",
      paymentId: "pay_202",
      signature: "sig_202",
      method: "upi",
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("TRANSFER_IN_PROGRESS");
    expect(res.error.retryable).toBe(true);
  });
});

describe("paymentsService.verify — bounded retry & error mapping (R01 correction)", () => {
  it("polls a 202 then a 200 to a verified success without minting a new payment", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n += 1;
      if (n === 1) {
        return responseFor({ error: "in progress", code: "TRANSFER_IN_PROGRESS" }, 202, {
          "Retry-After": "0",
        });
      }
      return responseFor({
        success: true,
        confirmedOrderId: "ord_retry",
        paymentId: "pay_retry",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await paymentsService.verify({
      orderId: "order_rzp_retry",
      paymentId: "pay_retry",
      signature: "sig_retry",
      method: "upi",
      internalOrderId: "ord_retry",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(true);
    expect(res.data.confirmedOrderId).toBe("ord_retry");
  });

  it("returns typed pending (not throw) after exhausting 202 retries", async () => {
    const fetchMock = vi.fn(async () =>
      responseFor({ error: "in progress", code: "TRANSFER_IN_PROGRESS" }, 202, {
        "Retry-After": "0",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await paymentsService.verify({
      orderId: "order_rzp_pending",
      paymentId: "pay_pending",
      signature: "sig_pending",
      method: "upi",
      internalOrderId: "ord_pending",
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("TRANSFER_IN_PROGRESS");
    expect(res.error.retryable).toBe(true);
  });

  it("preserves 409 ORDER_MISMATCH as non-retryable with server code", async () => {
    stubFetch({ error: "order mismatch", code: "ORDER_MISMATCH" }, 409);
    const res = await paymentsService.verify({
      orderId: "order_rzp_x",
      paymentId: "pay_x",
      signature: "sig_x",
      method: "upi",
      internalOrderId: "ord_x",
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("ORDER_MISMATCH");
    expect(res.error.retryable).toBe(false);
  });

  it("preserves 401 INVALID_SIGNATURE as non-retryable with server code", async () => {
    stubFetch({ error: "bad sig", code: "INVALID_SIGNATURE" }, 401);
    const res = await paymentsService.verify({
      orderId: "order_rzp_x",
      paymentId: "pay_x",
      signature: "sig_x",
      method: "upi",
      internalOrderId: "ord_x",
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("INVALID_SIGNATURE");
    expect(res.error.retryable).toBe(false);
  });

  it("marks 503 as retryable preserving server code", async () => {
    stubFetch({ error: "unavailable", code: "SERVICE_UNAVAILABLE" }, 503);
    const res = await paymentsService.verify({
      orderId: "order_rzp_x",
      paymentId: "pay_x",
      signature: "sig_x",
      method: "upi",
      internalOrderId: "ord_x",
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(res.error.retryable).toBe(true);
  });

  it("does not silently bind to a stale internal id when gateway differs (A3)", async () => {
    usePaymentStore.getState().setInternalOrderId("ord_stale");
    usePaymentStore.getState().setGatewayOrderId("order_rzp_OTHER");

    const fetchMock = stubFetch({
      success: true,
      confirmedOrderId: "ord_stale",
      paymentId: "pay_stale",
    });

    const res = await paymentRepository.verifyPayment({
      orderId: "order_rzp_current",
      paymentId: "pay_current",
      signature: "sig_current",
      method: "upi",
    });

    const body = lastBody(fetchMock);
    expect(body.orderId).toBe("order_rzp_current");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(false);
  });
});

describe("paymentsService.verify — R01 terminal/reconciliation preservation", () => {
  it("preserves ORDER_TERMINAL from an HTTP 200 legacy envelope instead of collapsing to malformed", async () => {
    stubFetch({
      ok: false,
      success: false,
      code: "ORDER_TERMINAL",
      error: "Order already terminal",
      confirmedOrderId: "ord_terminal",
      paymentId: "pay_terminal",
    });

    const res = await paymentsService.verify({
      orderId: "order_rzp_terminal",
      paymentId: "pay_terminal",
      signature: "sig_terminal",
      method: "upi",
      internalOrderId: "ord_terminal",
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("ORDER_TERMINAL");
    expect(res.error.retryable).toBe(false);
    expect(res.error.message).toContain("terminal");
  });

  it("does not trust typed raw success when payment id mismatches (A3/A4)", async () => {
    stubFetch({
      success: true,
      code: "OK",
      confirmedOrderId: "ord_ok",
      paymentId: "pay_OTHER",
    });

    const res = await paymentsService.verify({
      orderId: "order_rzp_ok",
      paymentId: "pay_mine",
      signature: "sig_ok",
      method: "upi",
      internalOrderId: "ord_ok",
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(false);
  });

  it("fails closed on stale gateway binding even with an explicit internal id (A3)", async () => {
    usePaymentStore.getState().setInternalOrderId("ord_stale");
    usePaymentStore.getState().setGatewayOrderId("order_rzp_OTHER");

    const fetchMock = stubFetch({
      success: true,
      confirmedOrderId: "ord_stale",
      paymentId: "pay_stale",
    });

    const res = await paymentRepository.verifyPayment({
      orderId: "order_rzp_current",
      paymentId: "pay_current",
      signature: "sig_current",
      method: "upi",
      internalOrderId: "ord_stale",
    });

    const body = lastBody(fetchMock);
    expect(body.orderId).toBe("order_rzp_current");
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.verified).toBe(false);
  });
});

describe("PaymentRepository.createPaymentOrder — reconciliation entry guard", () => {
  it("refuses to mint a new payable order while reconciliation is pending (no fetch)", async () => {
    const uid = "cust_wire_1";
    usePaymentStore
      .getState()
      .setReconciliation(true, "PAYMENT_SYNC_PENDING", "ord_pending", "order_rzp_pending");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await paymentRepository.createPaymentOrder();
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("PAYMENT_RECONCILIATION_PENDING");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// C01 (A08 B1) - signature codes no longer prove "uncaptured".
// INVALID_SIGNATURE/VERIFICATION_FAILED/SIGNATURE_MISMATCH only prove an HMAC
// mismatch: a genuinely captured payment whose callback was truncated or
// replayed answers 401 identically. They must now land in the reconciliation
// branch (no markPaymentFailed, no re-pay invite), while server-proven
// non-capture codes keep the mark-failed path.
describe("C01 - signature codes no longer prove uncaptured (A08 B1 wire regression)", () => {
  it.each([
    "INVALID_SIGNATURE",
    "VERIFICATION_FAILED",
    "SIGNATURE_MISMATCH",
    "AMOUNT_MISMATCH",
    "CURRENCY_MISMATCH",
    "ORDER_MISMATCH",
    "ORDER_NOT_FOUND",
    "ORDER_NOT_OWNED",
    "NOT_OWNER",
    "NO_CAPTURED_PAYMENT",
    "CAPTURE_FAILED",
    "CAPTURE_NOT_FOUND",
  ])("classifies %s as NOT uncaptured", (code) => {
    expect(isUncapturedPaymentError(code)).toBe(false);
    expect(
      resolveVerifyOutcome({
        verify: { success: false, error: { code, message: "Verification refused" } },
        internalOrderId: "ord_reconcile",
        paymentId: "pay_reconcile",
      }).kind,
    ).toBe("reconciliation");
  });

  it("routes a real 401 INVALID_SIGNATURE wire response to reconciliation, never mark-failed", async () => {
    stubFetch({ error: "Signature mismatch", code: "INVALID_SIGNATURE" }, 401);

    const res = await paymentsService.verify({
      orderId: "order_rzp_badsig",
      paymentId: "pay_badsig",
      signature: "sig_badsig",
      method: "upi",
      internalOrderId: "ord_badsig",
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("INVALID_SIGNATURE");

    const outcome = resolveVerifyOutcome({
      verify: res,
      internalOrderId: "ord_badsig",
      gatewayOrderId: "order_rzp_badsig",
      paymentId: "pay_badsig",
    });
    expect(outcome.kind).toBe("reconciliation");
    if (outcome.kind !== "reconciliation") return;
    expect(outcome.reason).toBe("PAYMENT_SYNC_PENDING");
    expect(outcome.paymentId).toBe("pay_badsig");
  });

  it("routes a 503 post-gateway verify failure to reconciliation (unknown capture state)", async () => {
    stubFetch({ error: "backend unavailable", code: "SERVICE_UNAVAILABLE" }, 503);

    const res = await paymentsService.verify({
      orderId: "order_rzp_503",
      paymentId: "pay_503",
      signature: "sig_503",
      method: "upi",
      internalOrderId: "ord_503",
    });

    const outcome = resolveVerifyOutcome({
      verify: res,
      internalOrderId: "ord_503",
      gatewayOrderId: "order_rzp_503",
      paymentId: "pay_503",
    });
    expect(outcome.kind).toBe("reconciliation");
    if (outcome.kind !== "reconciliation") return;
    expect(outcome.reason).toBe("PAYMENT_SYNC_PENDING");
  });

  it("routes an exhausted 202 (bounded same-request retry) to TRANSFER_IN_PROGRESS reconciliation", async () => {
    const fetchMock = vi.fn(async () =>
      responseFor({ error: "in progress", code: "TRANSFER_IN_PROGRESS" }, 202, {
        "Retry-After": "0",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await paymentsService.verify({
      orderId: "order_rzp_202x",
      paymentId: "pay_202x",
      signature: "sig_202x",
      method: "upi",
      internalOrderId: "ord_202x",
    });

    // Bounded retry of the SAME verify is preserved (no new payment minted).
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const outcome = resolveVerifyOutcome({
      verify: res,
      internalOrderId: "ord_202x",
      gatewayOrderId: "order_rzp_202x",
      paymentId: "pay_202x",
    });
    expect(outcome.kind).toBe("reconciliation");
    if (outcome.kind !== "reconciliation") return;
    expect(outcome.reason).toBe("TRANSFER_IN_PROGRESS");
  });

  it("routes server-reported PAYMENT_NOT_CAPTURED (awaiting_capture) to reconciliation, not an automatic re-pay", async () => {
    stubFetch({ error: "payment not captured", code: "PAYMENT_NOT_CAPTURED" }, 409);

    const res = await paymentsService.verify({
      orderId: "order_rzp_hold",
      paymentId: "pay_hold",
      signature: "sig_hold",
      method: "card",
      internalOrderId: "ord_hold",
    });

    const outcome = resolveVerifyOutcome({
      verify: res,
      internalOrderId: "ord_hold",
      gatewayOrderId: "order_rzp_hold",
      paymentId: "pay_hold",
    });
    // Proven non-capture, but an authorization may be held: no markPaymentFailed
    // state flip and no new pay (A08 P4).
    expect(outcome.kind).toBe("reconciliation");
    if (outcome.kind !== "reconciliation") return;
    expect(outcome.reason).toBe("PAYMENT_NOT_CAPTURED");
  });

  it("keeps a server-proven decline as the only mark-failed (uncaptured) path", async () => {
    stubFetch({ error: "declined by bank", code: "PAYMENT_DECLINED" }, 409);

    const res = await paymentsService.verify({
      orderId: "order_rzp_declined",
      paymentId: "pay_declined",
      signature: "sig_declined",
      method: "upi",
      internalOrderId: "ord_declined",
    });

    const outcome = resolveVerifyOutcome({
      verify: res,
      internalOrderId: "ord_declined",
      gatewayOrderId: "order_rzp_declined",
      paymentId: "pay_declined",
    });
    expect(outcome.kind).toBe("uncaptured");
    if (outcome.kind !== "uncaptured") return;
    expect(outcome.code).toBe("PAYMENT_DECLINED");
    expect(outcome.retryable).toBe(true);
  });
});
