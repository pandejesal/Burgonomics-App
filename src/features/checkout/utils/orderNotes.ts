/**
 * Order-note limits and persistence hygiene.
 *
 * The kitchen note is ONE order-level string. The ceiling is 240 UTF-16 code
 * units — the unit `String#length` reports and the unit every transport cuts
 * on, so a surrogate pair (most emoji) counts as two. A change that would
 * exceed the ceiling is REJECTED as a whole: the previous value stays, and
 * nothing is truncated behind the customer's back. A browser `maxLength`
 * would silently swallow a paste; this module is what the editor and the
 * store boundary both use instead.
 */

/** Hard ceiling for `checkout.orderNotes`, in UTF-16 code units. */
export const MAX_ORDER_NOTES_UNITS = 240;

/** UTF-16 code units, matching `String#length` and every transport cut. */
export function orderNotesUnits(value: string): number {
  return value.length;
}

export type OrderNotesEdit =
  { ok: true; value: string } | { ok: false; reason: "too_long"; value: string };

/**
 * Apply a proposed edit. Overflow rejects the WHOLE change (never a partial
 * or surrogate-half value) and returns the current value untouched.
 */
export function applyOrderNotesEdit(current: string, next: string): OrderNotesEdit {
  if (typeof next !== "string") return { ok: false, reason: "too_long", value: current };
  if (orderNotesUnits(next) > MAX_ORDER_NOTES_UNITS) {
    return { ok: false, reason: "too_long", value: current };
  }
  return { ok: true, value: next };
}

/**
 * Cut to a unit budget without splitting a surrogate pair. Only used by
 * explicit, user-triggered legacy review actions — never on live input.
 */
export function sliceAtCodePointBoundary(value: string, maxUnits: number): string {
  if (value.length <= maxUnits) return value;
  let cut = Math.max(0, maxUnits);
  const lastCode = value.charCodeAt(cut - 1);
  // High surrogate at the cut: drop it so the pair is not halved.
  if (cut > 0 && lastCode >= 0xd800 && lastCode <= 0xdbff) cut -= 1;
  return value.slice(0, cut);
}

export interface SanitizedOrderNotes {
  orderNotes: string;
  /** Oversized text inherited from an older build, awaiting explicit review. */
  legacyOrderNotes: string;
}

/**
 * Read persisted notes safely. An oversized persisted draft is NOT dropped or
 * cut: the full text moves to `legacyOrderNotes`, is surfaced in the cart and
 * checkout for explicit review, and blocks payment until the customer resolves
 * it. A silent slice here used to lose everything past the cap.
 */
export function sanitizePersistedOrderNotes(
  rawNotes: unknown,
  rawLegacy: unknown,
): SanitizedOrderNotes {
  const notes = typeof rawNotes === "string" ? rawNotes : "";
  const existingLegacy = typeof rawLegacy === "string" ? rawLegacy : "";

  const oversized = notes.length > MAX_ORDER_NOTES_UNITS ? notes : "";
  const inRange = oversized ? "" : notes;
  const legacyOrderNotes = [existingLegacy, oversized].filter(Boolean).join("\n");

  return { orderNotes: inRange, legacyOrderNotes };
}

export interface NoteBearingLine {
  name?: string;
  notes?: string;
}

/**
 * True while any note still needs explicit review before money can move:
 * an oversized inherited draft, or legacy per-item notes carried by the
 * current cart. Per-item notes are never deleted or passed through silently —
 * the cart offers move/remove, and this guard keeps PAY blocked until the
 * customer has made that choice.
 */
export function hasUnreviewedLegacyNotes(
  legacyOrderNotes: string,
  lines: readonly NoteBearingLine[],
): boolean {
  if (legacyOrderNotes.trim().length > 0) return true;
  return lines.some((line) => (line.notes ?? "").trim().length > 0);
}
