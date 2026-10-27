/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * C-03 — push payload ownership and ref routing.
 *
 * The wire payload carries only { purpose, category, recipientUid, ref }.
 * A uid mismatch is dropped before inbox/toast/navigation; a matching ref is
 * resolved through users/{uid}/notifications/{ref}; missing docs and legacy
 * deeplink/order/ticket fields never route to a private path or "/".
 */
const { mockGetDoc, mockToast, authState } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockToast: vi.fn(),
  authState: { uid: "uid_a" as string | null },
}));

vi.mock("sonner", () => ({
  toast: mockToast,
  Toaster: () => null,
}));

vi.mock("../src/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return authState.uid ? { uid: authState.uid } : null;
    },
    authStateReady: async () => undefined,
  },
  db: {},
  app: {},
}));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doc: vi.fn((...args: unknown[]) => args),
    getDoc: mockGetDoc,
  };
});

import { handleForegroundPush } from "../src/shared/platform/pushNotifications";
import { useNotificationsStore } from "../src/features/notifications/state/notificationsStore";

function lastItem() {
  return useNotificationsStore.getState().items[0];
}

beforeEach(() => {
  window.localStorage.clear();
  useNotificationsStore.getState().clear();
  mockGetDoc.mockReset();
  mockToast.mockReset();
  authState.uid = "uid_a";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("C-03 UID ownership gate", () => {
  it("drops a foreign recipient before inbox, toast or navigation", async () => {
    authState.uid = "uid_b";
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ purpose: "orderUpdates", targetId: "ord_1" }),
    });

    await handleForegroundPush("Order", "Preparing", {
      purpose: "orderUpdates",
      category: "order",
      recipientUid: "uid_a",
      ref: "ref_1",
    });

    expect(useNotificationsStore.getState().items).toHaveLength(0);
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it("drops an account purpose with no ownership claim", async () => {
    await handleForegroundPush("Support", "Reply", {
      purpose: "supportReplies",
      category: "support",
      ref: "ref_1",
    });
    expect(useNotificationsStore.getState().items).toHaveLength(0);
    expect(mockToast).not.toHaveBeenCalled();
  });
});

describe("C-03 ref routing", () => {
  it("resolves a support reply ref to the ticket accordion", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ purpose: "supportReplies", targetId: "tkt_123", read: false }),
    });

    await handleForegroundPush("Support", "We replied", {
      purpose: "supportReplies",
      category: "support",
      recipientUid: "uid_a",
      ref: "ref_support",
    });

    expect(lastItem()).toMatchObject({
      id: "ref_support",
      category: "support",
      deeplink: "/support?ticketId=tkt_123",
    });
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it("resolves an order update ref to the tracking route", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ purpose: "orderUpdates", targetId: "ord_42", read: false }),
    });

    await handleForegroundPush("Order", "Out for delivery", {
      purpose: "orderUpdates",
      category: "order",
      recipientUid: "uid_a",
      ref: "ref_order",
    });

    expect(lastItem()?.deeplink).toBe("/orders/ord_42/track");
    expect(lastItem()?.category).toBe("order");
  });

  it("falls back to the notification centre when the ref doc is missing — never '/'", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });

    await handleForegroundPush("Order", "Update", {
      purpose: "orderUpdates",
      category: "order",
      recipientUid: "uid_a",
      ref: "ref_missing",
    });

    expect(lastItem()?.deeplink).toBe("/profile/notifications");
    expect(lastItem()?.deeplink).not.toBe("/");
  });

  it("ignores legacy deeplink/orderId/ticketId fields in the wire payload", async () => {
    await handleForegroundPush("Order", "Update", {
      purpose: "orderUpdates",
      category: "order",
      recipientUid: "uid_a",
      deeplink: "/orders/forged/track",
      orderId: "forged",
      ticketId: "tkt_forged",
    });

    expect(lastItem()?.deeplink).toBe("/profile/notifications");
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it("keeps public offers public and targetable while signed out", async () => {
    authState.uid = null;

    await handleForegroundPush("50% off", "Today only", {
      purpose: "offers",
      category: "offer",
    });

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(useNotificationsStore.getState().items).toHaveLength(0);
    expect(mockGetDoc).not.toHaveBeenCalled();
  });
});
