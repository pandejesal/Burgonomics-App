/**
 * Regression: a guest who types a cooking note on the cart, then signs in at
 * checkout (the in-place QuickAuthSheet), lost the note before paying. The
 * auth-scope switch replaced the live draft with the signed-in account's
 * persisted checkout row — which is empty for a fresh account, and an older
 * empty scoped row even defeats the legacy guest fallback. The order then
 * saved `notes: ""` (live: cash order ord_1793524268034_aBOHc5).
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import { useCheckoutStore } from "./checkoutStore";

let emitAuth: (state: { user: { id?: string } | null }) => void = () => {};
let currentUid: string | null = null;
let listeners: Array<(state: { user: { id?: string } | null }) => void> = [];

configureAuthUidSource({
  getUid: () => currentUid,
  subscribe: (listener) => {
    listeners.push(listener);
    emitAuth = (state) => {
      for (const registered of listeners) registered(state);
    };
    return () => {
      listeners = listeners.filter((registered) => registered !== listener);
    };
  },
});

function signInAs(uid: string | null) {
  currentUid = uid;
  emitAuth({ user: uid ? { id: uid } : null });
}

describe("checkout notes survive a mid-checkout sign-in", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useCheckoutStore.setState({
      orderNotes: "",
      legacyOrderNotes: "",
      deliveryInstructions: "",
      pickupInstructions: "",
      diningNotes: "",
      tableNumber: "",
      tipAmount: 0,
      notesScope: { uid: null, storeId: "demo" },
      notesRevision: 7,
    });
  });

  it("keeps the guest draft even when the account already has an empty scoped row", () => {
    signInAs(null);
    // An older checkout row for this account exists and carries no notes; the
    // guest draft lives under the legacy key.
    window.localStorage.setItem(
      "burg.checkout::uid_qa",
      JSON.stringify({ state: { orderNotes: "", notesScope: null }, version: 4 }),
    );
    window.localStorage.setItem(
      "burg.checkout",
      JSON.stringify({ state: { orderNotes: "Extra spicy, no onions" }, version: 4 }),
    );
    useCheckoutStore.setState({
      orderNotes: "Extra spicy, no onions",
      notesScope: { uid: null, storeId: "demo" },
      notesRevision: 7,
    });

    signInAs("uid_qa");

    const state = useCheckoutStore.getState();
    expect(state.orderNotes).toBe("Extra spicy, no onions");
    expect(state.notesRevision).toBeGreaterThan(7);
  });

  it("does not carry one signed-in account's draft into another account", () => {
    signInAs(null);
    signInAs("uid_a");
    useCheckoutStore.setState({
      orderNotes: "Account A note",
      notesScope: { uid: "uid_a", storeId: "demo" },
    });

    signInAs("uid_b");

    expect(useCheckoutStore.getState().orderNotes).not.toBe("Account A note");
  });
});
