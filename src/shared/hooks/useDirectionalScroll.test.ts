// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDirectionalScroll } from "./useDirectionalScroll";

/**
 * Contract for the shared directional-scroll hook.
 *
 * Horizontal gestures belong to the rail (the hook must cancel them and move
 * `scrollLeft`); vertical gestures belong to the browser, so the hook must not
 * cancel them and must never scroll the page itself. The previous
 * implementation called `preventDefault()` on vertical touchmoves and replayed
 * them as `window.scrollBy`, which ignored the nearest scrollable ancestor and
 * replaced native momentum.
 *
 * Real-browser coverage of the same contract lives in
 * `tests/playwright/ui-directional-scroll.spec.ts`; this file is the fast
 * headless pin that runs inside `npm test`.
 */

function Harness({ railRef }: { railRef: React.RefObject<HTMLDivElement | null> }) {
  useDirectionalScroll(railRef);
  return React.createElement("div", { ref: railRef, "data-rail": "" });
}

type Point = { clientX: number; clientY: number };

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let rail: HTMLDivElement;
let scrollLeft = 0;
let scrollBy: ReturnType<typeof vi.fn>;

function dispatch(rail: HTMLDivElement, type: string, points: Point[]): boolean {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: points.map((point, i) => ({ ...point, identifier: i + 1, target: rail })),
  });
  return rail.dispatchEvent(event);
}

/** Single-finger gesture step. `dispatchEvent` returns false exactly when a listener cancelled it. */
function send(type: "touchstart" | "touchmove" | "touchend", x: number, y: number): boolean {
  return dispatch(rail, type, type === "touchend" ? [] : [{ clientX: x, clientY: y }]);
}

