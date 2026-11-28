/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  KITCHEN_CLOSED_BY_STAFF_MESSAGE,
  istMinutesSinceMidnight,
  kitchenClosedMessage,
  resetDefaultHoursWarningForTests,
  resolveOutletOpenState,
} from "./operatingHours";
import { outletHoursDocuments, useKitchenHours } from "@/shared/hooks/useKitchenHours";
import { KitchenClosedBanner } from "@/shared/components/feedback/KitchenClosedBanner";
import { mapStoreDoc, storesService } from "@/features/stores/services/storesService";

// `act` imported from "react" only flushes effects when this flag is set
// outside react-dom/test-utils; without it React warns and batching is
// unreliable across the fake clock.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Firestore is mocked so the parity tests exercise the real mapping code paths
 * (`byId`, the directory read + mirror backfill) without a network or emulator.
 * The resolver, hook and banner under test are the real implementations.
 */
const firestore = vi.hoisted(() => ({
  /** "collection/id" → document data, for point reads. */
  docs: {} as Record<string, any>,
  /** Rows returned by the `stores` directory query. */
  directory: [] as Array<{ id: string; data: any }>,
  /** `admin_stores/{id}` documents returned by the chunked `in` query. */
  adminIn: {} as Record<string, any>,
  calls: [] as Array<{ collection: string; kind: "directory" | "in" | "doc" }>,
}));

vi.mock("@/core/config/firebase", () => ({ db: { __mockDb: true } }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  const snapshot = (rows: Array<{ id: string; data: any }>) => ({
    empty: rows.length === 0,
    size: rows.length,
    forEach: (cb: (doc: { id: string; data: () => any }) => void) =>
      rows.forEach((row) => cb({ id: row.id, data: () => row.data })),
  });
  return {
    ...actual,
    collection: (_db: unknown, name: string) => ({ __collection: name }),
    doc: (_db: unknown, name: string, id: string) => ({ __docRef: `${name}/${id}` }),
    query: (...args: unknown[]) => ({ __query: args }),
    where: (field: unknown, op: string, values: string[]) => ({ __where: { field, op, values } }),
    documentId: () => "__name__",
    limit: (n: number) => ({ __limit: n }),
    getDoc: async (ref: { __docRef: string }) => {
      const [collectionName, id] = ref.__docRef.split("/");
      firestore.calls.push({ collection: collectionName, kind: "doc" });
      const exists = ref.__docRef in firestore.docs;
      return { id, exists: () => exists, data: () => firestore.docs[ref.__docRef] };
    },
    getDocs: async (q: { __query?: any[] }) => {
      const args = q.__query ?? [];
      const collectionName: string = args[0]?.__collection ?? "unknown";
      const inClause = args.find((a: any) => a?.__where);
      if (inClause) {
        firestore.calls.push({ collection: collectionName, kind: "in" });
        const rows = (inClause.__where.values as string[])
          .filter((id) => id in firestore.adminIn)
          .map((id) => ({ id, data: firestore.adminIn[id] }));
        return snapshot(rows);
      }
      firestore.calls.push({ collection: collectionName, kind: "directory" });
      return snapshot(collectionName === "stores" ? firestore.directory : []);
    },
  };
});

/**
 * The SAME vectors are used by the server resolver suite. Instant strings are
 * UTC; 05:30Z is 11:00 IST, so a device set to UTC must not change the verdict.
 */
