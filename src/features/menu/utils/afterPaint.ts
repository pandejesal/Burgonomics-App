/**
 * Wait until the browser has painted the last committed React update.
 *
 * A `setTimeout(0)` only yields a macrotask: React may commit afterwards, so a
 * jump measured at that point can land on skeleton height and then drift. Two
 * animation frames put the measurement after a real paint. Environments
 * without `requestAnimationFrame` (SSR, some test runners) fall back to the
 * macrotask so callers never hang.
 */
export function afterNextPaint(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  const raf = window.requestAnimationFrame;
  if (typeof raf !== "function") {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  return new Promise<void>((resolve) => {
    raf(() => {
      raf(() => resolve());
    });
  });
}
