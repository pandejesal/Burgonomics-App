/**
 * Native non-passive moves keep horizontal gestures from becoming page scrolls.
 *
 * `onSwipe` may return `false` to report that the gesture had no target (first
 * / last category). The swipe then does not arm the click-suppression flag, so
 * a boundary swipe never eats the tap that follows it. Returning `true` or
 * nothing arms the flag, as before.
 */
export function attachCategorySwipe(
  element: HTMLElement,
  onSwipe: (direction: -1 | 1) => boolean | void,
) {
  let start: { x: number; y: number; id: number } | null = null;
  let axis: "x" | "y" | null = null;
  let swiped = false;
  const reset = () => { start = null; axis = null; };
  const begin = (event: TouchEvent) => {
    reset();
    swiped = false;
    const touch = event.touches[0];
    if (event.touches.length === 1 && touch) {
      start = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
    }
  };
  const move = (event: TouchEvent) => {
    if (event.touches.length !== 1) { reset(); return; }
    const touch = event.touches[0];
    if (!start || !touch || touch.identifier !== start.id) return;
    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);
    if (!axis && Math.max(dx, dy) >= 12) {
      if (dx > dy * 1.25) axis = "x";
      else if (dy > dx) axis = "y";
    }
    if (axis === "x" && event.cancelable) event.preventDefault();
  };
  const end = (event: TouchEvent) => {
    const touch = Array.from(event.changedTouches).find((t) => t.identifier === start?.id);
    if (start && touch && axis !== "y") {
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) >= 48 && (axis === "x" || Math.abs(dx) > Math.abs(dy) * 1.25)) {
        const handled = onSwipe(dx < 0 ? 1 : -1);
        if (handled !== false) swiped = true;
      }
    }
    reset();
  };
  // A swipe over a product link/Add button must not also activate that control.
  const click = (event: MouseEvent) => {
    if (swiped) { event.preventDefault(); event.stopPropagation(); swiped = false; }
  };
  element.addEventListener("touchstart", begin, { passive: true });
  element.addEventListener("touchmove", move, { passive: false });
  element.addEventListener("touchend", end);
  element.addEventListener("touchcancel", reset);
  element.addEventListener("click", click, true);
  return () => {
    element.removeEventListener("touchstart", begin);
    element.removeEventListener("touchmove", move);
    element.removeEventListener("touchend", end);
    element.removeEventListener("touchcancel", reset);
    element.removeEventListener("click", click, true);
  };
}
