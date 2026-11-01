/**
 * CUS-18 — the saved-address read at checkout.
 *
 * Live (3515da9): the QA account's "QA Test" address exists in
 * `users/{uid}/addresses` and is the account default, yet checkout showed
 * "No saved delivery addresses found." Checkout only ever read the persisted
 * LOCAL list; only the Manage Addresses screen called
 * `addressRepository.hydrate()`, so a fresh browser profile (or a second
 * device) had no local rows and reported a false empty state.
 *
 * A failed read must also never be presented as "you have no addresses".
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  hydrate: vi.fn(),
  addresses: [] as unknown[],
}));

vi.mock("@/features/addresses/services/addressService", () => ({
  addressService: {
    list: vi.fn(async () => ({ success: true, data: [] })),
  },
}));
vi.mock("@/features/auth/utils/scopedPersistence", () => ({
  currentScopedUid: () => "uid_qa",
  configureAuthUidSource: vi.fn(),
  purgeScopedLocalCaches: vi.fn(),
  scopedNamespacedStorage: () => ({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }),
  browserOrMemoryStorage: () => ({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }),
  onAuthUidChange: () => () => {},
  readScopedPersisted: (_key: string, _uid: unknown, _read: unknown, empty: unknown) => empty,
}));
// A minimal in-memory stand-in for the persisted store: the repository's real
// `hydrate()` logic runs, and `setState` genuinely stores what it writes.
vi.mock("@/features/addresses/state/addressStore", async () => {
  const { create } = await import("zustand");
  const store = create<{
    addresses: unknown[];
    selectedId: string | null;
    selected: unknown;
    upsert: (a: unknown) => void;
    update: (id: string, patch: unknown) => void;
    remove: (id: string) => void;
    setDefault: (id: string) => void;
    select: (id: string | null) => void;
    clear: () => void;
  }>()(() => ({
    addresses: [],
    selectedId: null,
    selected: null,
    upsert: () => {},
    update: () => {},
    remove: () => {},
    setDefault: () => {},
    select: () => {},
    clear: () => {},
  }));
  return {
    useAddressStore: store,
    selectAddresses: (s: { addresses: unknown[] }) => s.addresses,
    selectSelectedAddress: () => null,
  };
});

// The real repository, with only its network read replaced.
vi.mock("@/features/addresses/services/addressService", () => ({
  addressService: { list: fixture.hydrate },
}));

import { AddressRepository } from "@/features/addresses/repositories/AddressRepository";
import { useAddressStore } from "@/features/addresses/state/addressStore";
import { classifyAddressLoad } from "@/features/addresses/utils/addressLoadState";

const SERVER_ROWS = [
  {
    id: "addr_qa_test",
    label: "other",
    customLabel: "QA Test",
    line1: "1 Test Street",
    city: "Surat",
    pincode: "395007",
    lat: 21.15,
    lng: 72.77,
    isDefault: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  fixture.addresses = [];
  useAddressStore.setState({ addresses: [], selectedId: null } as never);
});

describe("CUS-18 — checkout reads the account's addresses, not just local storage", () => {
  it("hydrate() seeds the store from the account collection", async () => {
    fixture.hydrate.mockResolvedValue({ success: true, data: SERVER_ROWS });
    const repository = new AddressRepository();

    const res = await repository.hydrate();

    expect(res.success).toBe(true);
    // The account's rows are what the screen now renders.
    const seeded = repository.list();
    expect(seeded.map((a) => a.id)).toContain("addr_qa_test");
  });
  it("a failed read is never reported as an empty list", async () => {
    fixture.hydrate.mockResolvedValue({
      success: false,
      error: { code: "WRITE_FAILED", message: "We couldn't load your addresses.", retryable: true },
    });
    const repository = new AddressRepository();

    const res = await repository.hydrate();

    expect(res.success).toBe(false);
    // Nothing was invented: the store is untouched and the caller shows the
    // failure with a retry.
    expect(repository.list()).toEqual([]);
  });
});

describe("CUS-18 — the address list's three honest states", () => {
  it("reports loading while the first read is in flight, never an empty list", () => {
    expect(classifyAddressLoad({ loading: true, error: null, count: 0 })).toBe("loading");
  });

  it("reports a failure, not an empty list, when the read failed", () => {
    expect(classifyAddressLoad({ loading: false, error: "offline", count: 0 })).toBe("error");
  });

  it("reports empty only when a read actually succeeded and returned nothing", () => {
    expect(classifyAddressLoad({ loading: false, error: null, count: 0 })).toBe("empty");
    expect(classifyAddressLoad({ loading: false, error: null, count: 2 })).toBe("ready");
  });
});
