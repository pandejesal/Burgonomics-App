/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// PAYMENTS_CONTRACT_SPEC audit — finding 6 (cross-account persistence leak).
//
// Orders, notifications, checkout notes and the loyalty cache were persisted
// under DEVICE-global keys (burg.orders / burg.notifications / burg.checkout /
// burgonomics.loyalty.v1): user B signing in on a device last used by user A
// read A's order history, unread notifications, notes and points. These tests
// pin the fixed discipline, shared via src/features/auth/utils/scopedPersistence:
//   1. writes are ALWAYS scoped (`key::uid`);
//   2. reads never mix scopes (strict for orders/notifications/loyalty);
//   3. an identity change re-scopes the in-memory store (no carry-over);
//   4. checkout KEEPS the documented guest→login handoff (legacy fallback
//      read while the signed-in scope is empty).
//
// The uid source is injected (configureAuthUidSource) rather than imported so
// this test — like the app — never depends on authStore's import order.

import {
  scopedStorageKey,
  configureAuthUidSource,
  scopedNamespacedStorage,
} from "../src/features/auth/utils/scopedPersistence";
import { useOrdersStore } from "../src/features/orders/state/ordersStore";
import { useNotificationsStore } from "../src/features/notifications/state/notificationsStore";
import { useCheckoutStore } from "../src/features/checkout/state/checkoutStore";
import { useLoyaltyStore } from "../src/features/loyalty/state/loyaltyStore";

type Listener = (s: { user?: { id?: string } | null }) => void;

let authUid: string | null = null;
let authListeners: Listener[] = [];

const setAuthUid = (uid: string | null) => {
  authUid = uid;
  const snapshot = { user: uid ? { id: uid } : null };
  for (const l of [...authListeners]) l(snapshot);
};

// Install a fake auth source BEFORE the store modules' subscriptions matter.
// (Module imports above already ran their onAuthUidChange registrations;
// configureAuthUidSource emits the current uid to existing listeners.)
configureAuthUidSource({
  getUid: () => authUid,
  subscribe: (listener) => {
    authListeners.push(listener);
    return () => {
      authListeners = authListeners.filter((l) => l !== listener);
    };
  },
});

const orderA = {
  id: "ord_a_1",
  status: { terminal: false },
  store: { id: "b1", name: "Outlet" },
} as any;

const notificationA = {
  id: "ntf_a_1",
  category: "offer",
  title: "A's offer",
  body: "secret",
  createdAt: 1,
  read: false,
};

beforeEach(() => {
  window.localStorage.clear();
  // Sync the helper's last-emitted uid (module-level) to guest via the
  // real notification path, then force-reset every store to empty.
  // Clearing storage FIRST means the re-scope handlers read nothing.
  setAuthUid(null);
  useOrdersStore.setState({ byId: {}, ids: [], activeOrderId: null });
  useNotificationsStore.setState({ items: [], unreadCount: 0 });
  useCheckoutStore.setState({
    orderNotes: "",
    deliveryInstructions: "",
    pickupInstructions: "",
    diningNotes: "",
    tableNumber: "",
    tipAmount: 0,
    loyaltyPointsToRedeem: 0,
  });
  useLoyaltyStore.setState({ balance: 0, lastSyncedAt: null });
});

afterEach(() => {
  authUid = null;
});

describe("scopedStorageKey (finding 6)", () => {
  it("scopes keys per user id; guests keep the legacy key", () => {
    expect(scopedStorageKey("burg.orders", "u1")).toBe("burg.orders::u1");
    expect(scopedStorageKey("burg.orders", "u1")).not.toBe(scopedStorageKey("burg.orders", "u2"));
    expect(scopedStorageKey("burg.orders", null)).toBe("burg.orders");
    expect(scopedStorageKey("burg.orders", undefined)).toBe("burg.orders");
  });
});

