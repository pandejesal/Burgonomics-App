/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  KITCHEN_CLOSED_BY_STAFF_MESSAGE,
  istMinutesSinceMidnight,
  kitchenClosedMessage,
  resetDefaultHoursWarningForTests,
  resolveOutletOpenState,
} from "./operatingHours";

/**
 * INDEPENDENT BOUNDARY VERIFICATION - new file. Does not touch the product
 * source (operatingHours.ts) or its existing suite (operatingHours.test.tsx).
 *
 * Every verdict comes from the REAL resolver with an explicit `now` built from
 * a UTC ISO instant. IST = UTC+05:30, so 05:30Z is 11:00 IST.
 *
 * Only the pure resolver is exercised. The existing suite's hook store and
 * firestore stubs serve React/useKitchenHours probes; the three functions under
 * test have no dependency on those modules, so importing them would add setup
 * without adding coverage. We do mirror the jsdom environment directive and the
 * once-per-process warning-latch reset.
 */

beforeEach(() => {
  resetDefaultHoursWarningForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("A - [open, close) on a same-day 11:00-23:00 window", () => {
  const store = { isOpen: true, hours: { open: "11:00", close: "23:00" } };
  const cases: ReadonlyArray<readonly [string, boolean, string]> = [
    ["2026-11-26T05:29:00.000Z", false, "10:59 IST"],
    ["2026-11-26T05:30:00.000Z", true, "11:00 IST"],
    ["2026-11-26T17:29:00.000Z", true, "22:59 IST"],
    ["2026-11-26T17:30:00.000Z", false, "23:00 IST"],
    ["2026-11-26T17:31:00.000Z", false, "23:01 IST"],
  ];

  it.each(cases)("%s (%s) -> isOpen %s", (iso, expected, label) => {
    const observed = resolveOutletOpenState({ store, now: new Date(iso) }).isOpen;
    console.log("A " + iso + " " + label + ": expected=" + expected + " observed=" + observed);
    expect(observed).toBe(expected);
  });
});

describe("B - overnight 18:00-02:00 window", () => {
  const store = { isOpen: true, hours: { open: "18:00", close: "02:00" } };
  const cases: ReadonlyArray<readonly [string, boolean, string]> = [
    ["2026-11-26T12:29:00.000Z", false, "17:59 IST"],
    ["2026-11-26T12:30:00.000Z", true, "18:00 IST"],
    ["2026-11-26T19:30:00.000Z", true, "01:00 IST"],
    ["2026-11-26T20:29:00.000Z", true, "01:59 IST"],
    ["2026-11-26T20:30:00.000Z", false, "02:00 IST"],
    ["2026-11-26T21:30:00.000Z", false, "03:00 IST"],
  ];

  it.each(cases)("%s (%s) -> isOpen %s", (iso, expected, label) => {
    const observed = resolveOutletOpenState({ store, now: new Date(iso) }).isOpen;
    console.log("B " + iso + " " + label + ": expected=" + expected + " observed=" + observed);
    expect(observed).toBe(expected);
  });
});
describe("C - open === close is malformed", () => {
  it("11:00/11:00 resolves isOpen:false with source:default (not a 24-hour window)", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: true, hours: { open: "11:00", close: "11:00" } },
      now: new Date("2026-11-26T06:00:00.000Z"), // 11:30 IST, inside the fallback window
    });
    console.log("C observed " + JSON.stringify({
      isOpen: state.isOpen,
      source: state.source,
      openLabel: state.openLabel,
      closeLabel: state.closeLabel,
    }));
    expect(state.isOpen).toBe(false);
    expect(state.source).toBe("default");
  });
});

describe("D - staff close beats hours in every accepted form", () => {
  const now = new Date("2026-11-26T05:35:00.000Z"); // 11:05 IST - inside 08:00-23:00

  function assertStaffClose(state: ReturnType<typeof resolveOutletOpenState>, tag: string): void {
    const message = kitchenClosedMessage(state);
    console.log("D " + tag + " observed " + JSON.stringify({
      isOpen: state.isOpen,
      closedByStaff: state.closedByStaff,
      source: state.source,
      message,
    }));
    expect(state.isOpen).toBe(false);
    expect(state.closedByStaff).toBe(true);
    expect(state.source).toBe("staff");
    expect(message).not.toContain("opens at");
    expect(message).toBe(KITCHEN_CLOSED_BY_STAFF_MESSAGE);
  }

  it("store.storeStatusOverride === true", () => {
    const state = resolveOutletOpenState({
      store: {
        isOpen: true,
        storeStatusOverride: true,
        hours: { open: "08:00", close: "23:00" },
      },
      now,
    });
    assertStaffClose(state, "store.storeStatusOverride");
  });

  it("store.isOpen === false", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: false, hours: { open: "08:00", close: "23:00" } },
      now,
    });
    assertStaffClose(state, "store.isOpen:false");
  });

  it("branch.storeStatusOverride === true", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: true, hours: { open: "08:00", close: "23:00" } },
      branch: { storeStatusOverride: true },
      now,
    });
    assertStaffClose(state, "branch.storeStatusOverride");
  });
});

