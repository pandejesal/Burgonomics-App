/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { useCheckoutStore } from "./checkoutStore";
import {
  MAX_ORDER_NOTES_UNITS,
  hasUnreviewedLegacyNotes,
} from "@/features/checkout/utils/orderNotes";

const store = () => useCheckoutStore.getState();

beforeEach(() => {
  store().reset();
  useCheckoutStore.setState({ notesScope: null });
});

describe("checkout notes store boundary", () => {
  it("rejects an over-limit change at the store boundary and keeps the prior value", () => {
    expect(store().setOrderNotes("less spicy")).toBe(true);
    expect(store().setOrderNotes("x".repeat(MAX_ORDER_NOTES_UNITS + 1))).toBe(false);
    expect(store().orderNotes).toBe("less spicy");
  });

  it("never halves a surrogate pair on accept/reject", () => {
    expect(store().setOrderNotes("🍔".repeat(120))).toBe(true);
    expect(store().orderNotes.length).toBe(240);
    // 121 emoji = 242 units: the whole change is rejected, prior value kept.
    expect(store().setOrderNotes("🍔".repeat(121))).toBe(false);
    expect(store().orderNotes).toBe("🍔".repeat(120));
  });

  it("resolves a legacy oversized draft only through an explicit decision", () => {
    useCheckoutStore.setState({ legacyOrderNotes: "old ".repeat(100), orderNotes: "" });
    store().resolveLegacyOrderNotes("keep", "shortened note");
    expect(store().orderNotes).toBe("shortened note");
    expect(store().legacyOrderNotes).toBe("");

    useCheckoutStore.setState({ legacyOrderNotes: "another legacy draft" });
    store().resolveLegacyOrderNotes("discard");
    expect(store().legacyOrderNotes).toBe("");
  });

  it("refuses to accept a still-oversized legacy resolution", () => {
    useCheckoutStore.setState({ legacyOrderNotes: "old".repeat(200) });
    store().resolveLegacyOrderNotes("keep", "y".repeat(MAX_ORDER_NOTES_UNITS + 10));
    expect(store().orderNotes).toBe("");
    expect(store().legacyOrderNotes).not.toBe("");
  });

  it("forces the legacy loyalty redemption field to zero", () => {
    store().setLoyaltyPointsToRedeem(500);
    expect(store().loyaltyPointsToRedeem).toBe(0);
  });

  it("clears the draft on an outlet change but keeps a guest draft through sign-in", () => {
    store().bindNotesScope(null, "store-A");
    store().setOrderNotes("guest draft");

    // Guest → signed-in keeps the keystrokes (documented handoff).
    store().bindNotesScope("uid-1", "store-A");
    expect(store().orderNotes).toBe("guest draft");

    // Switching outlet clears the draft written for the previous outlet.
    store().bindNotesScope("uid-1", "store-B");
    expect(store().orderNotes).toBe("");
  });
});

describe("clearNotesAfterCompletedOrder — exact draft only", () => {
  const bindAndDraft = (uid: string | null, storeId: string, note: string) => {
    store().bindNotesScope(uid, storeId);
    store().setOrderNotes(note);
  };

  it("clears the exact draft the completed order captured", () => {
    bindAndDraft("uid-1", "store-A", "extra napkins");
    const mark = store().captureNotesDraft("uid-1", "store-A");

    store().clearNotesAfterCompletedOrder(mark);

    expect(store().orderNotes).toBe("");
  });

  it("does NOT wipe a NEW draft written under the SAME account and outlet", () => {
    bindAndDraft("uid-1", "store-A", "extra napkins");
    // Captured before the async place/pay call.
    const mark = store().captureNotesDraft("uid-1", "store-A");

    // A newer draft is written while the order is in flight.
    store().setOrderNotes("ring the bell twice");
    const newerRevision = store().notesRevision;
    expect(newerRevision).not.toBe(mark.revision);

    store().clearNotesAfterCompletedOrder(mark);

    expect(store().orderNotes).toBe("ring the bell twice");
  });

  it("never clears another account's or another outlet's draft", () => {
    bindAndDraft("uid-1", "store-A", "keep me");
    const mark = store().captureNotesDraft("uid-1", "store-A");

    // Different account completing (same outlet).
    store().clearNotesAfterCompletedOrder({ ...mark, uid: "uid-2" });
    expect(store().orderNotes).toBe("keep me");

    // Different outlet completing (same account).
    store().clearNotesAfterCompletedOrder({ ...mark, storeId: "store-B" });
    expect(store().orderNotes).toBe("keep me");

    // The real one still clears.
    store().clearNotesAfterCompletedOrder(mark);
    expect(store().orderNotes).toBe("");
  });

  it("does not clear after an account/outlet lifecycle change", () => {
    bindAndDraft("uid-1", "store-A", "before switch");
    const mark = store().captureNotesDraft("uid-1", "store-A");

    // The customer switches outlet: the old draft is gone and the scope moved.
    store().bindNotesScope("uid-1", "store-B");
    store().setOrderNotes("after switch");

    store().clearNotesAfterCompletedOrder(mark);

    expect(store().orderNotes).toBe("after switch");
    expect(store().notesScope).toEqual({ uid: "uid-1", storeId: "store-B" });
  });

  it("does not let a pre-reset completion clear a fresh draft", () => {
    bindAndDraft("uid-1", "store-A", "old draft");
    const mark = store().captureNotesDraft("uid-1", "store-A");

    store().reset();
    store().bindNotesScope("uid-1", "store-A");
    store().setOrderNotes("new cart draft");

    store().clearNotesAfterCompletedOrder(mark);

    expect(store().orderNotes).toBe("new cart draft");
  });

  it("is a no-op when the draft was never bound to a scope", () => {
    store().setOrderNotes("unbound");
    const mark = store().captureNotesDraft(null, null);

    store().clearNotesAfterCompletedOrder(mark);

    expect(store().orderNotes).toBe("unbound");
  });
});

describe("hasUnreviewedLegacyNotes — the checkout payment gate", () => {
  it("blocks on an oversized legacy draft", () => {
    expect(hasUnreviewedLegacyNotes("legacy", [])).toBe(true);
    expect(hasUnreviewedLegacyNotes("   ", [])).toBe(false);
  });

  it("blocks while any cart line still carries a legacy note", () => {
    expect(hasUnreviewedLegacyNotes("", [{ notes: "no onions" }])).toBe(true);
    expect(hasUnreviewedLegacyNotes("", [{ notes: "   " }])).toBe(false);
    expect(hasUnreviewedLegacyNotes("", [{}, { notes: undefined }])).toBe(false);
  });
});
