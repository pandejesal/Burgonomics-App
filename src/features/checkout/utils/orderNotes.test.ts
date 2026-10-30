import { describe, expect, it } from "vitest";
import {
  MAX_ORDER_NOTES_UNITS,
  applyOrderNotesEdit,
  hasUnreviewedLegacyNotes,
  orderNotesUnits,
  sanitizePersistedOrderNotes,
  sliceAtCodePointBoundary,
} from "./orderNotes";

const units = (value: string) => value.length;

describe("order note ceiling (240 UTF-16 units)", () => {
  it("accepts exactly 240 units and rejects 241 without truncating", () => {
    const atLimit = "a".repeat(MAX_ORDER_NOTES_UNITS);
    const overLimit = "a".repeat(MAX_ORDER_NOTES_UNITS + 1);

    expect(applyOrderNotesEdit("", atLimit)).toEqual({ ok: true, value: atLimit });

    const rejected = applyOrderNotesEdit("kept note", overLimit);
    expect(rejected.ok).toBe(false);
    expect(rejected.value).toBe("kept note");
  });

  it("counts an emoji as two units (no 300-unit or vendor-limit widening)", () => {
    const burger = "🍔";
    expect(orderNotesUnits(burger)).toBe(2);
    const pack = burger.repeat(120); // 240 units
    expect(pack.length).toBe(240);
    expect(applyOrderNotesEdit("", pack).ok).toBe(true);
    expect(applyOrderNotesEdit("prior", burger.repeat(121)).ok).toBe(false);
  });

  it("never returns half a surrogate pair when cutting", () => {
    const cut = sliceAtCodePointBoundary("🍔🍔", 3);
    expect(cut).toBe("🍔");
    // No lone high surrogate at the end (that would be half an emoji).
    const lastUnit = cut.charCodeAt(cut.length - 1);
    expect(lastUnit >= 0xd800 && lastUnit <= 0xdbff).toBe(false);
    expect(cut.length).toBe(2);
  });

  it("surfaces an oversized persisted draft instead of losing or truncating it", () => {
    const oversized = "x".repeat(MAX_ORDER_NOTES_UNITS + 60);
    const sanitized = sanitizePersistedOrderNotes(oversized, "");
    expect(sanitized.orderNotes).toBe("");
    expect(sanitized.legacyOrderNotes).toBe(oversized);
  });

  it("keeps an in-range persisted note and preserves an existing legacy draft", () => {
    const sanitized = sanitizePersistedOrderNotes("less spicy", "legacy text");
    expect(sanitized.orderNotes).toBe("less spicy");
    expect(sanitized.legacyOrderNotes).toBe("legacy text");
  });

  it("keeps a very long inherited draft losslessly (no silent 2000-unit cut)", () => {
    // 3,010 UTF-16 units, emoji included (each emoji is two units).
    const oversized = `${"x".repeat(3000)}🍔🍔🍔🍔🍔`;
    expect(oversized.length).toBeGreaterThan(2000);

    const sanitized = sanitizePersistedOrderNotes(oversized, "");
    expect(sanitized.orderNotes).toBe("");
    expect(sanitized.legacyOrderNotes).toBe(oversized);
    expect(sanitized.legacyOrderNotes.endsWith("🍔🍔🍔🍔🍔")).toBe(true);

    // An existing legacy draft is also appended without being cut.
    const merged = sanitizePersistedOrderNotes(oversized, "old draft");
    expect(merged.legacyOrderNotes).toBe(`old draft\n${oversized}`);
  });

  it("flags unreviewed legacy order text and legacy per-item notes", () => {
    expect(hasUnreviewedLegacyNotes("", [])).toBe(false);
    expect(hasUnreviewedLegacyNotes("   ", [{ notes: "  " }])).toBe(false);
    expect(hasUnreviewedLegacyNotes("saved draft", [])).toBe(true);
    expect(hasUnreviewedLegacyNotes("", [{ notes: "no onions" }])).toBe(true);
    expect(
      hasUnreviewedLegacyNotes("", [{ notes: undefined }, { notes: "extra spicy" }]),
    ).toBe(true);
  });

  it("does not split literal pipes — the note is opaque text", () => {
    const note = "leave at door | don't ring bell";
    expect(applyOrderNotesEdit("", note)).toEqual({ ok: true, value: note });
  });
});
