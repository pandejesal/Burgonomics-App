/**
 * @vitest-environment jsdom
 *
 * R02 — address persistence honesty (audit 02 F9 + F11, R19 F-R19-1).
 *
 * Guards, all hermetic (firebase config + firebase/firestore fully mocked,
 * no provider calls, no network, no commits):
 *  1. A signed-out mutation must NOT report success and must NOT commit
 *     local state (the old code skipped the remote write and returned `ok`).
 *  2. A failed Firestore write must surface as a typed failure
 *     (`WRITE_FAILED` / `NOT_FOUND`), never as `ok` (F9).
 *  3. `setDefault` on an id absent from the server must fail WITHOUT
 *     committing the batch — existing server defaults stay intact (F11),
 *     and the local store keeps its current default.
 *  4. A sign-out / account switch INSIDE a mutation's remote await must not
 *     commit A's result into B's store or B's persisted scope (R19 F-R19-1).
 *     These use the REAL `useAuthStore` → `addressStore` re-scope subscriber
 *     and jsdom `localStorage`, not just the firebase config mock.
 *  5. Address pin/phone validation and the local list API stay unchanged.
 *
 * jsdom is required so `addressStore` persists through the real
 * `window.localStorage` (`burg.addresses::uid`), letting the re-scope tests
 * assert both the in-memory list AND the persisted per-account payload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => {
  const authState: { currentUser: { uid: string } | null } = { currentUser: null };
  return {
    authState,
    mockCollection: vi.fn((...args: unknown[]) => args),
    mockDoc: vi.fn((...args: unknown[]) => args),
    mockGetDocs: vi.fn(),
    mockSetDoc: vi.fn(),
    mockUpdateDoc: vi.fn(),
    mockDeleteDoc: vi.fn(),
    mockDeleteField: vi.fn(() => "__DELETED__"),
    mockWriteBatch: vi.fn(),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: mocks.mockCollection,
  doc: mocks.mockDoc,
  getDocs: mocks.mockGetDocs,
  setDoc: mocks.mockSetDoc,
  updateDoc: mocks.mockUpdateDoc,
  deleteDoc: mocks.mockDeleteDoc,
  deleteField: mocks.mockDeleteField,
  writeBatch: mocks.mockWriteBatch,
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}));

// Mutable auth session shared by the mocked config module.
vi.mock("../src/core/config/firebase", () => ({
  auth: mocks.authState,
  db: {},
}));

import { addressService } from "../src/features/addresses/services/addressService";
import { addressRepository } from "../src/features/addresses/repositories/AddressRepository";
import { useAddressStore } from "../src/features/addresses/state/addressStore";
import { useAuthStore } from "../src/features/auth/state/authStore";
import { currentScopedUid } from "../src/features/auth/utils/scopedPersistence";
import type { Address, AddressInput } from "../src/features/addresses/models";

const VALID_INPUT: AddressInput = {
  label: "home",
  line1: "Flat 402, Sunshine Heights",
  city: "Ahmedabad",
  pincode: "380001",
  isDefault: false,
};

const ADDRESS_A: Address = {
  id: "addr_a",
  label: "home",
  line1: "Street 1",
  city: "Ahmedabad",
  pincode: "380001",
  isDefault: true,
};

const ADDRESS_B: Address = {
  id: "addr_b",
  label: "work",
  line1: "Street 2",
  city: "Ahmedabad",
  pincode: "380002",
  isDefault: false,
};

/** Firestore QuerySnapshot stand-in: `forEach` over doc-like entries. */
function snapshot(ids: string[]) {
  return {
    forEach: (cb: (d: { id: string; data: () => Record<string, unknown> }) => void) => {
      for (const id of ids) cb({ id, data: () => ({ id }) });
    },
  };
}

/** Snapshot of full address documents (the seed read returns `doc.data()`). */
function addressesSnapshot(rows: Address[]) {
  return {
    forEach: (cb: (d: { id: string; data: () => Record<string, unknown> }) => void) => {
      for (const row of rows) cb({ id: row.id, data: () => ({ ...row }) });
    },
  };
}