describe("E - source precedence", () => {
  // 11:05 IST is inside every one of these windows, so each source would open.
  const now = new Date("2026-11-26T05:35:00.000Z");
  const openHours = { open: "08:00", close: "23:00" };
  const store = { isOpen: true, hours: openHours };
  const adminStore = { hours: openHours };
  const branch = { operatingHours: openHours };
  const malformed = { open: "not-a-time", close: "23:00" };

  it("all four valid -> store wins", () => {
    const state = resolveOutletOpenState({ store, adminStore, branch, now });
    console.log("E all-valid observed " + JSON.stringify({
      source: state.source, isOpen: state.isOpen, openLabel: state.openLabel,
    }));
    expect(state.source).toBe("store");
    expect(state.openLabel).toBe("08:00 AM");
  });

  it("store malformed -> admin_store wins", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: true, hours: malformed },
      adminStore,
      branch,
      now,
    });
    console.log("E store-malformed observed " + JSON.stringify({
      source: state.source, isOpen: state.isOpen, openLabel: state.openLabel,
    }));
    expect(state.source).toBe("admin_store");
    expect(state.openLabel).toBe("08:00 AM");
  });

  it("store and admin_store malformed -> branch wins", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: true, hours: malformed },
      adminStore: { hours: malformed },
      branch,
      now,
    });
    console.log("E store+admin-malformed observed " + JSON.stringify({
      source: state.source, isOpen: state.isOpen, openLabel: state.openLabel,
    }));
    expect(state.source).toBe("branch");
    expect(state.openLabel).toBe("08:00 AM");
  });

  it("all sources absent -> default", () => {
    const state = resolveOutletOpenState({ now });
    console.log("E none observed " + JSON.stringify({
      source: state.source, isOpen: state.isOpen, openLabel: state.openLabel,
    }));
    expect(state.source).toBe("default");
    expect(state.openLabel).toBe("11:00 AM");
  });
});
describe("F - istMinutesSinceMidnight is timezone-independent", () => {
  it("05:30Z is 660 minutes past midnight IST", () => {
    const observed = istMinutesSinceMidnight(new Date("2026-11-26T05:30:00.000Z"));
    console.log("F direct observed=" + observed + " expected=660");
    expect(observed).toBe(660);
  });

  it("does not consult the device clock even when getHours is deliberately wrong", () => {
    const hoursSpy = vi.spyOn(Date.prototype, "getHours").mockReturnValue(23);
    const minutesSpy = vi.spyOn(Date.prototype, "getMinutes").mockReturnValue(59);
    try {
      const observed = istMinutesSinceMidnight(new Date("2026-11-26T05:30:00.000Z"));
      console.log("F getHours-spy observed=" + observed + " expected=660 (getHours forced to 23)");
      expect(observed).toBe(660);
    } finally {
      hoursSpy.mockRestore();
      minutesSpy.mockRestore();
    }
  });
});

describe("G - mixed 24-hour and 12-hour formats", () => {
  it("08:00 / 11:00 PM parses to openLabel 08:00 AM and closeLabel 11:00 PM", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: true, hours: { open: "08:00", close: "11:00 PM" } },
      now: new Date("2026-11-26T05:35:00.000Z"), // 11:05 IST - inside the window
    });
    console.log("G observed " + JSON.stringify({
      openLabel: state.openLabel, closeLabel: state.closeLabel, isOpen: state.isOpen,
    }));
    expect(state.openLabel).toBe("08:00 AM");
    expect(state.closeLabel).toBe("11:00 PM");
    expect(state.isOpen).toBe(true);
  });
});

describe("Documented default window - locked facts", () => {
  it("no hours at 04:35Z (10:05 IST) is closed with openLabel 11:00 AM", () => {
    const state = resolveOutletOpenState({ now: new Date("2026-11-26T04:35:00.000Z") });
    console.log("default-closed observed " + JSON.stringify({
      isOpen: state.isOpen, source: state.source, openLabel: state.openLabel,
    }));
    expect(state.isOpen).toBe(false);
    expect(state.openLabel).toBe("11:00 AM");
  });

  it("no hours at 06:00Z (11:30 IST) is OPEN on the 11:00-23:00 fallback", () => {
    // NOTE: an independent reviewer flagged this fallback as failing OPEN - a
    // missing/malformed hours document still allows ordering during 11:00-23:00.
    // This assertion documents TODAY'S shipped behaviour; it is NOT an
    // endorsement of that design. If the resolver is later hardened to fail
    // closed, this test is the intended tripwire that must be updated with the
    // new decision, not silently deleted.
    const state = resolveOutletOpenState({ now: new Date("2026-11-26T06:00:00.000Z") });
    console.log("default-open observed " + JSON.stringify({
      isOpen: state.isOpen, source: state.source, openLabel: state.openLabel,
    }));
    expect(state.isOpen).toBe(true);
    expect(state.source).toBe("default");
    expect(state.openLabel).toBe("11:00 AM");
  });
});