/** @vitest-environment jsdom */
/**
 * A6-c11 item 7 (Medium): a signed-in account inherited guest-era (and legacy
 * account) addresses from the shared device key.
 *
 * `readScope(uid)` fell back to the unscoped `burg.addresses` blob for ANY uid,
 * and so did the zustand persist adapter. A phone used signed-out once (someone
 * saves "Home" with their name, phone, flat number and pin) then signed in by a
 * different person offered that guest address pre-filled in checkout, with
 * another person's contact details and a stale `addressId` the server refuses.
 *
 * The module header already promised "The legacy key is never migrated into a
 * signed-in scope". These assertions drive the REAL store and jsdom storage.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const SECRET_GUEST = {
  id: "addr_guest_secret",
  label: "home",
  contactName: "Someone Else",
  contactPhone: "9876543210",
  line1: "Guest flat 402, Palm Grove",
  city: "Ahmedabad",
  pincode: "380001",
  isDefault: true,
};

const OWN_ADDRESS = {
  id: "addr_own",
  label: "work",
  contactName: "Signed In User",
  line1: "Own office",
  city: "Ahmedabad",
  pincode: "380015",
  isDefault: true,
};

const seedLegacy = (addresses: unknown[]) =>
  window.localStorage.setItem(
    "burg.addresses",
    JSON.stringify({
      state: { addresses, selectedId: (addresses[0] as any)?.id ?? null },
      version: 1,
    }),
  );

const seedScope = (uid: string, addresses: unknown[]) =>
  window.localStorage.setItem(
    `burg.addresses::${uid}`,
    JSON.stringify({
      state: { addresses, selectedId: (addresses[0] as any)?.id ?? null },
      version: 1,
    }),
  );

async function freshStore() {
  vi.resetModules();
  const [{ useAddressStore }, { useAuthStore }] = await Promise.all([
    import("../src/features/addresses/state/addressStore"),
    import("../src/features/auth/state/authStore"),
  ]);
  return { useAddressStore, useAuthStore };
}

function signIn(useAuthStore: any, uid: string | null) {
  useAuthStore.setState({ user: uid ? { id: uid, phone: "+919000000000" } : null });
}

describe("address scoping never inherits the guest key (A6-c11 item 7)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("does NOT show a guest-era address to a signed-in account", async () => {
    seedLegacy([SECRET_GUEST]);
    const { useAddressStore, useAuthStore } = await freshStore();
    // Before any sign-in this IS the guest scope: reading the guest key is the
    // documented behaviour (see the last case). The leak was the inherited copy
    // AFTER a uid arrived, asserted below.
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual(["addr_guest_secret"]);

    signIn(useAuthStore, "user_new");

    expect(useAddressStore.getState().addresses).toEqual([]);
    expect(useAddressStore.getState().selectedId).toBeNull();
  });

  it("does NOT select the guest address as the delivery address", async () => {
    seedLegacy([SECRET_GUEST]);
    const { useAddressStore, useAuthStore } = await freshStore();
    signIn(useAuthStore, "user_new");

    const { selectSelectedAddress } = await import("../src/features/addresses/state/addressStore");
    expect(selectSelectedAddress(useAddressStore.getState())).toBeNull();
  });

  it("keeps the signed-in account's OWN addresses", async () => {
    seedLegacy([SECRET_GUEST]);
    seedScope("user_own", [OWN_ADDRESS]);
    const { useAddressStore, useAuthStore } = await freshStore();

    signIn(useAuthStore, "user_own");

    const list = useAddressStore.getState().addresses;
    expect(list.map((a) => a.id)).toEqual(["addr_own"]);
    expect(useAddressStore.getState().selectedId).toBe("addr_own");
  });

  it("never writes the guest blob into a signed-in scope", async () => {
    seedLegacy([SECRET_GUEST]);
    const { useAddressStore, useAuthStore } = await freshStore();
    signIn(useAuthStore, "user_new");

    const scoped = window.localStorage.getItem("burg.addresses::user_new") ?? "";
    expect(scoped).not.toContain("addr_guest_secret");
    expect(scoped).not.toContain("Someone Else");
    expect(useAddressStore.getState().addresses).toEqual([]);
  });

  it("still lets a GUEST read and keep the guest key", async () => {
    seedLegacy([SECRET_GUEST]);
    const { useAddressStore } = await freshStore();

    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual(["addr_guest_secret"]);
  });

  it("drops the guest rows when the session ends for a signed-in account", async () => {
    seedLegacy([SECRET_GUEST]);
    seedScope("user_own", [OWN_ADDRESS]);
    const { useAddressStore, useAuthStore } = await freshStore();
    signIn(useAuthStore, "user_own");
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual(["addr_own"]);

    signIn(useAuthStore, null);

    // Back on the guest scope: the guest's own rows are legitimate there.
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual(["addr_guest_secret"]);
  });
});
