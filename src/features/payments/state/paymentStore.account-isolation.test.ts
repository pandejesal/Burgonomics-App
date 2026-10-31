/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import {
  usePaymentStore,
  persistPaymentReconciliation,
  hydratePaymentReconciliation,
  loadPaymentReconciliation,
  clearPaymentReconciliation,
} from "./paymentStore";

// Account-switch isolation regression (A08 B9 follow-up).
//
// The reconciliation record is per-uid on disk, but the payment store is in
// memory. Before this fix a login/logout/account switch in the same tab kept
// the previous account's pending flag and internal/gateway ids, because
// clearReconciliation() cleared only the flag and checkout hydrated once on
// mount. These tests drive the REAL uid-change mechanism (the same way
// favorites-account-isolation does), not a mocked store.

let uid: string | null = null;
let notify: (state: { user: { id: string } | null }) => void;
configureAuthUidSource({
  getUid: () => uid,
  subscribe: (listener) => {
    notify = listener;
    return () => {};
  },
});

function authenticate(next: string | null) {
  uid = next;
  notify({ user: next ? { id: next } : null });
}

const record = (tag: string) => ({
  internalOrderId: `ord_${tag}`,
  gatewayOrderId: `order_rzp_${tag}`,
  reason: "PAYMENT_SYNC_PENDING",
});

beforeEach(() => {
  sessionStorage.clear();
  authenticate(null);
  usePaymentStore.getState().reset();
});

describe("paymentStore account isolation", () => {
  it("never shows A's unresolved reconciliation to B", () => {
    authenticate("account-a");
    persistPaymentReconciliation("account-a", record("a"));
    hydratePaymentReconciliation("account-a");
    expect(usePaymentStore.getState().reconciliationPending).toBe(true);
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_a");

    authenticate("account-b");

    const s = usePaymentStore.getState();
    expect(s.reconciliationPending).toBe(false);
    expect(s.reconciliationReason).toBeNull();
    expect(s.internalOrderId).toBeNull();
    expect(s.gatewayOrderId).toBeNull();
  });

  it("rehydrates the new account's own record, never the previous one", () => {
    authenticate("account-a");
    persistPaymentReconciliation("account-a", record("a"));
    authenticate("account-b");
    persistPaymentReconciliation("account-b", record("b"));

    authenticate("account-a");
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_a");

    authenticate("account-b");
    expect(usePaymentStore.getState().internalOrderId).toBe("ord_b");
    expect(usePaymentStore.getState().gatewayOrderId).toBe("order_rzp_b");
  });

  it("keeps reconciliation records scoped per uid in sessionStorage", () => {
    persistPaymentReconciliation("account-a", record("a"));
    expect(loadPaymentReconciliation("account-a")?.internalOrderId).toBe("ord_a");
    expect(loadPaymentReconciliation("account-b")).toBeNull();
    clearPaymentReconciliation("account-a");
    expect(loadPaymentReconciliation("account-a")).toBeNull();
  });

  it("clearReconciliation drops the ids as well as the flag", () => {
    usePaymentStore
      .getState()
      .setReconciliation(true, "PAYMENT_SYNC_PENDING", "ord_x", "order_rzp_x");
    usePaymentStore.getState().clearReconciliation();

    const s = usePaymentStore.getState();
    expect(s.reconciliationPending).toBe(false);
    expect(s.reconciliationReason).toBeNull();
    expect(s.internalOrderId).toBeNull();
    expect(s.gatewayOrderId).toBeNull();
  });

  it("sign-out clears pending state and both ids", () => {
    authenticate("account-a");
    persistPaymentReconciliation("account-a", record("a"));
    hydratePaymentReconciliation("account-a");
    expect(usePaymentStore.getState().reconciliationPending).toBe(true);

    authenticate(null);

    const s = usePaymentStore.getState();
    expect(s.reconciliationPending).toBe(false);
    expect(s.internalOrderId).toBeNull();
    expect(s.gatewayOrderId).toBeNull();
  });

  it("is idempotent when the same account hydrates twice", () => {
    authenticate("account-a");
    persistPaymentReconciliation("account-a", record("a"));
    hydratePaymentReconciliation("account-a");
    const first = usePaymentStore.getState().internalOrderId;
    hydratePaymentReconciliation("account-a");

    expect(usePaymentStore.getState().internalOrderId).toBe(first);
    expect(usePaymentStore.getState().reconciliationPending).toBe(true);
  });
});
