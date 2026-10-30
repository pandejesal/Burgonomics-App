import * as React from "react";

/**
 * Focus management for the menu's customizer sheet.
 *
 * Implemented locally (not a new dependency) but with the same obligations a
 * dialog primitive would carry: modal semantics, focus entry, Tab trap,
 * Escape-to-close, focus restore to the opener, and a body scroll lock.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Focusable descendants in DOM order. `offsetParent`/`getClientRects` are not
 * used: jsdom (and some embedded webviews) report no layout, which would drop
 * every control. `hidden`, `aria-hidden` and disabled are checked instead.
 */
export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      if (element.hasAttribute("disabled")) return false;
      if (element.getAttribute("aria-hidden") === "true") return false;
      if (element.hidden) return false;
      return true;
    },
  );
}

/**
 * Next index for a Tab/Shift+Tab press, wrapping at both ends.
 * `current` is -1 when focus is outside the list (e.g. on the dialog itself).
 */
export function nextTabStopIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return 0;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  if (backwards) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

export interface DialogA11yOptions {
  open: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
}

export function useDialogA11y({ open, onClose, containerRef }: DialogA11yOptions): void {
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () => (container ? getFocusableElements(container) : []);
    const initial = focusables()[0] ?? container;
    initial?.focus?.({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const list = focusables();
      if (list.length === 0) {
        event.preventDefault();
        container.focus?.({ preventScroll: true });
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const index = active ? list.indexOf(active) : -1;
      const next = nextTabStopIndex(list.length, index, event.shiftKey);
      event.preventDefault();
      list[next]?.focus({ preventScroll: true });
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // Restore the control that opened the sheet (no Radix Trigger to do it
      // for us), but only while it is still in the document.
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, containerRef]);
}
