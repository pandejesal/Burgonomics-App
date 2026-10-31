import * as React from "react";

/**
 * useDirectionalScroll
 *
 * Dual-Axis Directional Scroll Delegate for mobile web / WebView.
 * Resolves touch lockouts on horizontal scrollers (e.g. Android WebView / Chromium).
 *
 * When a user touches anywhere on a horizontal scroll container:
 * - If the gesture is horizontal (dx > dy * 2): drives horizontal scrolling on
 *   the container with momentum inertia on release.
 * - If the gesture is vertical (dy >= dx / 2): the hook steps out of the way.
 *   Vertical panning belongs to the browser: consumers set `touch-action:
 *   pan-y`, so cancelling the touchmove and driving `window.scrollBy` ourselves
 *   ignored the nearest scrollable ancestor (a sheet/drawer body stayed still
 *   while the page behind it moved) and replaced native momentum with a
 *   hand-rolled one.
 *
 * Axis locking still guarantees that a vertical gesture never leaks into a
 * horizontal rail scroll.
 */
export function useDirectionalScroll(ref: React.RefObject<HTMLElement | null>, threshold = 12) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let sx = 0;
    let sy = 0;
    let lastX = 0;
    let activeId: number | null = null;
    let locked: "x" | "y" | null = null;
    let animId: number | null = null;
    // Horizontal-only samples: the vertical axis is not tracked because the
    // browser owns it (see the note at the top of this hook).
    let samples: Array<{ x: number; t: number }> = [];

    const cancelAnim = () => {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    };

    const onStart = (e: TouchEvent) => {
      // A new gesture always cancels the run and drops the previous axis
      // decision — including the multi-touch case, which used to return early
      // and leave the old lock armed for the remaining fingers.
      cancelAnim();
      locked = null;
      samples = [];
      activeId = null;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      activeId = touch.identifier;
      sx = touch.clientX;
      sy = touch.clientY;
      lastX = touch.clientX;
      samples = [{ x: touch.clientX, t: performance.now() }];
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const curX = touch.clientX;
      const curY = touch.clientY;
      const now = performance.now();

      // The pointing finger can change mid-gesture (a second finger joined and
      // then lifted). Re-base on the finger that is actually moving, otherwise
      // its drag is measured against the finger that started the gesture and
      // can mislock the axis or jump the rail.
      if (activeId === null || touch.identifier !== activeId) {
        cancelAnim();
        activeId = touch.identifier;
        sx = curX;
        sy = curY;
        lastX = curX;
        locked = null;
        samples = [{ x: curX, t: now }];
        return;
      }

      if (!locked) {
        const totalDx = Math.abs(curX - sx);
        const totalDy = Math.abs(curY - sy);
        if (totalDx < threshold && totalDy < threshold) return;

        // Vertical-wins unless strong horizontal intent (dx > dy * 2)
        locked = totalDx > totalDy * 2 ? "x" : "y";
      }

      const moveDx = curX - lastX;
      lastX = curX;

      samples.push({ x: curX, t: now });
      if (samples.length > 5) {
        samples.shift();
      }

      if (locked === "x") {
        if (e.cancelable) {
          e.preventDefault();
        }
        el.scrollLeft -= moveDx;
      }
      // `locked === "y"`: deliberately no-op. See the vertical-panning note at
      // the top of this hook — the browser owns that axis, including momentum,
      // overscroll and the choice of scroll container.
    };

    const onEnd = (e: TouchEvent) => {
      // A cancelled gesture is over even if a finger technically remains: drop
      // the lock and any armed inertia instead of letting it write scrollLeft
      // under the next finger.
      if (e.type === "touchcancel") {
        cancelAnim();
        locked = null;
        samples = [];
        activeId = null;
        return;
      }

      // The gesture is not over while another finger is still down: settling
      // here would start inertia mid-pinch and reset the lock the remaining
      // finger is still driving.
      if (e.touches.length > 0) return;

      const gesture = locked;
      const snapshot = samples;
      locked = null;
      samples = [];
      activeId = null;

      // Only the horizontal axis has inertia; a vertical gesture is already
      // being finished by the browser.
      if (gesture !== "x" || snapshot.length < 2) return;

      const first = snapshot[0];
      const last = snapshot[snapshot.length - 1];
      const dt = last.t - first.t;
      if (dt <= 10 || dt >= 300) return;

      let vx = (last.x - first.x) / dt; // px / ms
      if (Math.abs(vx) <= 0.15) return;

      let lastTime = performance.now();
      const stepX = (time: number) => {
        const delta = Math.min(time - lastTime, 32);
        lastTime = time;
        el.scrollLeft -= vx * delta * 1.2;
        vx *= Math.pow(0.92, delta / 16.6);

        const maxScroll = el.scrollWidth - el.clientWidth;
        if (Math.abs(vx) > 0.05 && el.scrollLeft > 0 && el.scrollLeft < maxScroll) {
          animId = requestAnimationFrame(stepX);
        } else {
          animId = null;
        }
      };
      animId = requestAnimationFrame(stepX);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      cancelAnim();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, threshold]);
}
