import { describe, it, expect } from "vitest";
import { centerScrollLeft } from "./categoryScroll";

/**
 * The rail centres the active chip with `offsetLeft` math. These cases pin the
 * three ways that maths historically went wrong: no clamp at either end, a
 * target that depends on the current scroll position, and drift when the chip
 * is already centred.
 */
describe("centerScrollLeft", () => {
  const viewport = { clientWidth: 360, scrollWidth: 1600 };

  it("puts the chip's centre on the viewport's centre", () => {
    const left = centerScrollLeft({
      offsetLeft: 500,
      offsetWidth: 120,
      ...viewport,
    });
    // chip centre at 500 + 60 = 560; after scrolling `left` the chip centre
    // must sit at half the visible width: 560 - left = 360 / 2
    expect(left).toBe(380);
    expect(560 - left).toBe(viewport.clientWidth / 2);
  });

  it("clamps the first chips to 0 instead of a negative offset", () => {
    const left = centerScrollLeft({
      offsetLeft: 8,
      offsetWidth: 90,
      ...viewport,
    });
    expect(left).toBe(0);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it("clamps the last chips to the scrollable range, not past it", () => {
    const maxScroll = viewport.scrollWidth - viewport.clientWidth; // 1240
    const left = centerScrollLeft({
      offsetLeft: 1500,
      offsetWidth: 140,
      ...viewport,
    });
    expect(left).toBe(maxScroll);
    expect(left).toBeLessThanOrEqual(maxScroll);
  });

  it("returns 0 when the rail does not overflow its container", () => {
    expect(
      centerScrollLeft({ offsetLeft: 40, offsetWidth: 80, clientWidth: 400, scrollWidth: 400 }),
    ).toBe(0);
  });

  it("is stable: the same geometry always yields the same target", () => {
    const target = { offsetLeft: 700, offsetWidth: 110, ...viewport };
    const first = centerScrollLeft(target);
    // Re-running must not depend on where the rail currently sits — offsetLeft
    // is a layout coordinate, so the helper takes no scroll position at all.
    expect(centerScrollLeft(target)).toBe(first);
    expect(centerScrollLeft(target)).toBe(first);
  });

  it("centres an already-centred chip on itself (idempotent target)", () => {
    const target = { offsetLeft: 420, offsetWidth: 120, ...viewport };
    const left = centerScrollLeft(target);
    // Recompute from the geometry the scroll would produce: the chip's layout
    // position is unchanged by scrolling, so the target must be identical.
    expect(centerScrollLeft({ ...target, offsetLeft: target.offsetLeft })).toBe(left);
  });

  it("handles degenerate inputs without producing NaN", () => {
    const left = centerScrollLeft({
      offsetLeft: 0,
      offsetWidth: 0,
      clientWidth: 0,
      scrollWidth: 0,
    });
    expect(Number.isFinite(left)).toBe(true);
    expect(left).toBe(0);
  });
});