/** Multi-finger step, used for the pinch guards. */
function sendMulti(type: string, points: Point[]): boolean {
  return dispatch(rail, type, points);
}

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const railRef = React.createRef<HTMLDivElement>();
  act(() => {
    root.render(React.createElement(Harness, { railRef }));
  });
  rail = container.querySelector("[data-rail]") as HTMLDivElement;
  scrollLeft = 0;
  // jsdom does not implement element scrolling; back `scrollLeft` with a slot
  // so the assertion is about the hook's arithmetic, not jsdom's layout.
  Object.defineProperty(rail, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value;
    },
  });
  scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useDirectionalScroll", () => {
  // These two are absence pins: they also pass for a no-op hook. Liveness is
  // covered by the three tests below.
  it("leaves a vertical drag to the browser instead of cancelling it", () => {
    send("touchstart", 200, 100);
    const first = send("touchmove", 202, 140);
    const second = send("touchmove", 203, 180);

    expect(first, "vertical touchmove must not be cancelled").toBe(true);
    expect(second, "vertical touchmove must not be cancelled").toBe(true);
    expect(scrollBy, "the hook must not drive the page itself").not.toHaveBeenCalled();
    expect(scrollLeft, "a vertical drag must not scroll the rail").toBe(0);
  });

  it("does not replay a vertical drag as manual scrolling on release", () => {
    send("touchstart", 200, 100);
    send("touchmove", 202, 160);
    send("touchmove", 204, 220);
    send("touchend", 204, 220);

    expect(scrollBy).not.toHaveBeenCalled();
    expect(scrollLeft).toBe(0);
  });

  it("still drives the rail horizontally, including cancelling the browser's pan", () => {
    send("touchstart", 200, 100);
    const move = send("touchmove", 150, 101);

    expect(move, "horizontal touchmove is owned by the hook").toBe(false);
    expect(scrollLeft, "rail follows the finger").toBe(50);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("keeps the axis lock for the rest of the gesture", () => {
    send("touchstart", 200, 100);
    send("touchmove", 198, 160); // locks vertical
    const sideways = send("touchmove", 100, 165); // same gesture, now sideways

    expect(sideways, "a vertical-locked gesture stays native").toBe(true);
    expect(scrollLeft, "must not leak into a rail scroll").toBe(0);
  });

  it("resets the axis lock for the next gesture", () => {
    send("touchstart", 200, 100);
    send("touchmove", 198, 160); // vertical
    send("touchend", 198, 160);

    send("touchstart", 200, 100);
    const move = send("touchmove", 150, 101); // horizontal, new gesture

    expect(move).toBe(false);
    expect(scrollLeft).toBe(50);
  });

  it("never drives the rail from a two-finger gesture", () => {
    const start = sendMulti("touchstart", [
      { clientX: 200, clientY: 100 },
      { clientX: 240, clientY: 140 },
    ]);
    const move = sendMulti("touchmove", [
      { clientX: 160, clientY: 104 },
      { clientX: 280, clientY: 144 },
    ]);

    expect(start, "a pinch must stay native").toBe(true);
    expect(move, "a pinch must stay native").toBe(true);
    expect(scrollLeft).toBe(0);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does not settle the gesture while a second finger is still down", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 0);
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
    // Pin the clock: dt > 10 is required for the settle path to arm inertia, and
    // dt must stay under 300ms so a stalled runner cannot make this vacuous.
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 25));

    send("touchstart", 200, 100);
    send("touchmove", 150, 101); // locks horizontal, rail moves 50px
    const moved = scrollLeft;
    expect(moved).toBe(50);

    // Second finger lands, then the first lifts: a finger is still down, so the
    // gesture is not over and no inertia may start from a mixed sample set.
    sendMulti("touchstart", [
      { clientX: 320, clientY: 200 },
      { clientX: 200, clientY: 100 },
    ]);
    const lifted = sendMulti("touchend", [{ clientX: 200, clientY: 100 }]);

    expect(lifted, "the remaining finger keeps the gesture native").toBe(true);
    expect(raf, "no inertia while a finger is still down").not.toHaveBeenCalled();
    expect(scrollLeft, "no jump while a finger remains").toBe(moved);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("re-bases on the finger that is still down after a pinch", () => {
    send("touchstart", 200, 100);
    send("touchmove", 150, 101); // locks horizontal, rail moves 50px
    const moved = scrollLeft;
    expect(moved).toBe(50);

    // Second finger joins, then lifts: the gesture continues with the finger
    // that landed at (200,100).
    sendMulti("touchstart", [
      { clientX: 320, clientY: 200 },
      { clientX: 200, clientY: 100 },
    ]);
    sendMulti("touchend", [{ clientX: 200, clientY: 100 }]);

    // The remaining finger's first move must be measured against itself. The
    // stale origin (200,100) would make this 40px leftward drag a hook-owned
    // horizontal move (dx 40, dy 0) and the rail would jump by lastX 150 -> 160.
    const rebase = send("touchmove", 160, 100);
    expect(rebase, "re-based move stays native").toBe(true);

    const drag = send("touchmove", 120, 100);
    expect(drag, "the second move is the rail's own").toBe(false);
    // New code: exactly the remaining finger's 40px. Stale origin: 50 -> 40 -> 80.
    expect(scrollLeft, "only the remaining finger's own delta").toBe(moved + 40);
  });

  it("a cancelled gesture disarms the lock instead of settling under the next finger", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(() => 0);
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});
    // Same pinned clock as above: `vx = -2 px/ms` would arm inertia on a settle.
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 25));

    send("touchstart", 200, 100);
    send("touchmove", 150, 101);
    const moved = scrollLeft;
    expect(moved).toBe(50);

    // touchcancel can arrive while a touch point is still reported.
    sendMulti("touchcancel", [{ clientX: 150, clientY: 101 }]);

    expect(raf, "no inertia may outlive a cancel").not.toHaveBeenCalled();
    const afterCancel = send("touchmove", 100, 160); // fresh origin required
    expect(afterCancel, "the next gesture is decided from scratch").toBe(true);
    expect(scrollLeft, "no stale lock survives the cancel").toBe(moved);
  });
});
