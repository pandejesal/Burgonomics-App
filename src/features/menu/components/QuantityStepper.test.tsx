/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Browser-bound collaborator: the stepper stays hermetic (no Capacitor bridge).
vi.mock("@/core/services/haptics", () => ({ HapticService: { impact: vi.fn() } }));

import { QuantityStepper } from "./QuantityStepper";
import { HapticService } from "@/core/services/haptics";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const mount = async (ui: React.ReactElement) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
};

const buttons = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('[role="group"] button'));
const minus = () => buttons()[0];
const plus = () => buttons()[1];

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("B04: QuantityStepper markup, 44px targets and range", () => {
  it("renders a labelled group with 44px +/- targets and a wrapping container", async () => {
    await mount(<QuantityStepper value={5} onChange={vi.fn()} />);

    const group = host!.querySelector<HTMLElement>('[role="group"]')!;
    expect(group).not.toBeNull();
    expect(group.getAttribute("aria-label")).toBe("Quantity");
    // Wraps rather than pushing horizontal overflow in a narrow 320px column.
    expect(group.className).toContain("flex-wrap");

    const [dec, inc] = buttons();
    expect(dec.getAttribute("aria-label")).toBe("Decrease quantity");
    expect(inc.getAttribute("aria-label")).toBe("Increase quantity");
    // Geometry tokens: h-11/w-11 === 44px (SC 2.5.5 aim, above the 24px floor).
    expect(dec.className).toContain("h-11");
    expect(dec.className).toContain("w-11");
    expect(dec.className).toContain("min-h-[44px]");
    expect(dec.className).toContain("min-w-[44px]");
    expect(inc.className).toContain("min-h-[44px]");
    expect(inc.className).toContain("min-w-[44px]");

    const value = group.querySelector<HTMLElement>('[aria-live="polite"]')!;
    expect(value.getAttribute("aria-atomic")).toBe("true");
    expect(value.textContent).toBe("5");
  });

  it("disables exactly at the min and max bounds", async () => {
    const onChange = vi.fn();
    await mount(<QuantityStepper value={1} onChange={onChange} min={1} max={3} />);

    expect(minus().disabled).toBe(true);
    expect(plus().disabled).toBe(false);

    await act(async () => root!.render(<QuantityStepper value={3} onChange={onChange} min={1} max={3} />));
    expect(minus().disabled).toBe(false);
    expect(plus().disabled).toBe(true);
  });

  it("never reports a quantity outside min..max and fires haptics on a legal step", async () => {
    const onChange = vi.fn();
    await mount(<QuantityStepper value={1} onChange={onChange} min={1} max={3} />);

    // At the floor: no change, no haptic.
    await act(async () => minus().click());
    expect(onChange).not.toHaveBeenCalled();
    expect(HapticService.impact).not.toHaveBeenCalled();

    await act(async () => plus().click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2);
    expect(HapticService.impact).toHaveBeenCalledWith("light");

    // At the ceiling: no change.
    await act(async () => root!.render(<QuantityStepper value={3} onChange={onChange} min={1} max={3} />));
    await act(async () => plus().click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith(4);
  });

  it("stays in sync with the value it is given", async () => {
    const onChange = vi.fn();
    await mount(<QuantityStepper value={7} onChange={onChange} />);
    expect(host!.querySelector('[role="group"] [aria-live="polite"]')!.textContent).toBe("7");
    expect(minus().disabled).toBe(false);
    expect(plus().disabled).toBe(false);
  });
});
