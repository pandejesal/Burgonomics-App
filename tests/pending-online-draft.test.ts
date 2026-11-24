/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuthUidSource } from "../src/features/auth/utils/scopedPersistence";
import {
  claimPendingOnlineDraft,
  minimalOnlineDraftRequest,
  readPendingOnlineDraft,
  sameOnlineDraftContext,
} from "../src/features/payments/services/pendingOnlineDraft";
import type { OnlineDraftRequest } from "../src/features/payments/services/onlineDraftService";

let uid = "cust_a";
let emit: (next: string | null) => void = () => {};
const listeners: Array<(next: string | null) => void> = [];
configureAuthUidSource({
  getUid: () => uid,
  subscribe: (listener) => {
    listeners.push(listener);
    emit = (next) => listeners.forEach((l) => l(next));
    return () => undefined;
  },
});
const request = (overrides: Partial<OnlineDraftRequest> = {}): OnlineDraftRequest => ({
  orderId: "ord_a",
  attemptId: "attempt_a",
  storeId: "store_a",
  orderType: "delivery",
  addressId: "addr_a",
  deliveryQuoteId: "quote_12345",
  items: [
    {
      productId: "p1",
      quantity: 1,
      customizations: [{ id: "opt_1", name: "Private name", price: 50 }],
    },
  ],
  notes: "Private note",
  fulfillmentInstructions: "Private instruction",
  ...overrides,
});
beforeEach(() => {
  localStorage.clear();
  uid = "cust_a";
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, callback: () => unknown) => callback() },
  });
});

describe("server online draft retry identity", () => {
  it("reclaims one durable order/attempt across tabs and retries", async () => {
    const first = await claimPendingOnlineDraft("cust_a", "attempt_a", request());
    const second = await claimPendingOnlineDraft(
      "cust_a",
      "attempt_new_tab",
      request({ orderId: "ord_other" }),
    );
    expect(second).toEqual(first);
    expect(readPendingOnlineDraft()?.orderId).toBe("ord_a");
  });

  it("refuses identity reuse when basket, address or quote changes", () => {
    const original = minimalOnlineDraftRequest(request());
    expect(
      sameOnlineDraftContext(
        original,
        minimalOnlineDraftRequest(request({ items: [{ productId: "p1", quantity: 2 }] })),
      ),
    ).toBe(false);
    expect(
      sameOnlineDraftContext(original, minimalOnlineDraftRequest(request({ addressId: "addr_b" }))),
    ).toBe(false);
    expect(
      sameOnlineDraftContext(
        original,
        minimalOnlineDraftRequest(request({ deliveryQuoteId: "quote_other" })),
      ),
    ).toBe(false);
    expect(
      sameOnlineDraftContext(
        original,
        minimalOnlineDraftRequest(request({ orderId: "ord_b", attemptId: "attempt_b" })),
      ),
    ).toBe(true);
  });

  it("keeps free text and display option data out of durable storage", async () => {
    await claimPendingOnlineDraft("cust_a", "attempt_a", request());
    const raw = localStorage.getItem(Object.keys(localStorage)[0])!;
    expect(raw).not.toMatch(/Private note|Private instruction|Private name/);
    expect(raw).not.toContain('"price"');
    expect(readPendingOnlineDraft()?.request.items[0].customizations).toEqual([{ id: "opt_1" }]);
  });

  it("purges the prior account's pending draft on account switch", async () => {
    await claimPendingOnlineDraft("cust_a", "attempt_a", request());
    uid = "cust_b";
    emit("cust_b");
    expect(readPendingOnlineDraft()).toBeNull();
  });

  it("fails closed on a corrupt durable record", async () => {
    await claimPendingOnlineDraft("cust_a", "attempt_a", request());
    const key = Object.keys(localStorage)[0];
    localStorage.setItem(key, "{broken");
    expect(() => readPendingOnlineDraft()).toThrow(/Cannot recover/);
  });
});
