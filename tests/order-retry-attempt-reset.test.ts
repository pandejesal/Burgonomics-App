/** @vitest-environment jsdom */
/** A changed basket must not silently abandon an existing server draft. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  calculateTotals: vi.fn(),
  createDraft: vi.fn(),
  retireDraft: vi.fn(),
}));
vi.mock("../src/features/cart/repositories/CartRepository", () => ({
  cartRepository: { calculateTotals: h.calculateTotals },
}));
vi.mock("../src/features/payments/services/onlineDraftService", () => ({
  createOnlineDraftOnServer: h.createDraft,
  retireOnlineDraftOnServer: h.retireDraft,
}));
const cartState = { lines: [{ productId: "p1", quantity: 1 }], promo: null };
vi.mock("../src/features/cart/state/cartStore", () => ({
  useCartStore: { getState: () => cartState },
}));
vi.mock("../src/features/stores/state/storeStore", () => ({
  useStoreSelection: {
    getState: () => ({
      activeStore: { id: "store-A", name: "Outlet", pricing: {} },
      fulfillment: "takeaway",
    }),
  },
}));
vi.mock("../src/features/addresses", () => ({
  useAddressStore: { getState: () => ({}) },
  selectSelectedAddress: () => undefined,
}));
vi.mock("../src/features/checkout/state/checkoutStore", () => ({
  useCheckoutStore: {
    getState: () => ({
      orderNotes: "",
      pickupInstructions: "",
      deliveryInstructions: "",
      diningNotes: "",
      tipAmount: 0,
      tableNumber: "",
      checkoutFees: { status: "idle" },
    }),
  },
}));
vi.mock("../src/features/orders/services/ordersService", () => ({ ordersService: {} }));

import { configureAuthUidSource } from "../src/features/auth/utils/scopedPersistence";
import { OrderRepository } from "../src/features/orders/repositories/OrderRepository";
import { useOrdersStore } from "../src/features/orders/state/ordersStore";
import { readPendingOnlineDraft } from "../src/features/payments/services/pendingOnlineDraft";
import { usePaymentStore } from "../src/features/payments/state/paymentStore";

let uid = "cust_retry";
let emitAuth: (state: { user: { id: string } }) => void;
configureAuthUidSource({
  getUid: () => uid,
  subscribe: (listener) => {
    emitAuth = listener;
    return () => undefined;
  },
});

function switchAccount(nextUid: string) {
  uid = nextUid;
  emitAuth({ user: { id: uid } });
}

beforeEach(() => {
  localStorage.clear();
  switchAccount("cust_retry");
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, callback: () => unknown) => callback() },
  });
  cartState.lines = [{ productId: "p1", quantity: 1 }];
  h.calculateTotals
    .mockReset()
    .mockResolvedValue({ success: true, data: { subtotal: 100, grandTotal: 100 } });
  h.retireDraft.mockReset().mockResolvedValue({ success: true, data: undefined });
  h.createDraft
    .mockReset()
    .mockImplementation(async (request: { orderId: string; attemptId: string }) => ({
      success: true,
      data: {
        orderId: request.orderId,
        id: request.orderId,
        attemptId: request.attemptId,
        replayed: false,
        amountPaise: 10000,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    }));
});

describe("server draft retry identity", () => {
  it("keeps the original attempt if a changed basket cannot safely retire it", async () => {
    const repo = new OrderRepository();
    expect((await repo.createOnlineDraft()).success).toBe(true);
    const original = readPendingOnlineDraft();
    h.retireDraft.mockResolvedValueOnce({
      success: false,
      error: { code: "DRAFT_PAYMENT_IN_PROGRESS" },
    });
    cartState.lines = [{ productId: "p1", quantity: 2 }];
    const changed = await repo.createOnlineDraft();
    expect(changed.success).toBe(false);
    if (!changed.success) expect(changed.error.code).toBe("DRAFT_PAYMENT_IN_PROGRESS");
    expect(h.retireDraft).toHaveBeenCalledWith(original?.orderId, original?.attemptId);
    expect(h.createDraft).toHaveBeenCalledTimes(1);
    expect(readPendingOnlineDraft()?.orderId).toBe(original?.orderId);
    expect(readPendingOnlineDraft()?.attemptId).toBe(original?.attemptId);
  });

  it("replaces a changed basket only after the original attempt was retired", async () => {
    const repo = new OrderRepository();
    expect((await repo.createOnlineDraft()).success).toBe(true);
    const original = readPendingOnlineDraft();
    cartState.lines = [{ productId: "p1", quantity: 2 }];
    expect((await repo.createOnlineDraft()).success).toBe(true);
    const replacement = readPendingOnlineDraft();
    expect(h.retireDraft).toHaveBeenCalledWith(original?.orderId, original?.attemptId);
    expect(h.createDraft).toHaveBeenCalledTimes(2);
    expect(h.retireDraft.mock.invocationCallOrder[0]).toBeLessThan(
      h.createDraft.mock.invocationCallOrder[1],
    );
    expect(replacement?.orderId).not.toBe(original?.orderId);
    expect(replacement?.attemptId).not.toBe(original?.attemptId);
    expect(replacement?.request.items).toEqual([{ productId: "p1", quantity: 2 }]);
  });

  it("rejects A's late draft receipt after switching to B without adopting A's identity", async () => {
    const repo = new OrderRepository();
    const { promise: response, resolve: deliverReceipt } = Promise.withResolvers<unknown>();
    h.createDraft.mockReturnValueOnce(response);
    const pendingA = repo.createOnlineDraft();
    await vi.waitFor(() => expect(h.createDraft).toHaveBeenCalledTimes(1));
    const requestA = h.createDraft.mock.calls[0][0];
    expect(readPendingOnlineDraft()).toMatchObject({
      uid: "cust_retry",
      orderId: requestA.orderId,
      attemptId: requestA.attemptId,
    });

    switchAccount("cust_b");
    expect(readPendingOnlineDraft()).toBeNull();
    const paymentBefore = usePaymentStore.getState();
    const ordersBefore = useOrdersStore.getState();
    deliverReceipt({
      success: true,
      data: {
        id: requestA.orderId,
        orderId: requestA.orderId,
        attemptId: requestA.attemptId,
        replayed: false,
        amountPaise: 10000,
        totals: {},
        status: { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false },
      },
    });

    expect(await pendingA).toMatchObject({ success: false, error: { code: "ATTEMPT_CHANGED" } });
    expect(readPendingOnlineDraft()).toBeNull();
    expect(usePaymentStore.getState()).toBe(paymentBefore);
    expect(useOrdersStore.getState()).toBe(ordersBefore);

    const freshB = await repo.createOnlineDraft();
    expect(h.createDraft).toHaveBeenCalledTimes(2);
    const requestB = h.createDraft.mock.calls[1][0];
    expect(requestB.orderId).not.toBe(requestA.orderId);
    expect(requestB.attemptId).not.toBe(requestA.attemptId);
    expect(freshB).toMatchObject({
      success: true,
      data: { orderId: requestB.orderId, attemptId: requestB.attemptId },
    });
    expect(readPendingOnlineDraft()).toMatchObject({
      uid: "cust_b",
      orderId: requestB.orderId,
      attemptId: requestB.attemptId,
    });
    expect(h.retireDraft).not.toHaveBeenCalled();
  });
});
