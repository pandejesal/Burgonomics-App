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
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatStoredHour, parseHourMinute } from "./operatingHours";
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

describe("closesSoon understands 12-hour values", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Pins the wall clock. `closesSoon` reads `new Date()` and nothing else. */
  function at(hour: number, minute = 0): void {
    vi.useFakeTimers();
    const fixed = new Date();
    fixed.setHours(hour, minute, 0, 0);
    vi.setSystemTime(fixed);
  }

  it("reports a 12-hour close time inside the warning window", () => {
    at(23, 0);
    expect(closesSoon("11:30 PM", 60)).toBe(true);
  });

  it("reports a 24-hour close time inside the warning window", () => {
    at(23, 0);
    expect(closesSoon("23:30", 60)).toBe(true);
  });

  it("agrees on both formats for a close time outside the window", () => {
    at(12, 0);
    expect(closesSoon("11:30 PM", 60)).toBe(false);
    expect(closesSoon("23:30", 60)).toBe(false);
  });

  it("returns false rather than NaN for unparseable input", () => {
    expect(closesSoon("later", 60)).toBe(false);
    expect(closesSoon("", 60)).toBe(false);
  });
});