function makeBatch() {
  return { update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
}

/** A promise a test resolves manually — models a slow remote write. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Drives the REAL authStore (R19 F-R19-1): `useAddressStore` re-scopes from
 * its authStore subscriber and the repository guard reads the same uid
 * source (`currentScopedUid`), so flipping the user here exercises the
 * actual mid-flight identity change — not a firebase-config stand-in.
 */
function signInAs(uid: string | null, phone = "+91123456789") {
  useAuthStore.setState({ user: uid ? { id: uid, phone } : null });
}

/** Write a scope's persisted payload directly (pre-seed before sign-in). */
function seedScope(uid: string, addresses: Address[]) {
  window.localStorage.setItem(
    `burg.addresses::${uid}`,
    JSON.stringify({ state: { addresses, selectedId: addresses[0]?.id ?? null }, version: 1 }),
  );
}

const scopeRaw = (uid: string) => window.localStorage.getItem(`burg.addresses::${uid}`);

/** A's address with a PII marker that must never surface in B's scope. */
const SECRET_A: Address = {
  id: "addr_secret_a",
  label: "home",
  contactName: "Aarav Secret",
  contactPhone: "9876543210",
  line1: "A's flat 402, Palm Grove",
  city: "Ahmedabad",
  pincode: "380001",
  isDefault: true,
};

/** B's own address, pre-seeded so B's scope is non-empty when A leaks in. */
const OWN_B: Address = {
  id: "addr_own_b",
  label: "work",
  contactName: "Bina Own",
  line1: "B's office, Titanium One",
  city: "Ahmedabad",
  pincode: "380015",
  isDefault: true,
};

const SECRET_INPUT: AddressInput = {
  label: "home",
  contactName: "Aarav Secret",
  contactPhone: "9876543210",
  line1: "A's flat 402, Palm Grove",
  city: "Ahmedabad",
  pincode: "380001",
  isDefault: false,
};

let batch: ReturnType<typeof makeBatch>;

beforeEach(() => {
  vi.clearAllMocks();
  batch = makeBatch();
  mocks.mockWriteBatch.mockReturnValue(batch);
  mocks.mockSetDoc.mockResolvedValue(undefined);
  mocks.mockUpdateDoc.mockResolvedValue(undefined);
  mocks.mockDeleteDoc.mockResolvedValue(undefined);
  mocks.authState.currentUser = { uid: "cust_r02" };
  // Isolate scopes: drop every persisted payload, park the session on guest.
  window.localStorage.clear();
  signInAs(null);
  useAddressStore.getState().clear();
  // Silence the intentional error-path warnings.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R02 · signed-out mutations fail closed (no skipped-auth success)", () => {
  it("create returns AUTH_REQUIRED and never writes remotely", async () => {
    mocks.authState.currentUser = null;
    const res = await addressService.create(VALID_INPUT);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_REQUIRED");
    expect(mocks.mockSetDoc).not.toHaveBeenCalled();
  });

  it("update returns AUTH_REQUIRED and never writes remotely", async () => {
    mocks.authState.currentUser = null;
    const res = await addressService.update("addr_a", { line1: "New line" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_REQUIRED");
    expect(mocks.mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("remove returns AUTH_REQUIRED and never deletes remotely", async () => {
    mocks.authState.currentUser = null;
    const res = await addressService.remove("addr_a");
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_REQUIRED");
    expect(mocks.mockDeleteDoc).not.toHaveBeenCalled();
  });

  it("setDefault returns AUTH_REQUIRED without reading or batching", async () => {
    mocks.authState.currentUser = null;
    const res = await addressService.setDefault("addr_b");
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_REQUIRED");
    expect(mocks.mockGetDocs).not.toHaveBeenCalled();
    expect(mocks.mockWriteBatch).not.toHaveBeenCalled();
  });

  it("repository does not commit local state for a signed-out create", async () => {
    mocks.authState.currentUser = null;
    const res = await addressRepository.create(VALID_INPUT);
    expect(res.success).toBe(false);
    expect(useAddressStore.getState().addresses).toHaveLength(0);
    expect(useAddressStore.getState().selectedId).toBeNull();
  });
});

describe("R02 · swallowed cloud failures now surface as typed errors (F9)", () => {
  it("create reports WRITE_FAILED when setDoc rejects", async () => {
    mocks.mockSetDoc.mockRejectedValue(new Error("offline"));
    const res = await addressService.create(VALID_INPUT);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("WRITE_FAILED");
      expect(res.error.retryable).toBe(true);
      // P1-8: raw exception text must not reach the customer.
      expect(res.error.message).not.toContain("offline");
    }
  });

  it("update reports WRITE_FAILED when updateDoc rejects", async () => {
    mocks.mockUpdateDoc.mockRejectedValue(new Error("permission-denied"));
    const res = await addressService.update("addr_a", { line1: "Renamed" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("WRITE_FAILED");
  });

  it("update reports NOT_FOUND when the server doc is missing", async () => {
    mocks.mockUpdateDoc.mockRejectedValue(
      Object.assign(new Error("No document to update"), { code: "not-found" }),
    );
    const res = await addressService.update("addr_ghost", { line1: "Renamed" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("NOT_FOUND");
  });

  it("remove reports WRITE_FAILED when deleteDoc rejects", async () => {
    mocks.mockDeleteDoc.mockRejectedValue(new Error("unavailable"));
    const res = await addressService.remove("addr_a");
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("WRITE_FAILED");
  });

  it("setDefault reports WRITE_FAILED when the batch commit rejects", async () => {
    mocks.mockGetDocs.mockResolvedValue(snapshot(["addr_a", "addr_b"]));
    batch.commit.mockRejectedValue(new Error("unavailable"));
    const res = await addressService.setDefault("addr_b");
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("WRITE_FAILED");
  });

  it("list still reports WRITE_FAILED when the read rejects", async () => {
    mocks.mockGetDocs.mockRejectedValue(new Error("unavailable"));
    const res = await addressService.list();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("WRITE_FAILED");
  });
});

describe("R02 · setDefault on a nonexistent server id fails without clearing defaults (F11)", () => {
  it("does not commit the batch when the target id is absent", async () => {
    mocks.mockGetDocs.mockResolvedValue(snapshot(["addr_a", "addr_b"]));
    const res = await addressService.setDefault("addr_ghost");
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("NOT_FOUND");
    // The batch that would flip every existing default never commits.
    expect(batch.commit).not.toHaveBeenCalled();
  });

  it("does not commit the batch for an empty server collection", async () => {
    mocks.mockGetDocs.mockResolvedValue(snapshot([]));
    const res = await addressService.setDefault("addr_a");
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("NOT_FOUND");
    expect(batch.commit).not.toHaveBeenCalled();
  });

  it("commits exactly one default when the target exists", async () => {
    mocks.mockGetDocs.mockResolvedValue(snapshot(["addr_a", "addr_b"]));
    const res = await addressService.setDefault("addr_b");
    expect(res.success).toBe(true);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    const updates = batch.update.mock.calls.map((c) => c[1] as { isDefault: boolean });
    expect(updates).toEqual([{ isDefault: false }, { isDefault: true }]);
  });

  it("repository leaves the local default untouched when setDefault fails", async () => {
    useAddressStore.setState({ addresses: [ADDRESS_A, ADDRESS_B], selectedId: "addr_a" });
    mocks.mockGetDocs.mockResolvedValue(snapshot(["addr_a", "addr_b"]));

    const res = await addressRepository.setDefault("addr_ghost");
    expect(res.success).toBe(false);

    const list = useAddressStore.getState().addresses;
    expect(list.find((a) => a.id === "addr_a")?.isDefault).toBe(true);
    expect(list.find((a) => a.id === "addr_b")?.isDefault).toBe(false);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
  });

  it("repository still switches the local default on success", async () => {
    useAddressStore.setState({ addresses: [ADDRESS_A, ADDRESS_B], selectedId: "addr_a" });
    mocks.mockGetDocs.mockResolvedValue(snapshot(["addr_a", "addr_b"]));

    const res = await addressRepository.setDefault("addr_b");
    expect(res.success).toBe(true);

    const list = useAddressStore.getState().addresses;
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
    expect(list.find((a) => a.id === "addr_b")?.isDefault).toBe(true);
  });
});

describe("R02 · repository local-state safety on failed remote saves", () => {
  it("create failure does not add or select an address", async () => {
    useAddressStore.setState({ addresses: [ADDRESS_A], selectedId: "addr_a" });
    mocks.mockSetDoc.mockRejectedValue(new Error("offline"));

    const res = await addressRepository.create(VALID_INPUT);
    expect(res.success).toBe(false);
    expect(useAddressStore.getState().addresses).toEqual([ADDRESS_A]);
    expect(useAddressStore.getState().selectedId).toBe("addr_a");
  });

  it("create success still upserts and selects (unchanged happy path)", async () => {
    useAddressStore.setState({ addresses: [ADDRESS_A], selectedId: null });

    const res = await addressRepository.create(VALID_INPUT);
    expect(res.success).toBe(true);
    const list = useAddressStore.getState().addresses;
    expect(list).toHaveLength(2);
    if (res.success) expect(useAddressStore.getState().selectedId).toBe(res.data.id);
    expect(mocks.mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it("update failure leaves the stored address unchanged", async () => {
    useAddressStore.setState({ addresses: [ADDRESS_A], selectedId: "addr_a" });
    mocks.mockUpdateDoc.mockRejectedValue(new Error("unavailable"));

    const res = await addressRepository.update("addr_a", { line1: "Renamed" });
    expect(res.success).toBe(false);
    expect(useAddressStore.getState().addresses[0].line1).toBe("Street 1");
  });

  it("remove failure keeps the address in the store", async () => {
    useAddressStore.setState({ addresses: [ADDRESS_A, ADDRESS_B], selectedId: "addr_a" });
    mocks.mockDeleteDoc.mockRejectedValue(new Error("unavailable"));

    const res = await addressRepository.remove("addr_a");
    expect(res.success).toBe(false);
    expect(useAddressStore.getState().addresses).toHaveLength(2);
    expect(useAddressStore.getState().selectedId).toBe("addr_a");
  });
});

describe("R02 · pin/phone validation and local list API preserved", () => {
  it("rejects a non-6-digit pincode before any remote write", async () => {
    const res = await addressService.create({ ...VALID_INPUT, pincode: "12345" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("INVALID_ADDRESS");
    expect(mocks.mockSetDoc).not.toHaveBeenCalled();
  });

  it("rejects a non-Indian mobile contactPhone before any remote write", async () => {
    const res = await addressService.create({ ...VALID_INPUT, contactPhone: "1234567890" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("INVALID_ADDRESS");
    expect(mocks.mockSetDoc).not.toHaveBeenCalled();
  });

  it("rejects an invalid pincode patch before any remote write", async () => {
    const res = await addressService.update("addr_a", { pincode: "abc" });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("INVALID_ADDRESS");
    expect(mocks.mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("repository.list() keeps returning the local store array (F3 hydration gap unchanged)", () => {
    useAddressStore.setState({ addresses: [ADDRESS_A, ADDRESS_B], selectedId: "addr_a" });
    expect(addressRepository.list()).toEqual([ADDRESS_A, ADDRESS_B]);
    expect(addressRepository.getSelectedId()).toBe("addr_a");
  });
});

// -- R19 F-R19-1: cross-account re-scope during a remote await ---------
//
// These drive the REAL `useAuthStore` → `addressStore` re-scope subscriber
// and real jsdom localStorage (`burg.addresses::uid`). The firebase config
// mock is still used for the remote half (no provider calls), but the
// identity flip is the store's own — the exact leak R19 described.

describe("R02/R19 · account switch inside a mutation's remote await never leaks A into B", () => {
  /** A signed in remotely; A's own list also holds her existing address. */
  function armSessionAsA() {
    mocks.authState.currentUser = { uid: "user_a" };
    signInAs("user_a");
    useAddressStore.setState({ addresses: [SECRET_A], selectedId: SECRET_A.id });
    expect(scopeRaw("user_a")).toContain("addr_secret_a");
  }

  /** B signs in mid-flight: store re-scopes to B's (pre-seeded) list. */
  function switchToBOwnList() {
    seedScope("user_b", [OWN_B]);
    signInAs("user_b");
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual([OWN_B.id]);
  }

  it("create: A's saved address is never upserted/selected into B's store or burg.addresses::B", async () => {
    armSessionAsA();
    const slow = deferred();
    mocks.mockSetDoc.mockReturnValue(slow.promise);

    const pending = addressRepository.create(SECRET_INPUT);
    await vi.waitFor(() => expect(mocks.mockSetDoc).toHaveBeenCalledTimes(1));

    switchToBOwnList();
    slow.resolve(undefined);
    const res = await pending;

    // Honest failure to the (new) session — not a false B success.
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("AUTH_CHANGED");
      // NOT retryable: A's remote write already committed, so a plain retry
      // under B would duplicate it. The sheet treats this as terminal.
      expect(res.error.retryable).toBe(false);
    }
    // B's in-memory list and persisted scope hold ONLY B's own address.
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual([OWN_B.id]);
    expect(useAddressStore.getState().selectedId).toBe(OWN_B.id);
    const persistedB = scopeRaw("user_b") ?? "";
    expect(persistedB).toContain("addr_own_b");
    expect(persistedB).not.toContain("addr_secret_a");
    expect(persistedB).not.toContain("Aarav Secret");
    expect(persistedB).not.toContain("Palm Grove");
    // The remote write for A DID complete under A's uid — preserved, not undone.
    expect(mocks.mockDoc).toHaveBeenCalledWith({}, "users/user_a/addresses", expect.any(String));
  });

  it("create: same guard when A logs out entirely (uid null) instead of B signing in", async () => {
    armSessionAsA();
    const slow = deferred();
    mocks.mockSetDoc.mockReturnValue(slow.promise);

    const pending = addressRepository.create(SECRET_INPUT);
    await vi.waitFor(() => expect(mocks.mockSetDoc).toHaveBeenCalledTimes(1));

    signInAs(null); // logout — store re-scopes to the guest scope
    slow.resolve(undefined);
    const res = await pending;

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_CHANGED");
    // Guest scope holds nothing of A's.
    expect(useAddressStore.getState().addresses).toEqual([]);
    const legacy = window.localStorage.getItem("burg.addresses") ?? "";
    expect(legacy).not.toContain("Aarav Secret");
    expect(legacy).not.toContain("addr_secret_a");
    // A's own scope still holds exactly her seeded row — the guarded create
    // committed nothing anywhere (no duplicate, no new id).
    expect(JSON.parse(scopeRaw("user_a")!).state.addresses).toEqual([SECRET_A]);
  });

  it("update: A's patch is not applied to B's list or burg.addresses::B", async () => {
    armSessionAsA();
    const slow = deferred();
    mocks.mockUpdateDoc.mockReturnValue(slow.promise);

    const pending = addressRepository.update(SECRET_A.id, { line1: "A's NEW secret line" });
    await vi.waitFor(() => expect(mocks.mockUpdateDoc).toHaveBeenCalledTimes(1));

    switchToBOwnList();
    slow.resolve(undefined);
    const res = await pending;

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_CHANGED");
    expect(useAddressStore.getState().addresses).toEqual([OWN_B]);
    expect(scopeRaw("user_b") ?? "").not.toContain("A's NEW secret line");
    // Remote write for A completed under A's uid.
    expect(mocks.mockDoc).toHaveBeenCalledWith({}, "users/user_a/addresses", SECRET_A.id);
  });

  it("remove: A's delete does not remove anything from B's list or burg.addresses::B", async () => {
    armSessionAsA();
    const slow = deferred();
    mocks.mockDeleteDoc.mockReturnValue(slow.promise);

    const pending = addressRepository.remove(SECRET_A.id);
    await vi.waitFor(() => expect(mocks.mockDeleteDoc).toHaveBeenCalledTimes(1));

    switchToBOwnList();
    slow.resolve(undefined);
    const res = await pending;

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_CHANGED");
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual([OWN_B.id]);
    expect(scopeRaw("user_b")).toContain("addr_own_b");
  });

  it("setDefault: A's default flip does not touch B's list or burg.addresses::B", async () => {
    armSessionAsA();
    const otherA: Address = {
      ...SECRET_A,
      id: "addr_a2",
      isDefault: false,
      line1: "A's other flat",
    };
    useAddressStore.setState({ addresses: [SECRET_A, otherA], selectedId: SECRET_A.id });
    mocks.mockGetDocs.mockResolvedValue(snapshot(["addr_secret_a", "addr_a2"]));
    const slow = deferred<void>();
    batch.commit.mockReturnValue(slow.promise);

    const pending = addressRepository.setDefault("addr_a2");
    await vi.waitFor(() => expect(batch.commit).toHaveBeenCalledTimes(1));

    switchToBOwnList();
    slow.resolve();
    const res = await pending;

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_CHANGED");
    // B keeps exactly one default: its own address.
    const listB = useAddressStore.getState().addresses;
    expect(listB.filter((a) => a.isDefault).map((a) => a.id)).toEqual([OWN_B.id]);
    const persistedB = scopeRaw("user_b") ?? "";
    expect(persistedB).toContain("addr_own_b");
    expect(persistedB).not.toContain("addr_secret_a");
  });

  it("no AUTH_CHANGED when the session is stable — A's result commits to A's scope (actual uid mapping)", async () => {
    armSessionAsA();
    mocks.mockSetDoc.mockResolvedValue(undefined);

    const res = await addressRepository.create(SECRET_INPUT);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.id.startsWith("addr_")).toBe(true);
    // Committed to A's in-memory list AND A's persisted scope, never B's.
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toContain("addr_secret_a");
    expect(scopeRaw("user_a")).toContain("Aarav Secret");
    expect(scopeRaw("user_b")).toBeNull();
    expect(window.localStorage.getItem("burg.addresses") ?? "").not.toContain("Aarav Secret");
    expect(mocks.mockDoc).toHaveBeenCalledWith({}, "users/user_a/addresses", expect.any(String));
  });

  it("no false AUTH_CHANGED when the uid source is a guest on both sides (existing suite's init shape)", async () => {
    // The original R02 tests initialise ONLY the firebase config mock and
    // never touch authStore: scoped uid is null before AND after the await,
    // so the guard must stay silent (no spurious reject).
    expect(currentScopedUid()).toBeNull();
    useAddressStore.setState({ addresses: [ADDRESS_A], selectedId: "addr_a" });
    mocks.mockDeleteDoc.mockResolvedValue(undefined);

    const res = await addressRepository.remove(ADDRESS_A.id);
    expect(res.success).toBe(true);
    expect(useAddressStore.getState().addresses).toEqual([]);
    // Local commit went to the guest (legacy) scope, per the store's rules.
    expect(window.localStorage.getItem("burg.addresses")).toContain("selectedId");
  });

  it("no false AUTH_CHANGED when the signed-in uid is stable across the await", async () => {
    mocks.authState.currentUser = { uid: "cust_r02" };
    signInAs("cust_r02");
    useAddressStore.setState({ addresses: [ADDRESS_A], selectedId: "addr_a" });

    const slow = deferred();
    mocks.mockUpdateDoc.mockReturnValue(slow.promise);
    const pending = addressRepository.update("addr_a", { line1: "Renamed for cust_r02" });
    await vi.waitFor(() => expect(mocks.mockUpdateDoc).toHaveBeenCalledTimes(1));
    slow.resolve(undefined);
    const res = await pending;

    expect(res.success).toBe(true);
    expect(useAddressStore.getState().addresses[0].line1).toBe("Renamed for cust_r02");
    expect(scopeRaw("cust_r02")).toContain("Renamed for cust_r02");
  });
});

// -- Address server-truth debt: seed on login (audit 02 F3) --------------
//
// The seed path is `addressRepository.hydrate()`: read the signed-in uid's
// server collection through `addressService.list()`, then merge it into the
// local store. A failed read is never an empty list, a stale snapshot never
// overwrites a newer local write, a local delete is never resurrected, and a
// snapshot that arrives after an account switch is never written anywhere.

const SERVER_A: Address = {
  id: "srv_a",
  label: "home",
  line1: "Server flat 1",
  city: "Ahmedabad",
  pincode: "380001",
  isDefault: true,
};
const SERVER_B: Address = {
  id: "srv_b",
  label: "work",
  line1: "Server office 2",
  city: "Ahmedabad",
  pincode: "380015",
  isDefault: false,
};
const LOCAL_ONLY: Address = {
  id: "srv_local_only",
  label: "other",
  line1: "Typed while signed out",
  city: "Ahmedabad",
  pincode: "380009",
  isDefault: true,
};

describe("Address debt · server seed on fresh login (F3)", () => {
  it("seeds the server collection into an empty local store for the signed-in uid", async () => {
    mocks.authState.currentUser = { uid: "user_new" };
    signInAs("user_new");
    mocks.mockGetDocs.mockResolvedValue(addressesSnapshot([SERVER_B, SERVER_A]));

    const res = await addressRepository.hydrate();

    expect(res.success).toBe(true);
    expect(mocks.mockCollection).toHaveBeenCalledWith({}, "users/user_new/addresses");
    const list = useAddressStore.getState().addresses;
    expect(list.map((a) => a.id).sort()).toEqual(["srv_a", "srv_b"]);
    // Server truth: exactly the row the server marks default.
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual(["srv_a"]);
    expect(useAddressStore.getState().selectedId).toBe("srv_a");
    // The seed is persisted into A's own scope, ready for the next render.
    expect(scopeRaw("user_new")).toContain("srv_a");
    expect(scopeRaw("user_new")).toContain("srv_b");
  });

  it("never treats a failed read as an empty list, and leaves local rows untouched", async () => {
    mocks.authState.currentUser = { uid: "user_new" };
    signInAs("user_new");
    const local: Address = { ...SERVER_A, line1: "Only on this device" };
    useAddressStore.setState({ addresses: [local], selectedId: local.id });
    const before = scopeRaw("user_new");
    mocks.mockGetDocs.mockRejectedValue(new Error("offline"));

    const res = await addressRepository.hydrate();

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("WRITE_FAILED");
    expect(useAddressStore.getState().addresses).toEqual([local]);
    expect(useAddressStore.getState().selectedId).toBe(local.id);
    // No false "0 addresses" write-back: the persisted scope is unchanged.
    expect(scopeRaw("user_new")).toBe(before);
  });

  it("does not read the server for a guest session", async () => {
    signInAs(null);
    const res = await addressRepository.hydrate();
    expect(res.success).toBe(true);
    expect(mocks.mockGetDocs).not.toHaveBeenCalled();
  });

  it("never writes A's server snapshot into B's store or burg.addresses::B after a switch", async () => {
    mocks.authState.currentUser = { uid: "user_a" };
    signInAs("user_a");
    seedScope("user_b", [OWN_B]);
    const slow = deferred<ReturnType<typeof snapshot>>();
    mocks.mockGetDocs.mockReturnValue(slow.promise);

    const pending = addressRepository.hydrate();
    await vi.waitFor(() => expect(mocks.mockGetDocs).toHaveBeenCalledTimes(1));
    signInAs("user_b");
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual([OWN_B.id]);

    slow.resolve(addressesSnapshot([SECRET_A]));
    const res = await pending;

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_CHANGED");
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual([OWN_B.id]);
    expect(scopeRaw("user_b")).toContain("addr_own_b");
    expect(scopeRaw("user_b")).not.toContain("addr_secret_a");
    expect(scopeRaw("user_b")).not.toContain("Aarav Secret");
    // The snapshot was not cached into A's scope either — the guard rejects
    // before any store write.
    expect(scopeRaw("user_a") ?? "").not.toContain("addr_secret_a");
  });

  it("does not overwrite a newer local write that lands while the seed read is in flight", async () => {
    mocks.authState.currentUser = { uid: "user_new" };
    signInAs("user_new");
    useAddressStore.setState({ addresses: [SERVER_A], selectedId: SERVER_A.id });
    const slow = deferred<ReturnType<typeof snapshot>>();
    mocks.mockGetDocs.mockReturnValue(slow.promise);

    const pending = addressRepository.hydrate();
    await vi.waitFor(() => expect(mocks.mockGetDocs).toHaveBeenCalledTimes(1));
    mocks.mockUpdateDoc.mockResolvedValue(undefined);
    const updated = await addressRepository.update("srv_a", { line1: "Newest local line" });
    expect(updated.success).toBe(true);

    slow.resolve(addressesSnapshot([{ ...SERVER_A, line1: "Stale server line" }]));
    const res = await pending;

    expect(res.success).toBe(true);
    const row = useAddressStore.getState().addresses.find((a) => a.id === "srv_a");
    expect(row?.line1).toBe("Newest local line");
    expect(scopeRaw("user_new")).toContain("Newest local line");
  });

  it("does not resurrect an address deleted while the seed read is in flight", async () => {
    mocks.authState.currentUser = { uid: "user_new" };
    signInAs("user_new");
    const keep: Address = { ...SERVER_B, isDefault: true };
    const doomed: Address = { ...SERVER_A, id: "srv_doomed", isDefault: false };
    useAddressStore.setState({ addresses: [keep, doomed], selectedId: keep.id });
    const slow = deferred<ReturnType<typeof snapshot>>();
    mocks.mockGetDocs.mockReturnValue(slow.promise);

    const pending = addressRepository.hydrate();
    await vi.waitFor(() => expect(mocks.mockGetDocs).toHaveBeenCalledTimes(1));
    mocks.mockDeleteDoc.mockResolvedValue(undefined);
    const deleted = await addressRepository.remove(doomed.id);
    expect(deleted.success).toBe(true);

    slow.resolve(addressesSnapshot([doomed, keep]));
    const res = await pending;

    expect(res.success).toBe(true);
    expect(useAddressStore.getState().addresses.map((a) => a.id)).toEqual([keep.id]);
    expect(scopeRaw("user_new")).not.toContain("srv_doomed");
  });

  it("keeps an unsynced local-only row while adding the server rows", async () => {
    mocks.authState.currentUser = { uid: "user_new" };
    signInAs("user_new");
    useAddressStore.setState({ addresses: [LOCAL_ONLY], selectedId: LOCAL_ONLY.id });
    mocks.mockGetDocs.mockResolvedValue(addressesSnapshot([SERVER_A]));

    const res = await addressRepository.hydrate();

    expect(res.success).toBe(true);
    const list = useAddressStore.getState().addresses;
    expect(list.map((a) => a.id).sort()).toEqual(["srv_a", "srv_local_only"]);
    expect(list.find((a) => a.id === LOCAL_ONLY.id)?.line1).toBe(LOCAL_ONLY.line1);
    // The server row remains the default; the unsynced row keeps its data but
    // does not displace the server's recorded default.
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual(["srv_a"]);
  });
});

// -- Address server-truth debt: delete-default promotion (debt 2) ---------
//
// Deleting the default must not leave a locally promoted default that the
// server never recorded. The promotion is mirrored with setDefault, and the
// row is only shown as default once that write confirms. If the mirror fails
// (or the session changes mid-write), no row keeps the default flag.

describe("Address debt · delete-default promotion is server-confirmed", () => {
  function stableUser(uid = "user_new") {
    mocks.authState.currentUser = { uid };
    signInAs(uid);
  }

  it("mirrors the promoted default and only then presents it", async () => {
    stableUser();
    useAddressStore.setState({ addresses: [ADDRESS_A, ADDRESS_B], selectedId: "addr_a" });
    mocks.mockDeleteDoc.mockResolvedValue(undefined);
    mocks.mockGetDocs.mockResolvedValue(snapshot(["addr_b"]));

    const res = await addressRepository.remove("addr_a");

    expect(res.success).toBe(true);
    expect(mocks.mockDeleteDoc).toHaveBeenCalledTimes(1);
    // The promotion read + batch is the server mirror, not a local-only claim.
    expect(mocks.mockGetDocs).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    const list = useAddressStore.getState().addresses;
    expect(list.map((a) => a.id)).toEqual(["addr_b"]);
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual(["addr_b"]);
  });

  it("does not claim a default when the promotion mirror fails", async () => {
    stableUser();
    useAddressStore.setState({ addresses: [ADDRESS_A, ADDRESS_B], selectedId: "addr_a" });
    mocks.mockDeleteDoc.mockResolvedValue(undefined);
    mocks.mockGetDocs.mockResolvedValue(snapshot(["addr_b"]));
    batch.commit.mockRejectedValue(new Error("unavailable"));

    const res = await addressRepository.remove("addr_a");

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("DEFAULT_PROMOTION_FAILED");
      expect(res.error.retryable).toBe(false);
      // The delete DID commit; the message must say so and ask for a choice.
      expect(res.error.message.toLowerCase()).toContain("deleted");
      expect(res.error.message.toLowerCase()).toContain("default");
    }
    const list = useAddressStore.getState().addresses;
    expect(list.map((a) => a.id)).toEqual(["addr_b"]);
    // No false server-default claim locally or in the persisted scope.
    expect(list.filter((a) => a.isDefault)).toHaveLength(0);
    expect(scopeRaw("user_new")).not.toContain('"isDefault":true');
  });

  it("does not promote or mirror when the deleted row was not the default", async () => {
    stableUser();
    useAddressStore.setState({ addresses: [ADDRESS_A, ADDRESS_B], selectedId: "addr_a" });
    mocks.mockDeleteDoc.mockResolvedValue(undefined);

    const res = await addressRepository.remove("addr_b");

    expect(res.success).toBe(true);
    expect(mocks.mockGetDocs).not.toHaveBeenCalled();
    expect(batch.commit).not.toHaveBeenCalled();
    const list = useAddressStore.getState().addresses;
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual(["addr_a"]);
  });

  it("deleting the only address succeeds and leaves no default behind", async () => {
    stableUser();
    useAddressStore.setState({ addresses: [ADDRESS_A], selectedId: "addr_a" });
    mocks.mockDeleteDoc.mockResolvedValue(undefined);

    const res = await addressRepository.remove("addr_a");

    expect(res.success).toBe(true);
    expect(useAddressStore.getState().addresses).toEqual([]);
    expect(useAddressStore.getState().selectedId).toBeNull();
    expect(mocks.mockGetDocs).not.toHaveBeenCalled();
  });

  it("does not leak A's promotion into B when the session switches during the mirror", async () => {
    mocks.authState.currentUser = { uid: "user_a" };
    signInAs("user_a");
    seedScope("user_b", [OWN_B]);
    const otherA: Address = { ...SECRET_A, id: "addr_a2", isDefault: false };
    useAddressStore.setState({
      addresses: [SECRET_A, otherA],
      selectedId: SECRET_A.id,
    });
    mocks.mockDeleteDoc.mockResolvedValue(undefined);
    mocks.mockGetDocs.mockResolvedValue(snapshot(["addr_a2"]));
    const slow = deferred<void>();
    batch.commit.mockReturnValue(slow.promise);

    const pending = addressRepository.remove(SECRET_A.id);
    await vi.waitFor(() => expect(batch.commit).toHaveBeenCalledTimes(1));
    signInAs("user_b");
    slow.resolve();
    const res = await pending;

    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe("AUTH_CHANGED");
    const listB = useAddressStore.getState().addresses;
    expect(listB.map((a) => a.id)).toEqual([OWN_B.id]);
    expect(listB.filter((a) => a.isDefault).map((a) => a.id)).toEqual([OWN_B.id]);
    expect(scopeRaw("user_b")).not.toContain("addr_a2");
    // A's own scope must not keep an unconfirmed promoted default either.
    expect(scopeRaw("user_a") ?? "").not.toContain('"isDefault":true');
  });
});
