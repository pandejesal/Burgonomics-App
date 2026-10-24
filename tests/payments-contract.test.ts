import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// PAYMENTS_CONTRACT_SPEC (audit session) — client half, section 3.
//
// Guard 1: the createPaymentOrder request carries the CANONICAL field names
// (`orderType`, `orderId`) and reads the canonical response names.
// Guard 2: verifyPayment binds the gateway payment to the INTERNAL order id
// with the canonical `{ orderId, razorpayOrderId, razorpayPaymentId,
// razorpaySignature }` shape.
// Guard 3: an order whose Firestore write fails must NOT read as success
// (P1-2) — and the retry must reuse the same order id (no duplicate order).
// Guard 4: the created order doc carries BOTH ownership fields firestore.rules
// requires (`userId` AND `customerId` == caller uid) — finding 16.

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
  auth: { currentUser: { uid: "cust_contract_1" } },
  db: {},
  getAppCheckToken: vi.fn(async () => null),
}));

import { ordersService } from "../src/features/orders/services/ordersService";
import { paymentsService } from "../src/features/payments/services/paymentsService";

type FetchCall = [string, RequestInit & { body?: string }];

const jsonResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

function stubFetch(payload: unknown) {
  const fetchMock = vi.fn(async (...args: FetchCall) => jsonResponse(payload));
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// -- 1. createPaymentOrder wire ----------------------------------------

describe("paymentsService.createOrder — PAYMENTS_CONTRACT_SPEC §1", () => {
  it("sends canonical orderType + orderId alongside the legacy alias", async () => {
    const fetchMock = stubFetch({
      razorpayOrderId: "order_rzp_canon0001",
      amountPaise: 49900,
      keyId: "rzp_live_key",
      currency: "INR",
      receipt: "rcpt_1",
    });

    const res = await paymentsService.createOrder({
      amount: 499,
      currency: "INR",
      receipt: "rcpt_1",
      storeId: "str_1",
      fulfillment: "delivery",
      orderType: "delivery",
      orderId: "ord_internal_1",
    });

    const body = lastBody(fetchMock);
    expect(body.orderType).toBe("delivery");
    expect(body.orderId).toBe("ord_internal_1");
    // Legacy alias kept for pre-contract server builds.
    expect(body.fulfillment).toBe("delivery");

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.razorpayOrderId).toBe("order_rzp_canon0001");
    expect(res.data.orderId).toBe("order_rzp_canon0001");
    expect(res.data.amountPaise).toBe(49900);
    expect(res.data.amount).toBe(499);
  });

  it("maps takeaway/dinein fulfilment onto the server enum", async () => {
    for (const [fulfillment, orderType] of [
      ["takeaway", "takeaway"],
      ["dinein", "dinein"],
    ] as const) {
      const fetchMock = stubFetch({ orderId: "order_rzp_legacy001", amount: 250 });
      await paymentsService.createOrder({
        amount: 250,
        currency: "INR",
        receipt: "rcpt_2",
        storeId: "str_1",
        fulfillment,
        orderType,
        orderId: "ord_internal_2",
      });
      expect(lastBody(fetchMock).orderType).toBe(orderType);
    }
  });

  it("falls back to the legacy response names (orderId + amount in rupees)", async () => {
    stubFetch({ orderId: "order_rzp_legacy002", amount: 199, keyId: "rzp_live_key" });

    const res = await paymentsService.createOrder({
      amount: 199,
      currency: "INR",
      receipt: "rcpt_3",
      storeId: "str_1",
      fulfillment: "delivery",
      orderType: "delivery",
      orderId: "ord_internal_3",
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.orderId).toBe("order_rzp_legacy002");
    expect(res.data.amount).toBe(199);
    expect(res.data.amountPaise).toBe(19900);
  });

  it("fails closed when the gateway answers with no order id", async () => {
    stubFetch({ amount: 100 });
    const res = await paymentsService.createOrder({
      amount: 100,
      currency: "INR",
      receipt: "rcpt_4",
      storeId: "str_1",
      fulfillment: "delivery",
      orderType: "delivery",
    });
    expect(res.success).toBe(false);
  });
});

// -- 2. verifyPayment wire ----------------------------------------------

describe("paymentsService.verify — PAYMENTS_CONTRACT_SPEC §2", () => {
  it("verifies with canonical names bound to the INTERNAL order id", async () => {
    const fetchMock = stubFetch({ verified: true, confirmedOrderId: "ord_internal_9" });

    const res = await paymentsService.verify({
      orderId: "order_rzp_gateway9",
      paymentId: "pay_9",
      signature: "sig_9",
      method: "upi",
      internalOrderId: "ord_internal_9",
    });

    const body = lastBody(fetchMock);
    // `orderId` is the INTERNAL order; the gateway id is its own field.
    expect(body.orderId).toBe("ord_internal_9");
    expect(body.razorpayOrderId).toBe("order_rzp_gateway9");
    expect(body.razorpayPaymentId).toBe("pay_9");
    expect(body.razorpaySignature).toBe("sig_9");
    // Legacy aliases still present for pre-contract server builds.
    expect(body.paymentId).toBe("pay_9");
    expect(body.signature).toBe("sig_9");

    expect(res.success).toBe(true);
  });

  it("still verifies a gateway-only result when no internal order exists", async () => {
    const fetchMock = stubFetch({ verified: false });
    await paymentsService.verify({
      orderId: "order_rzp_gateway10",
      paymentId: "pay_10",
      signature: "sig_10",
      method: "online",
    });
    expect(lastBody(fetchMock).orderId).toBe("order_rzp_gateway10");
  });

  it("rejects an invalid signature without touching the network", async () => {
    const fetchMock = stubFetch({});
    const res = await paymentsService.verify({
      orderId: "order_rzp_x",
      paymentId: "pay_x",
      signature: "force_fail",
      method: "online",
    });
    expect(res.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// -- 3 + 4. order persistence honesty -----------------------------------

const orderInput = (overrides: Record<string, unknown> = {}) =>
  ({
    store: { id: "branch_01", name: "Test Outlet" },
    fulfillment: "delivery",
    items: [{ productId: "p1", name: "Burger", quantity: 1, unitPrice: 250 }],
    totals: { grandTotal: 250 },
    payment: { method: "online", label: "Pay Online", status: "pending" },
    ...overrides,
  }) as any;

describe("ordersService.createOrder — persistence honesty (P1-2, finding 16)", () => {
  it("returns PERSIST_FAILED instead of ok when the Firestore write fails", async () => {
    mockSetDoc.mockRejectedValueOnce(new Error("permission-denied"));

    const res = await ordersService.createOrder(orderInput());

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("PERSIST_FAILED");
    expect(res.error.retryable).toBe(true);
  });

  it("reuses the SAME order id on retry after a failed persist (no duplicate)", async () => {
    mockSetDoc.mockRejectedValueOnce(new Error("offline"));
    const first = await ordersService.createOrder(orderInput());
    expect(first.success).toBe(false);

    const second = await ordersService.createOrder(orderInput());
    expect(second.success).toBe(true);

    const writtenIds = mockDoc.mock.calls.map((c) => c[2]);
    expect(writtenIds.length).toBe(2);
    expect(writtenIds[1]).toBe(writtenIds[0]);
    if (!second.success) return;
    expect(second.data.id).toBe(writtenIds[0]);
  });

  it("writes BOTH userId and customerId == the caller uid (firestore.rules)", async () => {
    const res = await ordersService.createOrder(orderInput());
    expect(res.success).toBe(true);

    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.userId).toBe("cust_contract_1");
    expect(payload.customerId).toBe("cust_contract_1");
  });

  it("retrying payment for an already-persisted pending order skips the denied full setDoc", async () => {
    // Pending order was written before the gateway opened; the gateway create
    // answered 503, so the retry carries that same id (PAYMENTS_CONTRACT §3).
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ customerId: "cust_contract_1", userId: "cust_contract_1" }),
    });

    const res = await ordersService.createOrder(
      orderInput({ confirmedOrderId: "ord_pending_retry" })
    );

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.id).toBe("ord_pending_retry");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("refuses to continue payment when the existing order belongs to another account", async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ customerId: "someone_else", userId: "someone_else" }),
    });

    const res = await ordersService.createOrder(
      orderInput({ confirmedOrderId: "ord_foreign_retry" })
    );

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe("NOT_OWNER");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("observes pending server truth without fabricating a payment failure or writing it", async () => {
    const created = await ordersService.createOrder(orderInput());
    expect(created.success).toBe(true);
    if (!created.success) return;

    const serverDoc = mockSetDoc.mock.calls.at(-1)?.[1];
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => serverDoc });
    mockSetDoc.mockClear();
    const failed = await ordersService.markPaymentFailed(created.data.id);
    expect(failed.success).toBe(false);
    if (failed.success) return;
    expect(failed.error.code).toBe("PAYMENT_STILL_PENDING");
    expect(mockGetDoc).toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
    const observed = await ordersService.getOrder(created.data.id);
    expect(observed.success).toBe(true);
    if (observed.success) expect(observed.data.payment.status).toBe("pending");
  });
});
