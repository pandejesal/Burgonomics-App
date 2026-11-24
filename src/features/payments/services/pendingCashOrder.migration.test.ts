/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/features/auth/utils/scopedPersistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/utils/scopedPersistence")>()),
  currentScopedUid: () => "uid_migration",
}));
import { scopedStorageKey } from "@/features/auth/utils/scopedPersistence";
import { PENDING_CASH_ORDER_BASE_KEY, readPendingCashOrder } from "./pendingCashOrder";

const oldBase = ["burg", "pendingCashOrder", "v1"].join(".");
const record = {
  uid: "uid_migration",
  attemptId: "attempt_old",
  orderId: "ord_old",
  confirmed: false,
  createdAtMs: 1,
  updatedAtMs: 1,
  request: {
    orderId: "ord_old",
    storeId: "store_1",
    orderType: "takeaway",
    items: [{ productId: "p1", quantity: 1 }],
    expectedTotalPaise: 10900,
  },
};
beforeEach(() => localStorage.clear());

describe("pending cash key migration", () => {
  it("moves the old account-scoped record once and preserves recovery", () => {
    const oldKey = scopedStorageKey(oldBase, "uid_migration");
    const newKey = scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY, "uid_migration");
    localStorage.setItem(oldKey, JSON.stringify(record));
    expect(readPendingCashOrder()?.orderId).toBe("ord_old");
    expect(localStorage.getItem(newKey)).toBe(JSON.stringify(record));
    expect(localStorage.getItem(oldKey)).toBeNull();
    // The old key is gone, so every later recovery reads only the new key.
    expect(readPendingCashOrder()?.attemptId).toBe("attempt_old");
    expect(localStorage.getItem(oldKey)).toBeNull();
  });
});
