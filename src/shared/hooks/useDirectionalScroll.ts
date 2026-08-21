import * as React from "react";

/**
 * useDirectionalScroll
 *
 * Resolves diagonal gesture latching on Android 16 / Chromium 150.
 * On horizontal scrollers with CSS `touch-action: pan-y`, native vertical/diagonal
 * pan gestures bubble cleanly to the document. Horizontal scrolling is driven
 * directly via active touch events with velocity-decay momentum on release.
 */
export function useDirectionalScroll(
  ref: React.RefObject<HTMLElement | null>,
  threshold = 8,
) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let sx = 0;
    let sy = 0;
    let sLeft = 0;
    let locked: "x" | "y" | null = null;
    let animId: number | null = null;
    let samples: Array<{ x: number; t: number }> = [];

    const cancelAnim = () => {
      if (animId !== null) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      cancelAnim();
      const touch = e.touches[0];
      sx = touch.clientX;
      sy = touch.clientY;
      sLeft = el.scrollLeft;
      locked = null;
      samples = [{ x: touch.clientX, t: performance.now() }];
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];

      if (!locked) {
        const dx = Math.abs(touch.clientX - sx);
        const dy = Math.abs(touch.clientY - sy);
        if (dx < threshold && dy < threshold) return;
        locked = dx > dy ? "x" : "y";
      }

      if (locked === "x") {
        if (e.cancelable) {
          e.preventDefault();
        }
        const deltaX = touch.clientX - sx;
        el.scrollLeft = sLeft - deltaX;

        const now = performance.now();
        samples.push({ x: touch.clientX, t: now });
        if (samples.length > 5) {
          samples.shift();
        }
      }
      // If locked === 'y', do nothing — native pan-y allows bubbling to document
    };

    const onEnd = () => {
      if (locked === "x" && samples.length >= 2) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = last.t - first.t;
        if (dt > 10 && dt < 250) {
          // Velocity in px per ms (negative if dragging left, scrolling right)
          let vx = (last.x - first.x) / dt;
          if (Math.abs(vx) > 0.15) {
            let lastTime = performance.now();
            const step = (time: number) => {
              const delta = Math.min(time - lastTime, 32);
              lastTime = time;
              // Decelerate
              el.scrollLeft -= vx * delta * 1.5;
              vx *= Math.pow(0.92, delta / 16.6);

              const maxScroll = el.scrollWidth - el.clientWidth;
              if (
                Math.abs(vx) > 0.05 &&
                el.scrollLeft > 0 &&
                el.scrollLeft < maxScroll
              ) {
                animId = requestAnimationFrame(step);
              } else {
                animId = null;
              }
            };
            animId = requestAnimationFrame(step);
          }
        }
      }
      locked = null;
      samples = [];
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
