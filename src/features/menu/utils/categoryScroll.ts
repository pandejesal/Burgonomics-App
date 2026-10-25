/**
 * Geometry helper for the category rail's "keep the active chip centred" rule.
 *
 * Kept pure so the arithmetic can be unit-tested without a DOM — the rail's
 * bugs historically lived in the clamp, not in the component.
 */

export interface CenterTarget {
  /** Chip's layout position inside the scroller, in px (`HTMLElement.offsetLeft`). */
  offsetLeft: number;
  /** Chip width (`HTMLElement.offsetWidth`). */
  offsetWidth: number;
  /** Visible width of the scroller (`HTMLElement.clientWidth`). */
  clientWidth: number;
  /** Full scrollable content width (`HTMLElement.scrollWidth`). */
  scrollWidth: number;
}

/**
 * Scroll offset that puts `offsetLeft..offsetLeft + offsetWidth` in the middle
 * of the scroller's visible width.
 *
 * Invariants this relies on:
 *
 * - `offsetLeft` is a *layout* coordinate measured from the scroller's padding
 *   edge (the rail marks itself `relative`, so it is the offset parent). It does
 *   not change as the rail scrolls, so the target is the same whether the rail
 *   is at rest or mid-scroll — no accumulation, no drift across repeated calls.
 * - The chip's centre lands on `clientWidth / 2` by construction:
 *   `offsetLeft + offsetWidth / 2 - left = clientWidth / 2`.
 *
 * The result is clamped to `[0, scrollWidth - clientWidth]`. The browser would
 * clamp the `scrollLeft` write anyway, but clamping here means callers can
 * compare the target against `scrollLeft` (e.g. "already centred?") without
 * observing an out-of-range value that never takes effect.
 */
export function centerScrollLeft({
  offsetLeft,
  offsetWidth,
  clientWidth,
  scrollWidth,
}: CenterTarget): number {
  const target = offsetLeft - clientWidth / 2 + offsetWidth / 2;
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  return Math.min(Math.max(0, target), maxScroll);
}

export default centerScrollLeft;
