import * as React from "react";

/**
 * useDirectionalScroll
 *
 * Dual-Axis Directional Scroll Delegate for mobile web / WebView.
 * Resolves touch lockouts on horizontal scrollers (e.g. Android WebView / Chromium).
 *
 * When a user touches anywhere on a horizontal scroll container:
 * - If the gesture is horizontal (dx > dy * 2): drives horizontal scrolling on the container with momentum inertia on release.
 * - If the gesture is vertical (dy >= dx / 2): actively drives document/window vertical scrolling with momentum inertia on release.
 *
 * Prevents dead zones and ensures vertical scrolling always wins unless strong horizontal gesture.
 */
export function useDirectionalScroll(
  ref: React.RefObject<HTMLElement | null>,
  threshold = 12,
) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let sx = 0;
    let sy = 0;
    let lastX = 0;
    let lastY = 0;
    let locked: "x" | "y" | null = null;
    let animId: number | null = null;
    let samples: Array<{ x: number; y: number; t: number }> = [];

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
      lastX = touch.clientX;
      lastY = touch.clientY;
      locked = null;
      samples = [{ x: touch.clientX, y: touch.clientY, t: performance.now() }];
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const curX = touch.clientX;
      const curY = touch.clientY;
      const now = performance.now();

      if (!locked) {
        const totalDx = Math.abs(curX - sx);
        const totalDy = Math.abs(curY - sy);
        if (totalDx < threshold && totalDy < threshold) return;

        // Vertical-wins unless strong horizontal intent (dx > dy * 2)
        locked = totalDx > totalDy * 2 ? "x" : "y";
      }

      const moveDx = curX - lastX;
      const moveDy = curY - lastY;
      lastX = curX;
      lastY = curY;

      samples.push({ x: curX, y: curY, t: now });
      if (samples.length > 5) {
        samples.shift();
      }

      if (locked === "x") {
        if (e.cancelable) {
          e.preventDefault();
        }
        el.scrollLeft -= moveDx;
      } else if (locked === "y") {
        if (e.cancelable) {
          e.preventDefault();
        }
        // Explicitly drive vertical page scrolling
        window.scrollBy({ top: -moveDy, left: 0, behavior: "auto" });
      }
    };

    const onEnd = () => {
      if (samples.length >= 2 && locked) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = last.t - first.t;

        if (dt > 10 && dt < 300) {
          let vx = (last.x - first.x) / dt; // px / ms
          let vy = (last.y - first.y) / dt; // px / ms

          if (locked === "x" && Math.abs(vx) > 0.15) {
            let lastTime = performance.now();
            const stepX = (time: number) => {
              const delta = Math.min(time - lastTime, 32);
              lastTime = time;
              el.scrollLeft -= vx * delta * 1.2;
              vx *= Math.pow(0.92, delta / 16.6);

              const maxScroll = el.scrollWidth - el.clientWidth;
              if (
                Math.abs(vx) > 0.05 &&
                el.scrollLeft > 0 &&
                el.scrollLeft < maxScroll
              ) {
                animId = requestAnimationFrame(stepX);
              } else {
                animId = null;
              }
            };
            animId = requestAnimationFrame(stepX);
          } else if (locked === "y" && Math.abs(vy) > 0.15) {
            let lastTime = performance.now();
            const stepY = (time: number) => {
              const delta = Math.min(time - lastTime, 32);
              lastTime = time;
              window.scrollBy({
                top: -vy * delta * 1.2,
                left: 0,
                behavior: "auto",
              });
              vy *= Math.pow(0.92, delta / 16.6);

              const maxScroll =
                document.documentElement.scrollHeight - window.innerHeight;
              if (
                Math.abs(vy) > 0.05 &&
                window.scrollY > 0 &&
                window.scrollY < maxScroll
              ) {
                animId = requestAnimationFrame(stepY);
              } else {
                animId = null;
              }
            };
            animId = requestAnimationFrame(stepY);
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
