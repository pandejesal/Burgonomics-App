import * as React from "react";
import { ChevronDown, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { cartRepository, useCartStore } from "@/features/cart";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import {
  MAX_ORDER_NOTES_UNITS,
  applyOrderNotesEdit,
  orderNotesUnits,
  sliceAtCodePointBoundary,
} from "@/features/checkout/utils/orderNotes";

/**
 * The ONE kitchen-note editor in the customer app.
 *
 * Order notes live on the persisted checkout store (`checkout.orderNotes`) —
 * the same value order creation reads. Per-line note editors and the
 * instruction-chip writer were removed: they wrote a second, silently
 * diverging channel. Legacy per-line notes and an oversized legacy draft are
 * still shown here for explicit review; nothing is moved, merged, split or
 * dropped without a tap.
 *
 * Moving/removing a legacy line note is a client-boundary transaction:
 *   - one synchronous module-level fence for every editor instance, so a double
 *     tap cannot run two writers;
 *   - the target draft (scope + revision + exact text) is captured BEFORE the
 *     async call and re-checked before writing, so a newer draft is never
 *     overwritten;
 *   - the item note is only cleared after the order note definitely contains
 *     it, the API result is inspected, and a failed/mismatched clear rolls the
 *     draft back so the instruction stays reviewable exactly once;
 *   - user text is never trimmed, merged or silently replaced.
 */

// Shared across instances: only one line-note write may be in flight.
let lineNoteWriteInFlight = false;

interface NotesScopeSnapshot {
  uid: string | null;
  storeId: string | null;
}

interface CapturedDraft {
  orderNotes: string;
  revision: number;
  scope: NotesScopeSnapshot | null;
}

function sameScope(left: NotesScopeSnapshot | null, right: NotesScopeSnapshot | null): boolean {
  if (left === null || right === null) return left === right;
  return left.uid === right.uid && left.storeId === right.storeId;
}

function findLine(lineId: string) {
  return useCartStore.getState().lines.find((line) => line.lineId === lineId);
}

export function CookingInstructionsSection() {
  const orderNotes = useCheckoutStore((s) => s.orderNotes);
  const legacyOrderNotes = useCheckoutStore((s) => s.legacyOrderNotes);
  const setOrderNotes = useCheckoutStore((s) => s.setOrderNotes);
  const resolveLegacyOrderNotes = useCheckoutStore((s) => s.resolveLegacyOrderNotes);

  const lines = useCartStore((s) => s.lines);
  const [open, setOpen] = React.useState(
    () => orderNotes.trim().length > 0 || legacyOrderNotes.length > 0,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [lineNoteError, setLineNoteError] = React.useState<string | null>(null);
  const [busyLineId, setBusyLineId] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const linesWithNotes = lines.filter((line) => (line.notes ?? "").trim().length > 0);
  const units = orderNotesUnits(orderNotes);
  const busy = busyLineId !== null;

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    const applied = applyOrderNotesEdit(orderNotes, next);
    if (!applied.ok) {
      // Reject the WHOLE change: restore the accepted value in the DOM (React
      // does not re-render when state is unchanged) and leave the clipboard
      // untouched so the customer can shorten and paste again.
      event.target.value = orderNotes;
      setError(
        `Notes can be up to ${MAX_ORDER_NOTES_UNITS} characters. That change was not applied — nothing was cut, and your clipboard is unchanged.`,
      );
      return;
    }
    if (!setOrderNotes(applied.value)) {
      event.target.value = orderNotes;
      setError(`Notes can be up to ${MAX_ORDER_NOTES_UNITS} characters.`);
      return;
    }
    setError(null);
  };

  /** Undo our own draft write, but never a newer draft written meanwhile. */
  const rollbackDraft = (
    captured: CapturedDraft,
    written: string,
    writtenRevision: number | null,
  ) => {
    const current = useCheckoutStore.getState();
    if (
      writtenRevision === null ||
      current.notesRevision !== writtenRevision ||
      current.orderNotes !== written
    ) {
      return false;
    }
    useCheckoutStore.setState({
      orderNotes: captured.orderNotes,
      notesRevision: current.notesRevision + 1,
    });
    return true;
  };

  const moveLineNoteIntoOrder = async (lineId: string, name: string, clickedNote: string) => {
    if (lineNoteWriteInFlight) return;

    const line = findLine(lineId);
    if (!line) {
      setLineNoteError("That item is no longer in your cart, so there was no note to move.");
      return;
    }
    // The live note is authoritative: the row may have re-rendered since the
    // tap. It is preserved LITERALLY (never trimmed or re-joined).
    const originalNote = line.notes ?? "";
    if (originalNote.trim().length === 0) {
      setLineNoteError("That item note is no longer there — nothing was changed.");
      return;
    }
    if (originalNote !== clickedNote) {
      setLineNoteError(
        `The ${name} note changed while you were looking at it. Nothing was moved — please try again.`,
      );
      return;
    }

    const checkout = useCheckoutStore.getState();
    const captured: CapturedDraft = {
      orderNotes: checkout.orderNotes,
      revision: checkout.notesRevision,
      scope: checkout.notesScope,
    };
    const joiner = captured.orderNotes.length > 0 ? "\n" : "";
    const candidate = `${captured.orderNotes}${joiner}${originalNote}`;
    const applied = applyOrderNotesEdit(captured.orderNotes, candidate);
    if (!applied.ok) {
      // Nothing is written or cleared: the note stays on the item for review.
      setLineNoteError(
        `There isn't room for the ${name} note within ${MAX_ORDER_NOTES_UNITS} characters. Shorten the order note first, then move it.`,
      );
      return;
    }

    lineNoteWriteInFlight = true;
    setBusyLineId(lineId);
    setLineNoteError(null);

    let written = false;
    let writtenRevision: number | null = null;

    try {
      // The draft may have changed between render and this tap.
      const before = useCheckoutStore.getState();
      if (
        before.notesRevision !== captured.revision ||
        before.orderNotes !== captured.orderNotes ||
        !sameScope(before.notesScope, captured.scope)
      ) {
        setLineNoteError(
          "Your order note changed while you were moving this item note. Nothing was changed — please try again.",
        );
        return;
      }

      if (!useCheckoutStore.getState().setOrderNotes(applied.value)) {
        setLineNoteError(
          `There isn't room for the ${name} note within ${MAX_ORDER_NOTES_UNITS} characters. Shorten the order note first, then move it.`,
        );
        return;
      }
      written = true;
      writtenRevision = useCheckoutStore.getState().notesRevision;
      const revisionAfterWrite = writtenRevision;

      const result = await cartRepository.updateNotes(lineId, "");
      if (!mountedRef.current) return;

      if (!result.success) {
        console.error("[cart] clearing the line note failed:", result.error);
        const rolledBack = rollbackDraft(captured, applied.value, revisionAfterWrite);
        setLineNoteError(
          rolledBack
            ? `We couldn't move the ${name} note, so it is still on that item. Nothing was duplicated — please try again.`
            : `We couldn't move the ${name} note. It is still on that item; your newer order note was left untouched.`,
        );
        return;
      }

      // The clear is only meaningful if the line still exists; if it vanished
      // mid-move the instruction now lives in the order note exactly once.
      const after = findLine(lineId);
      if (after && (after.notes ?? "").length > 0) {
        // The clear did not stick (a newer note was written on the line).
        rollbackDraft(captured, applied.value, revisionAfterWrite);
        setLineNoteError(
          `The ${name} note changed before it could be moved. Nothing was duplicated — review it and try again.`,
        );
        return;
      }

      // The clear stuck — but a concurrent edit or scope switch may have
      // replaced the draft we wrote. The instruction must never end up in
      // neither place.
      const draftNow = useCheckoutStore.getState();
      const draftStillOurs =
        draftNow.notesRevision === revisionAfterWrite && draftNow.orderNotes === applied.value;
      if (!draftStillOurs) {
        const keptInDraft = draftNow.orderNotes.includes(originalNote);
        if (!keptInDraft) {
          try {
            await cartRepository.updateNotes(lineId, originalNote);
          } catch (restoreError) {
            console.error("[cart] restoring the line note failed:", restoreError);
          }
        }
        if (!mountedRef.current) return;
        setLineNoteError(
          keptInDraft
            ? `Your order note changed while moving the ${name} note — it is already in your newer note, so the item note was cleared.`
            : `Your order note changed while moving the ${name} note, so it was kept on that item for review.`,
        );
        return;
      }

      setError(null);
      toast.success(`Moved the ${name} note into cooking instructions`);
    } catch (thrown) {
      console.error("[cart] moving the line note failed:", thrown);
      if (!mountedRef.current) return;
      const rolledBack =
        written && writtenRevision !== null
          ? rollbackDraft(captured, applied.value, writtenRevision)
          : true;

      // If the clear partially applied before the failure, put the note back so
      // the instruction is still reviewable in exactly one place.
      const lineNow = findLine(lineId);
      if (lineNow && (lineNow.notes ?? "").length === 0 && originalNote) {
        try {
          await cartRepository.updateNotes(lineId, originalNote);
        } catch {
          // best effort: the order draft was rolled back, so nothing is lost
          // unless both writes failed; the error below tells the customer.
        }
      }

      setLineNoteError(
        rolledBack
          ? `We couldn't move the ${name} note, so it is still on that item. Please try again.`
          : `We couldn't finish moving the ${name} note. Check both notes before paying.`,
      );
    } finally {
      lineNoteWriteInFlight = false;
      if (mountedRef.current) setBusyLineId(null);
    }
  };

  const removeLineNote = async (lineId: string, name: string, clickedNote: string) => {
    if (lineNoteWriteInFlight) return;

    const line = findLine(lineId);
    if (!line) {
      setLineNoteError("That item is no longer in your cart.");
      return;
    }
    const originalNote = line.notes ?? "";
    if (originalNote.trim().length === 0) return;
    if (originalNote !== clickedNote) {
      setLineNoteError(
        `The ${name} note changed while you were looking at it. Nothing was removed — please try again.`,
      );
      return;
    }

    lineNoteWriteInFlight = true;
    setBusyLineId(lineId);
    setLineNoteError(null);

    try {
      const result = await cartRepository.updateNotes(lineId, "");
      if (!mountedRef.current) return;
      if (!result.success) {
        console.error("[cart] removing the line note failed:", result.error);
        setLineNoteError(
          `We couldn't remove the ${name} note. It is still on that item — please try again.`,
        );
        return;
      }
      // Never claim success for a line/note this write did not actually clear.
      const after = findLine(lineId);
      if (after && (after.notes ?? "") === originalNote) {
        setLineNoteError(
          `The ${name} note didn't change. It is still on that item — please try again.`,
        );
        return;
      }
      toast(`Removed the ${name} note`, { duration: 2000 });
    } catch (thrown) {
      console.error("[cart] removing the line note failed:", thrown);
      if (!mountedRef.current) return;
      setLineNoteError(
        `We couldn't remove the ${name} note. It is still on that item — please try again.`,
      );
    } finally {
      lineNoteWriteInFlight = false;
      if (mountedRef.current) setBusyLineId(null);
    }
  };

  return (
    <section
      aria-labelledby="cooking-notes-heading"
      className="space-y-2 border-y border-divider py-4"
    >
      <h2 id="cooking-notes-heading" className="sr-only">
        Kitchen instructions
      </h2>

      <div className="py-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="cooking-notes-field"
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <StickyNote className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 break-words text-base font-medium text-text">
              Add cooking instructions
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 shrink-0 text-text-secondary transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {!open && orderNotes.trim().length > 0 && (
          <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">{orderNotes}</p>
        )}

        {open && (
          <div id="cooking-notes-field" className="mt-2 space-y-1.5">
            <label htmlFor="order-notes" className="block text-sm text-text-secondary">
              Applies to the whole order. The kitchen reads this before cooking.
            </label>
            <textarea
              id="order-notes"
              ref={textareaRef}
              value={orderNotes}
              onChange={handleChange}
              rows={3}
              placeholder="e.g. less spicy, no onions on one burger"
              aria-describedby="order-notes-counter order-notes-error"
              className="w-full rounded-lg border border-divider bg-background px-3 py-3 text-base text-text outline-none transition-colors focus:border-primary"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-text-secondary">
                Legacy item notes are reviewed below.
              </span>
              <span
                id="order-notes-counter"
                aria-live="polite"
                className={cn(
                  "font-sans text-sm tabular-nums",
                  units >= MAX_ORDER_NOTES_UNITS ? "text-warning" : "text-text-secondary",
                )}
              >
                {units}/{MAX_ORDER_NOTES_UNITS}
              </span>
            </div>
            {error && (
              <p id="order-notes-error" role="alert" className="text-sm font-medium text-error">
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      {legacyOrderNotes.trim().length > 0 && (
        <div
          role="alert"
          className="space-y-2 rounded-2xl border border-warning/40 bg-warning/10 p-3.5"
        >
          <p className="text-sm font-semibold text-text">
            Saved note needs review ({orderNotesUnits(legacyOrderNotes)} characters, over the{" "}
            {MAX_ORDER_NOTES_UNITS} limit)
          </p>
          <p className="text-sm text-text-secondary">
            This note was saved by an older version of the app. It is not attached to any order
            until you resolve it.
          </p>
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-divider bg-surface p-2.5 text-sm text-text">
            {legacyOrderNotes}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                resolveLegacyOrderNotes(
                  "keep",
                  sliceAtCodePointBoundary(legacyOrderNotes, MAX_ORDER_NOTES_UNITS),
                )
              }
              className="min-h-11 rounded-xl bg-primary px-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              Keep the first {MAX_ORDER_NOTES_UNITS} characters
            </button>
            <button
              type="button"
              onClick={() => resolveLegacyOrderNotes("discard")}
              className="min-h-11 rounded-xl border border-divider px-3.5 text-sm font-medium text-text transition-colors hover:bg-bg-secondary"
            >
              Discard saved note
            </button>
          </div>
        </div>
      )}

      {linesWithNotes.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-divider bg-bg-secondary p-3.5">
          <p className="text-sm font-semibold text-text">Notes on individual items</p>
          <p className="text-sm text-text-secondary">
            These came from an older cart. Move them into the order note, or remove them — the
            choice is yours.
          </p>
          {lineNoteError && (
            <p
              role="alert"
              className="rounded-xl border border-error/40 bg-error/10 p-2.5 text-sm font-medium text-error"
            >
              {lineNoteError}
            </p>
          )}
          <ul className="space-y-2">
            {linesWithNotes.map((line) => {
              // Literal note text: no trim, no re-join, no splitting on "|".
              const note = line.notes ?? "";
              const lineBusy = busyLineId === line.lineId;
              return (
                <li
                  key={line.lineId}
                  className="rounded-xl border border-divider bg-surface p-3"
                  aria-busy={lineBusy}
                >
                  <p className="text-sm font-medium text-text">{line.name}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-text-secondary">
                    {note}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void moveLineNoteIntoOrder(line.lineId, line.name, note)}
                      className="min-h-11 rounded-xl border border-primary/40 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
                    >
                      {lineBusy ? "Moving…" : "Move into cooking instructions"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeLineNote(line.lineId, line.name, note)}
                      className="min-h-11 rounded-xl border border-divider px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-secondary disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

export default CookingInstructionsSection;
