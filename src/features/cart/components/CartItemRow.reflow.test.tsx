/** @vitest-environment jsdom */
/**
 * Cart line at narrow intrinsic width (WCAG 2.2 SC 1.4.10 Reflow).
 *
 * Measured at 390x844 with 200% text (ui-independent-probe-results.json,
 * cart.text200.focus step 7): "Increase quantity" rendered at x 385..473, so
 * 88px of the control — and its tap target — sat outside a 390px viewport.
 *
 * The cause is arithmetic, not opinion. At a 32px root:
 *   article content width   = 310px  (measured 40..350)
 *   image  h-20 w-20        = 160px  (5rem)
 *   gap-4                   =  32px  (1rem)
 *   text column             = 118px
 *   quantity group          = 240px  (measured 233..473: 88 + ~64 + 88)
 *
 * The group is `shrink-0`, so it refuses to give back the 122px it does not
 * have, and the last control is pushed off-screen. The fix is reflow: the group
 * must be allowed to take the width it is given and wrap its own controls, so
 * its minimum width becomes the widest single control (88px) rather than the
 * sum of all three (240px). Nothing is removed: both buttons, the counter and
 * the price stay.
 *
 * jsdom computes no layout, so these assert the class-level mechanism against
 * the measured numbers above — the arithmetic is the test.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CartLine } from "../models";

vi.mock("@/core/services/haptics", () => ({ HapticService: { impact: vi.fn() } }));
vi.mock("@/core/services/audio", () => ({ AudioService: { playClick: vi.fn() } }));

import { CartItemRow } from "./CartItemRow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/* ── the measure under test (200% text, 390px viewport) ─────────────────── */
const TEXT_200 = {
  rootFontPx: 32,
  articleContentPx: 310,
  imagePx: 5 * 32, // h-20 w-20
  gapPx: 1 * 32, // gap-4
};
const TEXT_200_COLUMN_PX =
  TEXT_200.articleContentPx - TEXT_200.imagePx - TEXT_200.gapPx; // 118

/** Resolve a `h-11` / `w-11` style Tailwind size to px at the given root size. */
function twSizeToPx(className: string, axis: "h" | "w", rootFontPx: number): number | null {
  const match = new RegExp(`(?:^|\\s)${axis}-(\\d+(?:\\.\\d+)?)(?=\\s|$)`).exec(className);
  if (!match) return null;
  // Tailwind's numeric scale is 0.25rem per step.
  return Number(match[1]) * 0.25 * rootFontPx;
}

/** A long real name, so the title block wraps instead of hiding the problem. */
const line: CartLine = {
  lineId: "sample-line",
  productId: "sample-product",
  storeId: "sample-store",
  name: "Cheese Burst Burger with a deliberately long readable name",
  unitPrice: 199,
  quantity: 2,
  modifiers: [],
  veg: true,
  availability: "available",
};

let host: HTMLDivElement;
let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
});

async function mount(value = line) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<CartItemRow line={value} onQuantityChange={vi.fn()} onRemove={vi.fn()} />),
  );
  return host;
}

const quantityGroup = (el: HTMLElement) => {
  const group = el.querySelector<HTMLElement>('[role="group"][aria-label^="Quantity for"]');
  expect(group, "the quantity group must still render").not.toBeNull();
  return group!;
};

describe("cart line reflows instead of overflowing at 200% text", () => {
  it("no longer refuses to give width back to the text column", async () => {
    const el = await mount();
    const group = quantityGroup(el);

    // `shrink-0` is precisely why the group ran 122px past the column.
    expect(group.className).not.toContain("shrink-0");
  });

  it("wraps its own controls when the measure is tighter than the group", async () => {
    const el = await mount();
    const group = quantityGroup(el);
    expect(group.className).toContain("flex-wrap");
  });

  it("is allowed to be narrower than its contents", async () => {
    const el = await mount();
    const group = quantityGroup(el);
    // Without one of these the group is still floored at its content width.
    expect(group.className).toMatch(/min-w-0|max-w-full/);
  });

  it("can fit the narrow column once it wraps", async () => {
    const el = await mount();
    const group = quantityGroup(el);

    const decrement = el.querySelector<HTMLButtonElement>('[aria-label="Decrease quantity"]')!;
    const increment = el.querySelector<HTMLButtonElement>('[aria-label="Increase quantity"]')!;

    const decrementPx = twSizeToPx(decrement.className, "w", TEXT_200.rootFontPx);
    const incrementPx = twSizeToPx(increment.className, "w", TEXT_200.rootFontPx);
    expect(decrementPx, "decrement must keep an explicit width").not.toBeNull();
    expect(incrementPx, "increment must keep an explicit width").not.toBeNull();

    const widestControl = Math.max(decrementPx!, incrementPx!);
    const unwrappedMinimum =
      decrementPx! +
      2 * TEXT_200.rootFontPx + // counter `min-w-8` at the 200% root
      incrementPx!;

    // Before the fix the group's minimum (240px) exceeded the column (118px),
    // which is the off-screen overflow the probe recorded.
    expect(unwrappedMinimum).toBeGreaterThan(TEXT_200_COLUMN_PX);
    // Wrapping drops the minimum to a single control, which fits.
    expect(group.className).toContain("flex-wrap");
    expect(widestControl).toBeLessThanOrEqual(TEXT_200_COLUMN_PX);
  });

  it("keeps both quantity controls, their target size, and the line total", async () => {
    const el = await mount();

    const decrement = el.querySelector<HTMLButtonElement>('[aria-label="Decrease quantity"]')!;
    const increment = el.querySelector<HTMLButtonElement>('[aria-label="Increase quantity"]')!;
    expect(decrement).not.toBeNull();
    expect(increment).not.toBeNull();
    // 44px minimum target (SC 2.5.8 floor is 24; the app's own standard is 44).
    expect(decrement.className).toContain("h-11 w-11");
    expect(increment.className).toContain("h-11 w-11");
    // The price must not be what got dropped to make room.
    expect(el.textContent).toContain("₹398");
  });

  it("keeps removal reachable at the same measure", async () => {
    const el = await mount();
    const remove = el.querySelector<HTMLButtonElement>(`[aria-label="Remove ${line.name}"]`);
    expect(remove).not.toBeNull();
    expect(remove!.className).toContain("h-11 w-11");
  });
});