export const TEST_VECTORS = [
  {
    name: "before opening (10:45 IST)",
    now: "2026-11-26T05:15:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "11:00 AM", close: "11:00 PM" } } },
    expected: { isOpen: false, source: "store", openLabel: "11:00 AM", closedByStaff: false },
  },
  {
    name: "at opening (11:00 IST)",
    now: "2026-11-26T05:30:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "11:00", close: "23:00" } } },
    expected: { isOpen: true, source: "store", openLabel: "11:00 AM", closedByStaff: false },
  },
  {
    name: "one minute before closing (22:59 IST)",
    now: "2026-11-26T17:29:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "11:00 AM", close: "11:00 PM" } } },
    expected: { isOpen: true, source: "store", openLabel: "11:00 AM", closedByStaff: false },
  },
  {
    name: "at the closing boundary (23:00 IST)",
    now: "2026-11-26T17:30:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "11:00 AM", close: "11:00 PM" } } },
    expected: { isOpen: false, source: "store", openLabel: "11:00 AM", closedByStaff: false },
  },
  {
    name: "single-digit 24h hour is accepted (08:05 IST)",
    now: "2026-11-26T02:35:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "8:00", close: "23:00" } } },
    expected: { isOpen: true, source: "store", openLabel: "08:00 AM", closedByStaff: false },
  },
  {
    name: "overnight opening boundary (18:00 IST)",
    now: "2026-11-26T12:30:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "18:00", close: "02:00" } } },
    expected: { isOpen: true, source: "store", openLabel: "06:00 PM", closedByStaff: false },
  },
  {
    name: "overnight close boundary (02:00 IST)",
    now: "2026-11-26T20:30:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "18:00", close: "02:00" } } },
    expected: { isOpen: false, source: "store", openLabel: "06:00 PM", closedByStaff: false },
  },
  {
    name: "overnight window before midnight (18:30 IST)",
    now: "2026-11-26T13:00:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "18:00", close: "02:00" } } },
    expected: { isOpen: true, source: "store", openLabel: "06:00 PM", closedByStaff: false },
  },
  {
    name: "overnight window after midnight (01:30 IST)",
    now: "2026-11-26T20:00:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "18:00", close: "02:00" } } },
    expected: { isOpen: true, source: "store", openLabel: "06:00 PM", closedByStaff: false },
  },
  {
    name: "overnight window in the closed gap (16:00 IST)",
    now: "2026-11-26T10:30:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "18:00", close: "02:00" } } },
    expected: { isOpen: false, source: "store", openLabel: "06:00 PM", closedByStaff: false },
  },
  {
    name: "missing hours use the documented default",
    now: "2026-11-26T04:35:00.000Z",
    docs: { store: { isOpen: true } },
    expected: { isOpen: false, source: "default", openLabel: "11:00 AM", closedByStaff: false },
  },
  {
    name: "malformed hours use the documented default",
    now: "2026-11-26T05:30:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "noon-ish", close: "23:00" } } },
    expected: { isOpen: false, source: "default", openLabel: "11:00 AM", closedByStaff: false },
  },
  {
    name: "equal open and close is malformed and fails closed (11:30 IST)",
    now: "2026-11-26T06:00:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "11:00", close: "11:00" } } },
    expected: { isOpen: false, source: "default", openLabel: "11:00 AM", closedByStaff: false },
  },
  {
    name: "malformed store hours fall through to admin_stores",
    now: "2026-11-26T04:35:00.000Z",
    docs: {
      store: { isOpen: true, hours: { open: "noon-ish", close: "23:00" } },
      adminStore: { hours: { open: "08:00 AM", close: "11:00 PM" } },
    },
    expected: { isOpen: true, source: "admin_store", openLabel: "08:00 AM", closedByStaff: false },
  },
  {
    name: "staff override beats configured hours",
    now: "2026-11-26T05:35:00.000Z",
    docs: {
      store: {
        isOpen: true,
        storeStatusOverride: true,
        hours: { open: "08:00 AM", close: "11:00 PM" },
      },
    },
    expected: { isOpen: false, source: "staff", openLabel: "08:00 AM", closedByStaff: true },
  },
  {
    name: "isOpen false beats configured hours",
    now: "2026-11-26T05:35:00.000Z",
    docs: { store: { isOpen: false, hours: { open: "08:00 AM", close: "11:00 PM" } } },
    expected: { isOpen: false, source: "staff", openLabel: "08:00 AM", closedByStaff: true },
  },
  {
    name: "branch staff override beats configured hours",
    now: "2026-11-26T05:35:00.000Z",
    docs: {
      store: { isOpen: true, hours: { open: "08:00 AM", close: "11:00 PM" } },
      branch: { storeStatusOverride: true },
    },
    expected: { isOpen: false, source: "staff", openLabel: "08:00 AM", closedByStaff: true },
  },
  {
    name: "admin_stores hours are used when stores has none",
    now: "2026-11-26T04:35:00.000Z",
    docs: {
      store: { isOpen: true },
      adminStore: { hours: { open: "08:00 AM", close: "11:00 PM" } },
    },
    expected: { isOpen: true, source: "admin_store", openLabel: "08:00 AM", closedByStaff: false },
  },
  {
    name: "branch operatingHours are the last configured source",
    now: "2026-11-26T04:35:00.000Z",
    docs: {
      store: { isOpen: true },
      branch: { operatingHours: { open: "08:00", close: "23:00" } },
    },
    expected: { isOpen: true, source: "branch", openLabel: "08:00 AM", closedByStaff: false },
  },
  {
    name: "device timezone does not move the IST window",
    now: "2026-11-26T05:30:00.000Z",
    docs: { store: { isOpen: true, hours: { open: "11:00 AM", close: "11:00 PM" } } },
    expected: { isOpen: true, source: "store", openLabel: "11:00 AM", closedByStaff: false },
  },
] as const;

