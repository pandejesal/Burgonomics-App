/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KitchenHoursState } from "@/core/constants/operatingHours";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { sameKitchenHoursState, useKitchenHours } from "./useKitchenHours";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  hours: { open: "08:00", close: "22:00" } as { open: string; close: string } | null,
  hoursSource: "store" as "store" | "admin_store",
  isOpen: undefined as boolean | undefined,
  storeStatusOverride: false,
  renders: 0,
}));

vi.mock("@/features/stores/state/storeStore", () => ({
  // Deliberately hand back a brand-new object on every selector call with the
  // same values. That is the shape which used to keep the hook in an infinite
  // render -> new documents -> effect -> setState -> render loop.
  useStoreSelection: (select: (state: unknown) => unknown) => {
    return select({
      activeStore: {
        id: "store-B",
        hours: fixture.hours,
        hoursSource: fixture.hoursSource,
        isOpen: fixture.isOpen,
        storeStatusOverride: fixture.storeStatusOverride,
      },
    });
  },
}));

let root: Root;
let container: HTMLDivElement;
let latest: KitchenHoursState | null = null;

function Owner({ now }: { now: Date }) {
  fixture.renders += 1;
  latest = useKitchenHours(now);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  // 06:30 UTC == 12:00 IST, inside both windows used below.
  vi.setSystemTime(new Date("2026-11-28T06:30:00.000Z"));
  fixture.hours = { open: "08:00", close: "22:00" };
  fixture.hoursSource = "store";
  fixture.isOpen = undefined;
  fixture.storeStatusOverride = false;
  fixture.renders = 0;
  latest = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useKitchenHours stability", () => {
  it("settles when the store selector returns a fresh object on every call", async () => {
    const first = useStoreSelection((s: any) => s.activeStore);
    const second = useStoreSelection((s: any) => s.activeStore);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);

    const now = new Date();
    await act(async () => {
      root.render(<Owner now={now} />);
    });

    expect(latest).not.toBeNull();
    expect(fixture.renders).toBeLessThanOrEqual(5);

    // The 30s tick must not grow the tree either: the verdict is unchanged.
    await act(async () => {
      vi.advanceTimersByTime(30_000 * 4);
    });
    expect(fixture.renders).toBeLessThanOrEqual(9);
  });

  it("compares every KitchenHoursState field by value", () => {
    const base: KitchenHoursState = {
      isOpen: true,
      minutesNow: 720,
      minutesUntilOpen: 0,
      minutesUntilClose: 600,
      source: "store",
      openLabel: "08:00 AM",
      closeLabel: "10:00 PM",
      closedByStaff: false,
    };
    expect(sameKitchenHoursState(base, { ...base })).toBe(true);

    const singleFieldChanges: Array<Partial<KitchenHoursState>> = [
      { isOpen: !base.isOpen },
      { minutesNow: base.minutesNow + 1 },
      { minutesUntilOpen: base.minutesUntilOpen + 1 },
      { minutesUntilClose: base.minutesUntilClose + 1 },
      { source: "admin_store" },
      { openLabel: "09:00 AM" },
      { closeLabel: "11:00 PM" },
      { closedByStaff: !base.closedByStaff },
    ];
    for (const change of singleFieldChanges)
      expect(sameKitchenHoursState(base, { ...base, ...change }), JSON.stringify(change)).toBe(false);
  });

  it("publishes a new verdict when the store's hours actually change value", async () => {
    const now = new Date();
    await act(async () => {
      root.render(<Owner now={now} />);
    });
    expect(latest!.source).toBe("store");
    expect(latest!.openLabel).toBe("08:00 AM");
    expect(latest!.closeLabel).toBe("10:00 PM");

    // A real change to the hours document must still flow through: the same
    // hours row now comes from the partner mirror, with a different window.
    fixture.hours = { open: "09:00", close: "23:30" };
    fixture.hoursSource = "admin_store";
    await act(async () => {
      root.render(<Owner now={now} />);
    });
    expect(latest!.source).toBe("admin_store");
    expect(latest!.openLabel).toBe("09:00 AM");
    expect(latest!.closeLabel).toBe("11:30 PM");
    expect(latest!.isOpen).toBe(true);
  });
});
