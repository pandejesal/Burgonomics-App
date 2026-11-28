/**
 * The hours-format boundary.
 *
 * Measured on the live staging data on 28 Nov 2026:
 *
 *   branches/*.operatingHours   25 of 25  "11:00 AM" / "11:30 PM"   (12-hour)
 *   stores/demo.hours                      "08:00 AM" / "11:00 PM"   (12-hour)
 *   stores/str_003.hours                   "11:00"    / "23:30"      (24-hour)
 *
 * Both formats are legitimate: the resolver in `operatingHours.ts` parses
 * either. Two storefront components interpolated the RAW stored string, so the
 * store list showed "closes at 11:00 PM" on one card and "closes at 23:30" on
 * the next. `closesSoon` split on ":" only, so every 12-hour value produced
 * `NaN` and "closing soon" never fired for 26 of the 27 documents that carry
 * hours.
 *
 * This file pins the normalisation in both directions so a future edit cannot
 * reintroduce a format-sensitive display path.
 */
import { describe, expect, it } from "vitest";

import {
  formatStoredHour,
  kitchenClosedMessage,
  parseHourMinute,
  resolveOutletOpenState,
} from "./operatingHours";
import { closesSoon } from "@/features/stores/utils/distance";

describe("parseHourMinute accepts both stored formats", () => {
  it.each([
    ["11:00", 660],
    ["23:30", 1410],
    ["00:00", 0],
    ["08:05", 485],
    ["11:00 AM", 660],
    ["8:00 AM", 480],
    ["11:30 PM", 1410],
    ["12:00 AM", 0],
    ["12:00 PM", 720],
    ["  09:15 pm  ", 1275],
  ])("%s -> %i minutes", (input, expected) => {
    expect(parseHourMinute(input)).toBe(expected);
  });

  it.each([["24:00"], ["11:60"], ["13:00 PM"], ["11:00 XM"], [""], [null], [undefined], [123]])(
    "rejects %s",
    (input) => {
      expect(parseHourMinute(input)).toBeNull();
    },
  );

  it("accepts a bare hour, which the resolver has always allowed", () => {
    // Not an oversight: `^\s*(\d{1,2})(?::(\d{2}))?` makes the minutes group
    // optional, and the migration path relies on that leniency.
    expect(parseHourMinute("11")).toBe(660);
    expect(parseHourMinute("0")).toBe(0);
  });
});

describe("formatStoredHour prints one format for the customer", () => {
  it.each([
    ["23:30", "11:30 PM"],
    ["11:00", "11:00 AM"],
    ["08:00 AM", "08:00 AM"],
    ["11:30 PM", "11:30 PM"],
    ["08:00", "08:00 AM"],
    ["00:00", "12:00 AM"],
    ["12:00", "12:00 PM"],
  ])("%s -> %s", (input, expected) => {
    expect(formatStoredHour(input)).toBe(expected);
  });

  it("never blanks out a value it cannot parse", () => {
    // A display helper must degrade to what was stored, not to "undefined".
    expect(formatStoredHour("whenever we feel like it")).toBe("whenever we feel like it");
    expect(formatStoredHour(null)).toBe("");
    expect(formatStoredHour(undefined)).toBe("");
  });

  it("proves the exact defect that was visible on the live site", () => {
    // These are the two real strings the store list rendered side by side.
    expect(formatStoredHour("23:30")).toBe(formatStoredHour("11:30 PM"));
  });
});

describe("closesSoon understands both formats and the outlet clock", () => {
  // `nowMinutes` is injected so this is deterministic in any timezone. The
  // previous version mocked the device clock while the close time was IST,
  // which is exactly the mismatch that made the badge fire at the wrong time.
  const at = (hour: number, minute = 0) => hour * 60 + minute;

  it("reports a 12-hour close time inside the warning window", () => {
    expect(closesSoon("11:30 PM", 60, at(23, 0))).toBe(true);
  });

  it("reports a 24-hour close time inside the warning window", () => {
    expect(closesSoon("23:30", 60, at(23, 0))).toBe(true);
  });

  it("agrees on both formats for a close time outside the window", () => {
    expect(closesSoon("11:30 PM", 60, at(12, 0))).toBe(false);
    expect(closesSoon("23:30", 60, at(12, 0))).toBe(false);
  });

  it("wraps across midnight instead of going negative", () => {
    // 00:20 against a 23:30 close is 50 minutes away, not -1390.
    expect(closesSoon("11:30 PM", 60, at(0, 20))).toBe(true);
  });

  it("returns false rather than NaN for unparseable input", () => {
    expect(closesSoon("later", 60, at(23, 0))).toBe(false);
    expect(closesSoon("", 60, at(23, 0))).toBe(false);
  });
});

describe("minutesUntilClose is a real duration", () => {
  const NOW = new Date("2026-11-28T17:00:00.000Z"); // 22:30 IST

  it("counts the minutes left in a same-day window", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: true, hours: { open: "11:00 AM", close: "11:00 PM" } },
      now: NOW,
    });
    expect(state.isOpen).toBe(true);
    // Was 1470 before the fix: the wrap formula was applied to a same-day close.
    expect(state.minutesUntilClose).toBe(30);
  });

  it("counts the minutes left in an overnight window", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: true, hours: { open: "06:00 PM", close: "02:00 AM" } },
      now: NOW, // 22:30 IST
    });
    expect(state.isOpen).toBe(true);
    expect(state.minutesUntilClose).toBe(210); // 22:30 -> 02:00
  });
});

describe("unreadable configured hours never promise a reopening time", () => {
  // 11:30 IST on a Saturday.
  const NOW = new Date("2026-11-28T06:00:00.000Z");

  it("closes the outlet, flags the schedule and stops naming a time", () => {
    const state = resolveOutletOpenState({
      store: { isOpen: true, hours: { open: "11:00 A.M.", close: "11:00 P.M." } },
      now: NOW,
    });
    expect(state.isOpen).toBe(false);
    expect(state.hoursInvalid).toBe(true);
    const message = kitchenClosedMessage(state);
    // The old copy said "Kitchen opens at 11:00 AM", which is the default
    // window, not this outlet's schedule.
    expect(message).not.toMatch(/opens at/i);
    expect(message).toContain("call the outlet");
  });

  it("keeps the ordinary message when the schedule parses", () => {
    const state = resolveOutletOpenState({
      store: { hours: { open: "11:00 AM", close: "11:00 PM" } },
      now: NOW,
    });
    expect(state.hoursInvalid).toBe(false);
    expect(kitchenClosedMessage(state)).toMatch(/opens at 11:00 AM/i);
  });
});