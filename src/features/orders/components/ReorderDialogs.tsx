import * as React from "react";
import { AlertCircle, ArrowRight, RotateCcw } from "lucide-react";

import { formatINR } from "@/core/utils/format";
import type {
  ReorderConfirmation,
  ReorderOutOfStockState,
} from "../hooks/useReorderItems";

interface ReorderDialogsProps {
  outOfStockModal: ReorderOutOfStockState;
  pendingConfirmation: ReorderConfirmation | null;
  onConfirmRemaining: () => void;
  onDismissOutOfStock: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * True while a fresh validation is running. Every action is disabled so a
   * double tap cannot start a second read (the hook's synchronous fence is the
   * real guarantee; this is the visible one).
   */
  busy?: boolean;
}

/**
 * The two reorder review surfaces, shared by every caller:
 *
 *  1. Items that cannot be reordered (retired option, 86ed item, delisted) —
 *     shown with the exact reason, and an explicit "reorder the rest" action.
 *  2. Price changes and/or a cross-outlet basket replacement — shown BEFORE
 *     anything is added; Cancel leaves the basket untouched.
 */
export function ReorderDialogs({
  outOfStockModal,
  pendingConfirmation,
  onConfirmRemaining,
  onDismissOutOfStock,
  onConfirm,
  onCancel,
  busy = false,
}: ReorderDialogsProps) {
  if (!outOfStockModal.isOpen && !pendingConfirmation) return null;

  return (
    <>
      {outOfStockModal.isOpen && !pendingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reorder-unavailable-title"
            className="w-full max-w-sm space-y-4 rounded-3xl border border-divider bg-surface p-5 shadow-2xl"
          >
            <div className="flex items-center gap-2 text-base font-semibold text-text">
              <AlertCircle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
              <h2 id="reorder-unavailable-title">Some items can&apos;t be reordered</h2>
            </div>

            <ul className="list-disc space-y-1 rounded-2xl border border-divider bg-bg-secondary p-3 pl-7 text-sm text-text">
              {outOfStockModal.unavailableItems.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>

            <p className="text-sm text-text-secondary">
              Nothing has been added to your cart yet.
            </p>

            <div className="flex items-center justify-end gap-2 border-t border-divider pt-3">
              <button
                type="button"
                onClick={onDismissOutOfStock}
                disabled={busy}
                className="min-h-11 rounded-xl border border-divider px-3.5 text-sm font-medium text-text transition-colors hover:bg-bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmRemaining}
                disabled={busy}
                aria-busy={busy}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Reorder the rest
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reorder-confirm-title"
            className="w-full max-w-sm space-y-4 rounded-3xl border border-divider bg-surface p-5 shadow-2xl"
          >
            <h2 id="reorder-confirm-title" className="text-base font-semibold text-text">
              {pendingConfirmation.replacesCart
                ? `Replace your cart with items from ${pendingConfirmation.storeName}?`
                : "Confirm the updated prices"}
            </h2>

            {pendingConfirmation.replacesCart && (
              <p className="text-sm text-text-secondary">
                Your cart already has items from another outlet. Reordering replaces them with
                the items from {pendingConfirmation.storeName}. Your current items will be
                removed only if you continue.
              </p>
            )}

            {pendingConfirmation.priceChanges.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-text">Prices changed since that order</p>
                <ul className="space-y-1 rounded-2xl border border-divider bg-bg-secondary p-3 text-sm">
                  {pendingConfirmation.priceChanges.map((change) => (
                    <li
                      key={`${change.name}-${change.nextUnitPrice}`}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="min-w-0 truncate text-text">{change.name}</span>
                      <span className="shrink-0 font-mono text-sm text-text">
                        {formatINR(change.previousUnitPrice)}
                        <ArrowRight className="mx-1 inline h-3 w-3" aria-hidden />
                        {formatINR(change.nextUnitPrice)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-text-secondary">
                  The order will use today&apos;s prices.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-divider pt-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="min-h-11 rounded-xl border border-divider px-3.5 text-sm font-medium text-text transition-colors hover:bg-bg-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                aria-busy={busy}
                className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy
                  ? "Checking prices…"
                  : pendingConfirmation.replacesCart
                    ? "Replace and add"
                    : "Add to cart"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ReorderDialogs;
