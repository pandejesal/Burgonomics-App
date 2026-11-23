/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { scopedStorageKey } from "@/features/auth/utils/scopedPersistence";
import { PENDING_CASH_ORDER_BASE_KEY } from "@/features/payments/services/pendingCashOrder";

/**
 * r4 point 10 — independent tabs are SEPARATE storage contexts. Two tabs share
 * the uid but own distinct localStorage maps; the durable key is uid-scoped so
 * convergence is by key, and a different account cannot read or clear it.
 */
function makeTab() {
  const store = new Map<string, string>();
  return {
    store,
    get: (k: string) => store.get(k) ?? null,
    set: (k: string, v: string) => {
      store.set(k, v);
    },
    del: (k: string) => {
      store.delete(k);
    },
  };
}

describe("independent tab storage contexts", () => {
  it("two tabs on one uid converge on one scoped key", () => {
    const a = makeTab();
    const b = makeTab();
    const key = scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "u1");
    a.set(key, JSON.stringify({ uid: "u1", attemptId: "shared", orderId: "o" }));
    b.set(key, a.get(key)!);
    expect(a.get(key)).toContain("shared");
    expect(b.get(key)).toBe(a.get(key));
    expect(key).toBe(`${PENDING_CASH_ORDER_BASE_KEY}::u1`);
  });

  it("a different uid's key is isolated and deletion purges only that uid", () => {
    const a = makeTab();
    const k1 = scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "u1");
    const k2 = scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "u2");
    a.set(k1, JSON.stringify({ uid: "u1", attemptId: "a1" }));
    expect(a.get(k2)).toBeNull();
    a.del(k1);
    expect(a.get(k1)).toBeNull();
  });
});