describe("scopedNamespacedStorage (finding 6)", () => {
  it("writes always go to the current uid's scope", () => {
    const base = window.localStorage;
    const storage = scopedNamespacedStorage(base);

    setAuthUid("u1");
    storage.setItem("burg.demo", "one");
    setAuthUid("u2");
    storage.setItem("burg.demo", "two");

    expect(base.getItem("burg.demo::u1")).toBe("one");
    expect(base.getItem("burg.demo::u2")).toBe("two");
    // Never written to the shared legacy key once signed in.
    expect(base.getItem("burg.demo")).toBeNull();
  });

  it("reads are strict by default — no legacy fallback into another scope", () => {
    const base = window.localStorage;
    const storage = scopedNamespacedStorage(base);

    base.setItem("burg.demo", "pre-scoping-data");
    setAuthUid("u1");
    expect(storage.getItem("burg.demo")).toBeNull();

    base.setItem("burg.demo::u1", "u1-data");
    expect(storage.getItem("burg.demo")).toBe("u1-data");
  });

  it("legacy fallback read (opt-in) fires only while the scope is empty", () => {
    const base = window.localStorage;
    const storage = scopedNamespacedStorage(base, { legacyFallbackRead: true });

    base.setItem("burg.demo", "guest-entered");
    setAuthUid("u1");
    expect(storage.getItem("burg.demo")).toBe("guest-entered");

    base.setItem("burg.demo::u1", "u1-data");
    expect(storage.getItem("burg.demo")).toBe("u1-data");
  });
});

describe("ordersStore identity re-scope (finding 6)", () => {
  it("does not carry user A's orders into user B's session", async () => {
    setAuthUid("user_a");
    useOrdersStore.getState().upsert(orderA);
    // Persist write-back is synchronous in zustand persist.
    expect(window.localStorage.getItem("burg.orders::user_a")).toContain("ord_a_1");

    setAuthUid("user_b");
    expect(useOrdersStore.getState().byId).toEqual({});
    expect(useOrdersStore.getState().ids).toEqual([]);
    expect(useOrdersStore.getState().activeOrderId).toBeNull();

    setAuthUid("user_a");
    expect(useOrdersStore.getState().byId["ord_a_1"]).toBeDefined();
  });

  it("reads the scoped payload directly on identity change (offline-safe)", () => {
    window.localStorage.setItem(
      "burg.orders::user_a",
      JSON.stringify({
        state: {
          byId: { ord_x: { id: "ord_x", status: { terminal: false } } },
          ids: ["ord_x"],
          activeOrderId: "ord_x",
        },
        version: 1,
      }),
    );

    setAuthUid("user_a");
    expect(useOrdersStore.getState().ids).toEqual(["ord_x"]);
    expect(useOrdersStore.getState().activeOrderId).toBe("ord_x");
  });
});

describe("notificationsStore identity re-scope (finding 6)", () => {
  it("does not carry user A's tray into user B's session", () => {
    setAuthUid("user_a");
    useNotificationsStore.getState().push(notificationA);
    expect(window.localStorage.getItem("burg.notifications::user_a")).toContain("ntf_a_1");

    setAuthUid("user_b");
    expect(useNotificationsStore.getState().items).toEqual([]);
    expect(useNotificationsStore.getState().unreadCount).toBe(0);

    setAuthUid("user_a");
    expect(useNotificationsStore.getState().items).toHaveLength(1);
  });
});

describe("checkoutStore identity re-scope (finding 6)", () => {
  it("does not carry user A's notes into user B's session", () => {
    setAuthUid("user_a");
    useCheckoutStore.getState().setOrderNotes("Deliver to A's home, ring twice");
    expect(window.localStorage.getItem("burg.checkout::user_a")).toContain("ring twice");

    setAuthUid("user_b");
    expect(useCheckoutStore.getState().orderNotes).toBe("");
  });

  it("keeps the documented guest→login handoff (legacy fallback)", () => {
    // Guest types notes before signing in — persisted under the legacy key.
    setAuthUid(null);
    useCheckoutStore.getState().setOrderNotes("guest notes before sign-in");

    setAuthUid("user_a");
    expect(useCheckoutStore.getState().orderNotes).toBe("guest notes before sign-in");
  });
});

describe("loyaltyStore identity re-scope (finding 6)", () => {
  it("does not carry user A's cached balance into user B's session, guests hold zero", () => {
    setAuthUid("user_a");
    window.localStorage.setItem(
      "burgonomics.loyalty.v1::user_a",
      JSON.stringify({ balance: 820, lastSyncedAt: 1 }),
    );
    useLoyaltyStore.setState({ balance: 820, lastSyncedAt: 1 });

    setAuthUid("user_b");
    expect(useLoyaltyStore.getState().balance).toBe(0);

    setAuthUid("user_a");
    expect(useLoyaltyStore.getState().balance).toBe(820);

    setAuthUid(null);
    expect(useLoyaltyStore.getState().balance).toBe(0);
  });
});