const active = vi.hoisted(() => ({ store: null as any }));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (selector: (s: any) => any) => selector({ activeStore: active.store }),
}));

function Probe() {
  const state = useKitchenHours();
  return (
    <div data-testid="gate">
      {JSON.stringify({
        isOpen: state.isOpen,
        source: state.source,
        openLabel: state.openLabel,
        closeLabel: state.closeLabel,
        closedByStaff: state.closedByStaff,
        hoursInvalid: state.hoursInvalid,
        minutesNow: state.minutesNow,
      })}
    </div>
  );
}

let host: HTMLDivElement;
// Definite assignment: beforeEach always sets it on the happy path; afterEach
// still guards the RED failure path where beforeEach aborted early.
let root!: Root;

beforeEach(() => {
  resetDefaultHoursWarningForTests();
  active.store = null;
  firestore.docs = {};
  firestore.directory = [];
  firestore.adminIn = {};
  firestore.calls = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ["Date"] });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  // A RED beforeEach failure can leave `root` undefined; cleanup must not mask
  // the original assertion with a second, unrelated TypeError.
  if (root) await act(async () => root!.unmount());
  host?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("outlet-hours resolver (shared vectors)", () => {
  it.each(TEST_VECTORS)("$name", (vector) => {
    const state = resolveOutletOpenState({ ...vector.docs, now: new Date(vector.now) });
    expect(state.isOpen).toBe(vector.expected.isOpen);
    expect(state.source).toBe(vector.expected.source);
    expect(state.openLabel).toBe(vector.expected.openLabel);
    expect(state.closedByStaff).toBe(vector.expected.closedByStaff);
  });

  it("logs a missing/malformed fallback once and never throws", () => {
    const warn = vi.spyOn(console, "warn");
    resolveOutletOpenState({ now: new Date("2026-11-26T04:35:00.000Z") });
    resolveOutletOpenState({ store: { hours: { open: "??", close: "23:00" } } });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("IST clock is independent of the device timezone", () => {
  it("reads 11:00 IST from an instant whose UTC clock says 05:30", () => {
    const instant = new Date("2026-11-26T05:30:00.000Z");
    expect(instant.getUTCHours() * 60 + instant.getUTCMinutes()).toBe(5 * 60 + 30);
    expect(istMinutesSinceMidnight(instant)).toBe(11 * 60);
  });

  it("a device reporting UTC clock hours still gets the IST verdict", () => {
    // Simulate a handset whose local clock reads 05:30 for this instant. The
    // resolver must not consult the device clock at all.
    const hoursSpy = vi.spyOn(Date.prototype, "getHours").mockReturnValue(5);
    const minutesSpy = vi.spyOn(Date.prototype, "getMinutes").mockReturnValue(30);
    try {
      const state = resolveOutletOpenState({
        store: { hours: { open: "11:00 AM", close: "11:00 PM" } },
        now: new Date("2026-11-26T05:30:00.000Z"),
      });
      expect(state.minutesNow).toBe(11 * 60);
      expect(state.isOpen).toBe(true);
    } finally {
      hoursSpy.mockRestore();
      minutesSpy.mockRestore();
    }
  });
});

describe("window boundaries and source precedence", () => {
  it("treats the window as [open, close)", () => {
    const store = { hours: { open: "11:00", close: "23:00" } };
    const at = (iso: string) => resolveOutletOpenState({ store, now: new Date(iso) });
    expect(at("2026-11-26T05:29:00.000Z").isOpen).toBe(false); // 10:59 IST
    expect(at("2026-11-26T05:30:00.000Z").isOpen).toBe(true); // 11:00 IST
    expect(at("2026-11-26T17:29:00.000Z").isOpen).toBe(true); // 22:59 IST
    expect(at("2026-11-26T17:30:00.000Z").isOpen).toBe(false); // 23:00 IST
  });

  it("resolves store hours before admin-store before branch before the default", () => {
    const now = new Date("2026-11-26T02:35:00.000Z"); // 08:05 IST
    const store = { hours: { open: "08:00", close: "23:00" } };
    const adminStore = { hours: { open: "09:00", close: "23:00" } };
    const branch = { operatingHours: { open: "10:00", close: "23:00" } };

    const fromStore = resolveOutletOpenState({ store, adminStore, branch, now });
    expect(fromStore.source).toBe("store");
    expect(fromStore.openLabel).toBe("08:00 AM");
    expect(fromStore.isOpen).toBe(true);

    const fromAdmin = resolveOutletOpenState({ adminStore, branch, now });
    expect(fromAdmin.source).toBe("admin_store");
    expect(fromAdmin.openLabel).toBe("09:00 AM");

    const fromBranch = resolveOutletOpenState({ branch, now });
    expect(fromBranch.source).toBe("branch");
    expect(fromBranch.openLabel).toBe("10:00 AM");

    const fromDefault = resolveOutletOpenState({ now });
    expect(fromDefault.source).toBe("default");
    expect(fromDefault.openLabel).toBe("11:00 AM");
    expect(fromDefault.closeLabel).toBe("11:00 PM");
  });

  it("a staff close wins over configured hours and never promises a reopening time", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: false, hours: { open: "08:00 AM", close: "11:00 PM" } },
      now: new Date("2026-11-26T05:35:00.000Z"), // 11:05 IST — inside the window
    });
    expect(state.isOpen).toBe(false);
    expect(state.closedByStaff).toBe(true);
    expect(state.source).toBe("staff");
    const message = kitchenClosedMessage(state);
    expect(message).toBe(KITCHEN_CLOSED_BY_STAFF_MESSAGE);
    expect(message).not.toContain("opens at");
  });

  it("malformed configured hours fail closed to the default and warn exactly once", () => {
    const warn = vi.spyOn(console, "warn");
    const now = new Date("2026-11-26T06:00:00.000Z"); // 11:30 IST — inside 11:00–23:00
    // A permissive fallback would open here; fail-closed must not.
    const first = resolveOutletOpenState({
      store: { hours: { open: "noon-ish", close: "23:00" } },
      now,
    });
    const second = resolveOutletOpenState({
      store: { hours: { open: "11:00", close: "oops" } },
      now,
    });
    expect(first.isOpen).toBe(false);
    expect(first.source).toBe("default");
    expect(second.isOpen).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("admin_stores hours parity (mapped store rows)", () => {
  it("a row mapped from the partner mirror keeps its hours and reports the real source", () => {
    const store = mapStoreDoc(
      { lat: 21.2, lng: 72.8, hours: { open: "08:00", close: "23:00" } },
      "mirror_only",
      "admin_store",
    );
    expect(store).not.toBeNull();
    expect(store!.hours).toEqual({ open: "08:00", close: "23:00" });
    expect(store!.hoursSource).toBe("admin_store");

    const documents = outletHoursDocuments(store);
    // The mirror's hours are offered as `adminStore`, never as storefront hours.
    expect(documents.store).toEqual({ isOpen: undefined, storeStatusOverride: false });
    expect(documents.adminStore).toEqual({ hours: { open: "08:00", close: "23:00" } });

    const state = resolveOutletOpenState({
      ...documents,
      now: new Date("2026-11-26T04:35:00.000Z"), // 10:05 IST
    });
    expect(state.isOpen).toBe(true);
    expect(state.source).toBe("admin_store");
    expect(state.openLabel).toBe("08:00 AM");
  });

  it("maps the staff-close flag so a partially written doc cannot reopen the outlet", () => {
    const store = mapStoreDoc(
      {
        lat: 21.2,
        lng: 72.8,
        isOpen: true,
        storeStatusOverride: true,
        hours: { open: "08:00", close: "23:00" },
      },
      "staff_closed",
    );
    expect(store!.storeStatusOverride).toBe(true);
    const documents = outletHoursDocuments(store);
    expect(documents.store).toMatchObject({ isOpen: true, storeStatusOverride: true });

    const state = resolveOutletOpenState({
      ...documents,
      now: new Date("2026-11-26T04:35:00.000Z"), // 10:05 IST, inside 08:00–23:00
    });
    expect(state.isOpen).toBe(false);
    expect(state.closedByStaff).toBe(true);
    expect(state.source).toBe("staff");
  });

  it("byId attaches mirror hours once when the storefront doc has none", async () => {
    firestore.docs["stores/demo"] = { lat: 21.2, lng: 72.8, name: "Demo", isOpen: true };
    firestore.docs["admin_stores/demo"] = {
      hours: { open: "08:00 AM", close: "11:00 PM" },
    };

    const result = await storesService.byId("demo");
    expect(result.success).toBe(true);
    const store = result.success ? result.data : null;
    expect(store).not.toBeNull();
    expect(store!.hours).toBeNull();
    expect(store!.hoursSource).toBe("store");
    expect(store!.adminStoreHours).toEqual({ open: "08:00 AM", close: "11:00 PM" });
    // Exactly the two point reads: storefront, then the mirror for the gap.
    expect(firestore.calls).toEqual([
      { collection: "stores", kind: "doc" },
      { collection: "admin_stores", kind: "doc" },
    ]);

    vi.setSystemTime(new Date("2026-11-26T04:35:00.000Z")); // 10:05 IST
    active.store = store;
    await act(async () =>
      root.render(
        <>
          <Probe />
          <KitchenClosedBanner />
        </>,
      ),
    );
    expect(JSON.parse(host.querySelector('[data-testid="gate"]')!.textContent!)).toMatchObject({
      isOpen: true,
      source: "admin_store",
      openLabel: "08:00 AM",
      closedByStaff: false,
    });
    expect(host.textContent).not.toContain("We are currently closed");
  });

  it("byId does not read the mirror when the storefront doc already has hours", async () => {
    firestore.docs["stores/demo"] = {
      lat: 21.2,
      lng: 72.8,
      hours: { open: "08:00", close: "23:00" },
    };
    const result = await storesService.byId("demo");
    expect(result.success).toBe(true);
    expect(result.success ? result.data?.hours : null).toEqual({ open: "08:00", close: "23:00" });
    expect(firestore.calls).toEqual([{ collection: "stores", kind: "doc" }]);
  });

  it(
    "the directory backfills mirror hours with one bounded query, and none when unnecessary",
    async () => {
      firestore.directory = [
        {
          id: "with_hours",
          data: { lat: 21.2, lng: 72.8, hours: { open: "08:00", close: "23:00" } },
        },
        { id: "without_hours", data: { lat: 21.3, lng: 72.9 } },
      ];
      firestore.adminIn = { without_hours: { hours: { open: "09:00", close: "22:00" } } };

      const first = await storesService.list();
      expect(first.success).toBe(true);
      if (!first.success) return;
      const rows = first.data;
      const withHours = rows.find((store) => store.id === "with_hours")!;
      const withoutHours = rows.find((store) => store.id === "without_hours")!;
      expect(withHours.adminStoreHours).toBeUndefined();
      expect(withoutHours.hours).toBeNull();
      expect(withoutHours.adminStoreHours).toEqual({ open: "09:00", close: "22:00" });
      expect(firestore.calls.filter((call) => call.kind === "in")).toHaveLength(1);
      // The directory itself is still one bounded `stores` read.
      expect(firestore.calls.filter((call) => call.kind === "directory")).toEqual([
        { collection: "stores", kind: "directory" },
      ]);

      // Second directory: every row carries hours → no mirror query at all.
      firestore.calls = [];
      firestore.directory = [
        {
          id: "with_hours",
          data: { lat: 21.2, lng: 72.8, hours: { open: "08:00", close: "23:00" } },
        },
      ];
      await storesService.list();
      expect(firestore.calls.filter((call) => call.kind === "in")).toHaveLength(0);
    },
  );

  it("an absent mirror document leaves the row without invented hours", async () => {
    firestore.docs["stores/demo"] = { lat: 21.2, lng: 72.8, name: "Demo" };
    // No admin document at all: the read succeeds and finds nothing.
    const result = await storesService.byId("demo");
    expect(result.success).toBe(true);
    const store = result.success ? result.data : null;
    expect(store!.hours).toBeNull();
    expect(store!.adminStoreHours).toBeNull();
    const state = resolveOutletOpenState({
      ...outletHoursDocuments(store),
      now: new Date("2026-11-26T04:35:00.000Z"), // 10:05 IST
    });
    expect(state.source).toBe("default");
    // 10:05 IST is outside the documented 11:00–23:00 window.
    expect(state.isOpen).toBe(false);
    expect(state.openLabel).toBe("11:00 AM");
  });
});

describe("customer ordering gate", () => {
  it("uses the active outlet's own 08:00 hours even in a UTC device", async () => {
    vi.setSystemTime(new Date("2026-11-26T04:35:00.000Z")); // 10:05 IST
    active.store = { id: "demo", isOpen: true, hours: { open: "08:00 AM", close: "11:00 PM" } };
    await act(async () =>
      root.render(
        <>
          <Probe />
          <KitchenClosedBanner />
        </>,
      ),
    );
    expect(JSON.parse(host.querySelector('[data-testid="gate"]')!.textContent!)).toMatchObject({
      isOpen: true,
      source: "store",
      openLabel: "08:00 AM",
    });
    expect(host.textContent).not.toContain("We are currently closed");
  });

  it("uses the mapped admin hours when the selected row has none of its own", async () => {
    vi.setSystemTime(new Date("2026-11-26T04:35:00.000Z")); // 10:05 IST
    active.store = {
      id: "demo",
      isOpen: true,
      hours: null,
      hoursSource: "store",
      adminStoreHours: { open: "08:00 AM", close: "11:00 PM" },
    };
    await act(async () => root.render(<Probe />));
    expect(JSON.parse(host.querySelector('[data-testid="gate"]')!.textContent!)).toMatchObject({
      isOpen: true,
      source: "admin_store",
      openLabel: "08:00 AM",
    });
  });

  it("shows opens at 11:00 AM from the documented default when hours are missing", async () => {
    vi.setSystemTime(new Date("2026-11-26T04:35:00.000Z")); // 10:05 IST
    active.store = { id: "demo", isOpen: true, hours: null };
    await act(async () =>
      root.render(
        <>
          <Probe />
          <KitchenClosedBanner />
        </>,
      ),
    );
    expect(host.textContent).toContain("opens at 11:00 AM");
  });

  it("never lets configured hours reopen a staff-closed outlet", async () => {
    vi.setSystemTime(new Date("2026-11-26T05:35:00.000Z")); // 11:05 IST
    active.store = {
      id: "demo",
      isOpen: true,
      storeStatusOverride: true,
      hours: { open: "08:00 AM", close: "11:00 PM" },
    };
    await act(async () =>
      root.render(
        <>
          <Probe />
          <KitchenClosedBanner />
        </>,
      ),
    );
    expect(JSON.parse(host.querySelector('[data-testid="gate"]')!.textContent!)).toMatchObject({
      isOpen: false,
      closedByStaff: true,
    });
    expect(host.textContent).toContain("closed by staff");
    expect(host.textContent).not.toContain("opens at 08:00 AM");
  });

  it("never promises a reopening time when the outlet's own hours are unreadable", async () => {
    vi.setSystemTime(new Date("2026-11-26T05:35:00.000Z")); // 11:05 IST
    // Configured but unparseable ("A.M." with dots). The gate fails closed and
    // must not advertise the documented 11:00 AM default as this outlet's
    // schedule - neither in the headline nor in the banner's second line.
    active.store = {
      id: "demo",
      isOpen: true,
      hours: { open: "11:00 A.M.", close: "11:00 P.M." },
    };
    await act(async () =>
      root.render(
        <>
          <Probe />
          <KitchenClosedBanner />
        </>,
      ),
    );
    expect(JSON.parse(host.querySelector('[data-testid="gate"]')!.textContent!)).toMatchObject({
      isOpen: false,
      closedByStaff: false,
      hoursInvalid: true,
    });
    expect(host.textContent).toContain("call the outlet");
    expect(host.textContent).not.toMatch(/opens at/i);
  });
});
