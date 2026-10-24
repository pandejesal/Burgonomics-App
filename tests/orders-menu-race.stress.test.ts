// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const listProducts = vi.hoisted(() => vi.fn());
vi.mock("../src/features/menu/repositories/MenuRepository", () => ({
  menuRepository: {
    listCategories: vi.fn(async () => ({ success: false, error: { message: "off" } } as any)),
    listProducts,
    subscribeCategories: vi.fn(() => () => undefined),
    subscribeProducts: vi.fn(() => () => undefined),
  },
}));

import { useOrdersStore } from "../src/features/orders/state/ordersStore";
import { useMenuStore } from "../src/features/menu/state/menuStore";
import type { Product } from "../src/features/menu/models";

const asAny = (v: any) => v as any;

const orderFixture = (id: string, code: string, terminal: boolean, updatedAt?: unknown) =>
  asAny({ id, status: { code, terminal }, ...(updatedAt !== undefined ? { updatedAt } : {}) });

const productFixture = (id: string, inStock: boolean, price = 250): Product =>
  ({
    id,
    name: id,
    description: "",
    price,
    inStock,
    customizable: false,
    tags: [],
    badges: [],
  }) as unknown as Product;

describe("stress sweep P1 repairs (customer app)", () => {
  describe("I — ordersStore stale snapshot regression guard", () => {
    beforeEach(() => {
      useOrdersStore.getState().clearAll();
    });

    it("RED: never overwrites a newer status with an older snapshot", () => {
      // Live listener delivered the newer stamp first.
      useOrdersStore
        .getState()
        .upsert(orderFixture("ord_1", "OUT_FOR_DELIVERY", false, "2026-10-24T12:05:00.000Z"));
      // A slower one-shot read (older stamp) lands afterwards.
      useOrdersStore
        .getState()
        .upsert(orderFixture("ord_1", "PREPARING", false, "2026-10-24T12:00:00.000Z"));

      expect(useOrdersStore.getState().byId["ord_1"].status.code).toBe("OUT_FOR_DELIVERY");
    });

    it("RED: a terminal record never regresses to a non-terminal one", () => {
      useOrdersStore
        .getState()
        .upsert(orderFixture("ord_t", "DELIVERED", true, "2026-10-24T12:10:00.000Z"));
      useOrdersStore
        .getState()
        .upsert(orderFixture("ord_t", "PREPARING", false, "2026-10-24T12:04:00.000Z"));

      expect(useOrdersStore.getState().byId["ord_t"].status.code).toBe("DELIVERED");
    });

    it("a genuinely newer snapshot still wins (no strand-the-update guard)", () => {
      useOrdersStore
        .getState()
        .upsert(orderFixture("ord_2", "PREPARING", false, "2026-10-24T12:00:00.000Z"));
      useOrdersStore
        .getState()
        .upsert(orderFixture("ord_2", "OUT_FOR_DELIVERY", false, "2026-10-24T12:05:00.000Z"));

      expect(useOrdersStore.getState().byId["ord_2"].status.code).toBe("OUT_FOR_DELIVERY");
    });

    it("absent stamps keep the incoming write (uncomparable → legacy behavior)", () => {
      useOrdersStore.getState().upsert(asAny({ id: "ord_3", status: { code: "PLACED", terminal: false } }));
      useOrdersStore.getState().upsert(asAny({ id: "ord_3", status: { code: "CONFIRMED", terminal: false } }));
      expect(useOrdersStore.getState().byId["ord_3"].status.code).toBe("CONFIRMED");
    });

    // Each supported updatedAt representation must rank by the epoch instant it
    // denotes (oracle: ISO-8601 / epoch (seconds|milliseconds) definitions and
    // Firestore Timestamp.toMillis()), in both arrival orders.
    const OLDER_MS = Date.parse("2026-10-24T12:00:00.000Z");
    const NEWER_MS = Date.parse("2026-10-24T12:05:00.000Z");

    const persistedStamp = (ms: number) => ({
      seconds: Math.floor(ms / 1000),
      nanoseconds: (ms % 1000) * 1_000_000,
    });

    const stampShapes: Record<string, (ms: number) => unknown> = {
      "ISO-8601 string": (ms) => new Date(ms).toISOString(),
      "epoch-milliseconds number": (ms) => ms,
      "epoch-seconds number": (ms) => ms / 1000,
      "Firestore Timestamp (toMillis)": (ms) => ({ ...persistedStamp(ms), toMillis: () => ms }),
      "persisted {seconds,nanoseconds}": persistedStamp,
    };

    for (const [shape, toStamp] of Object.entries(stampShapes)) {
      it(`ranks ${shape}: newer first, older arrival loses`, () => {
        useOrdersStore
          .getState()
          .upsert(orderFixture("ord_shape", "OUT_FOR_DELIVERY", false, toStamp(NEWER_MS)));
        useOrdersStore
          .getState()
          .upsert(orderFixture("ord_shape", "PREPARING", false, toStamp(OLDER_MS)));
        expect(useOrdersStore.getState().byId["ord_shape"].status.code).toBe("OUT_FOR_DELIVERY");
      });

      it(`ranks ${shape}: older first, newer arrival wins`, () => {
        useOrdersStore
          .getState()
          .upsert(orderFixture("ord_shape", "PREPARING", false, toStamp(OLDER_MS)));
        useOrdersStore
          .getState()
          .upsert(orderFixture("ord_shape", "OUT_FOR_DELIVERY", false, toStamp(NEWER_MS)));
        expect(useOrdersStore.getState().byId["ord_shape"].status.code).toBe("OUT_FOR_DELIVERY");
      });
    }

    it("cross-restore: an older persisted {seconds,nanoseconds} loses to newer epoch ms", () => {
      useOrdersStore.getState().upsert(orderFixture("ord_x", "OUT_FOR_DELIVERY", false, NEWER_MS));
      useOrdersStore
        .getState()
        .upsert(orderFixture("ord_x", "PREPARING", false, persistedStamp(OLDER_MS)));
      expect(useOrdersStore.getState().byId["ord_x"].status.code).toBe("OUT_FOR_DELIVERY");
    });

    it("cross-restore: an older epoch ms loses to a newer persisted {seconds,nanoseconds}", () => {
      useOrdersStore
        .getState()
        .upsert(orderFixture("ord_y", "OUT_FOR_DELIVERY", false, persistedStamp(NEWER_MS)));
      useOrdersStore.getState().upsert(orderFixture("ord_y", "PREPARING", false, OLDER_MS));
      expect(useOrdersStore.getState().byId["ord_y"].status.code).toBe("OUT_FOR_DELIVERY");
    });

    it("persisted {seconds,nanoseconds} is ranked within the same second by nanoseconds", () => {
      const seconds = Math.floor(OLDER_MS / 1000);
      useOrdersStore
        .getState()
        .upsert(
          orderFixture("ord_ns", "OUT_FOR_DELIVERY", false, { seconds, nanoseconds: 900_000_000 }),
        );
      useOrdersStore
        .getState()
        .upsert(
          orderFixture("ord_ns", "PREPARING", false, { seconds, nanoseconds: 100_000_000 }),
        );
      expect(useOrdersStore.getState().byId["ord_ns"].status.code).toBe("OUT_FOR_DELIVERY");
    });

    it("persisted {seconds,nanoseconds} in one second: the newer nanosecond stamp wins", () => {
      const seconds = Math.floor(OLDER_MS / 1000);
      useOrdersStore
        .getState()
        .upsert(
          orderFixture("ord_ns2", "PREPARING", false, { seconds, nanoseconds: 100_000_000 }),
        );
      useOrdersStore
        .getState()
        .upsert(
          orderFixture("ord_ns2", "OUT_FOR_DELIVERY", false, { seconds, nanoseconds: 900_000_000 }),
        );
      expect(useOrdersStore.getState().byId["ord_ns2"].status.code).toBe("OUT_FOR_DELIVERY");
    });

    // Conservative pin: an unrankable stamp disables the freshness guard, so the
    // incoming write is kept (never stranded) — exactly the legacy behavior.
    const unrankableStamps: Record<string, unknown> = {
      "null stamp": null,
      "object without a stamp field": {},
      "non-date string": "not-a-date",
      "NaN number": Number.NaN,
      "infinite number": Number.POSITIVE_INFINITY,
    };

    for (const [label, stamp] of Object.entries(unrankableStamps)) {
      it(`unrankable incoming stamp (${label}) keeps the incoming write`, () => {
        useOrdersStore
          .getState()
          .upsert(orderFixture("ord_u", "OUT_FOR_DELIVERY", false, "2026-10-24T12:05:00.000Z"));
        useOrdersStore.getState().upsert(orderFixture("ord_u", "PREPARING", false, stamp));
        expect(useOrdersStore.getState().byId["ord_u"].status.code).toBe("PREPARING");
      });
    }

    it("unrankable stored stamp keeps the incoming write", () => {
      useOrdersStore.getState().upsert(orderFixture("ord_u2", "PREPARING", false, "not-a-date"));
      useOrdersStore
        .getState()
        .upsert(orderFixture("ord_u2", "OUT_FOR_DELIVERY", false, "2026-10-24T12:00:00.000Z"));
      expect(useOrdersStore.getState().byId["ord_u2"].status.code).toBe("OUT_FOR_DELIVERY");
    });
  });

  describe("J — menuStore loadMore stale-bucket merge", () => {
    beforeEach(() => {
      listProducts.mockReset();
      useMenuStore.setState({
        buckets: {},
        categories: [],
        activeCategoryId: undefined,
        status: "ready",
      });
    });

    it("RED: preserves live 86ing synced while loadMore was in flight", async () => {
      // Bucket built by page 1 with truffle_burger initially IN STOCK.
      useMenuStore.setState(asAny({
        buckets: {
          cat_burgers: {
            items: [productFixture("truffle_burger", true)],
            page: 1,
            pageSize: 100,
            total: 125,
            hasMore: true,
            loading: false,
          },
        },
      }));

      // Page 2 is deferred: pause loadMore until after live sync is injected.
      let resolveListProducts!: (value: any) => void;
      const deferredPage2 = new Promise((resolve) => {
        resolveListProducts = resolve;
      });
      listProducts.mockImplementationOnce(() => deferredPage2);

      // Start loadMore pagination.
      const loadMorePromise = useMenuStore.getState().loadMore("cat_burgers");

      // Verify repository was invoked and promise is currently in flight.
      expect(listProducts).toHaveBeenCalledTimes(1);

      // While loadMore is in flight, live POS sync flips truffle_burger out of stock.
      useMenuStore.setState((s: any) => ({
        buckets: {
          ...s.buckets,
          cat_burgers: {
            ...s.buckets["cat_burgers"],
            items: s.buckets["cat_burgers"].items.map((it: any) =>
              it.id === "truffle_burger" ? { ...it, inStock: false } : it
            ),
          },
        },
      }));

      // Resolve page 2 with stale inStock: true for truffle_burger and a new item.
      resolveListProducts({
        success: true,
        data: {
          items: [productFixture("truffle_burger", true), productFixture("smash_burger", true)],
          page: 2,
          pageSize: 100,
          total: 125,
        },
      });

      await loadMorePromise;

      const bucket = useMenuStore.getState().buckets["cat_burgers"];
      expect(bucket.items).toHaveLength(2);
      expect(bucket.loading).toBe(false);
      const truffle = bucket.items.find((p: any) => p.id === "truffle_burger");
      // The live truth must survive the merge.
      expect(truffle?.inStock).toBe(false);
      const smash = bucket.items.find((p: any) => p.id === "smash_burger");
      expect(smash?.inStock).toBe(true);
      expect(bucket.items.filter((p: any) => p.id === "truffle_burger")).toHaveLength(1);
      expect(bucket.items.filter((p: any) => p.id === "smash_burger")).toHaveLength(1);
    });
  });
});
