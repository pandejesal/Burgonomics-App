/** @vitest-environment jsdom */
/**
 * L4 — tip controls are the smallest, most-tapped controls in the tip row and
 * were 38px tall, under the 44px touch-target aim. jsdom has no layout, so the
 * height is asserted on the geometry token the component emits (same approach
 * as QuantityStepper.test.tsx). Fails against the pre-fix source (min-h-[38px]).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/services/haptics", () => ({
  HapticService: { selection: vi.fn(), impact: vi.fn() },
}));

import { DeliveryTipSelector } from "./DeliveryTipSelector";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const mount = async (ui: React.ReactElement) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
};

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

/** The horizontal tip row: presets + Custom live here (Clear Tip does not). */
const tipRowButtons = () =>
  Array.from(
    host!
      .querySelector<HTMLElement>("div.overflow-x-auto")!
      .querySelectorAll<HTMLButtonElement>("button"),
  );

describe("L4 — tip targets meet the 44px minimum", () => {
  it("renders every preset and the custom button at min-h-[44px]", async () => {
    await mount(<DeliveryTipSelector selectedTip={0} onSelectTip={vi.fn()} />);

    const controls = tipRowButtons();
    expect(controls.map((c) => c.textContent)).toEqual(["₹10", "₹20", "₹30", "₹50", "Custom"]);

    for (const control of controls) {
      expect(control.className).toContain("min-h-[44px]");
      expect(control.className).not.toContain("min-h-[38px]");
    }
  });

  it("keeps the raised target when a preset is the active selection", async () => {
    await mount(<DeliveryTipSelector selectedTip={20} onSelectTip={vi.fn()} />);

    const controls = tipRowButtons();
    expect(controls.length).toBe(5);
    for (const control of controls) {
      expect(control.className).toContain("min-h-[44px]");
      expect(control.className).not.toContain("min-h-[38px]");
    }
  });
});
