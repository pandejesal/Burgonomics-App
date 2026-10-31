/** @vitest-environment jsdom */
/**
 * L1 — modifier options must be real, keyboard-operable controls.
 *
 * Pre-fix each option was a `<div onClick>` with no role, tabIndex or key
 * handler: unreachable by Tab and invisible to AT as a selectable control.
 * These tests fail against the pre-fix source (no [role=radio]/[role=checkbox]
 * at all) and pass once the options are native buttons that expose
 * `aria-checked`.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// Browser-bound collaborator: the selector stays hermetic (no Capacitor bridge).
vi.mock("@/core/services/haptics", () => ({
  HapticService: { selection: vi.fn(), impact: vi.fn() },
}));

import { ModifierGroupSelector } from "./ModifierGroupSelector";
import type { CustomizationGroup } from "../models";

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

const singleGroup: CustomizationGroup = {
  id: "grp_bun",
  name: "Choose Bun",
  required: true,
  selection: "single",
  options: [
    { id: "opt_brioche", name: "Brioche Bun", priceDelta: 0 },
    { id: "opt_gluten", name: "Gluten-Free Bun", priceDelta: 40 },
    { id: "opt_charcoal", name: "Charcoal Bun", priceDelta: 30, outOfStock: true },
  ],
};

const multiGroup: CustomizationGroup = {
  id: "grp_cheese",
  name: "Toppings",
  selection: "multi",
  maxSelect: 3,
  options: [
    { id: "opt_cheddar", name: "Extra Cheddar", priceDelta: 35 },
    { id: "opt_jalapenos", name: "Pickled Jalapeños", priceDelta: 25 },
  ],
};

const radios = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
const checkboxes = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'));

describe("L1 — modifier options are real, keyboard-operable controls", () => {
  it("renders single-choice options as focusable radios that expose aria-checked", async () => {
    await mount(
      <ModifierGroupSelector
        group={singleGroup}
        selectedOptionIds={["opt_brioche"]}
        onToggleOption={vi.fn()}
      />,
    );

    const group = host!.querySelector<HTMLElement>('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(group!.getAttribute("aria-label")).toBe("Choose Bun");

    const options = radios();
    expect(options.length).toBe(3);
    expect(options.map((o) => o.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    for (const option of options) {
      // A native <button> is focusable and Enter/Space-activatable by the platform.
      expect(option.tagName).toBe("BUTTON");
      expect(option.type).toBe("button");
    }

    // Reachable by Tab, not merely by pointer or script.
    options[0].focus();
    expect(document.activeElement).toBe(options[0]);
  });

  it("renders multi-choice options as checkboxes with per-option checked state", async () => {
    await mount(
      <ModifierGroupSelector
        group={multiGroup}
        selectedOptionIds={["opt_cheddar"]}
        onToggleOption={vi.fn()}
      />,
    );

    const options = checkboxes();
    expect(options.length).toBe(2);
    expect(options[0].getAttribute("aria-checked")).toBe("true");
    expect(options[1].getAttribute("aria-checked")).toBe("false");
    expect(options.every((o) => o.tagName === "BUTTON")).toBe(true);
  });

  it("reports exactly one toggle when an option is activated", async () => {
    const onToggleOption = vi.fn();
    await mount(
      <ModifierGroupSelector
        group={multiGroup}
        selectedOptionIds={[]}
        onToggleOption={onToggleOption}
      />,
    );

    const options = checkboxes();
    await act(async () => options[1].click());

    expect(onToggleOption).toHaveBeenCalledTimes(1);
    expect(onToggleOption).toHaveBeenCalledWith("grp_cheese", "opt_jalapenos");
  });

  it("keeps the out-of-stock option non-activatable", async () => {
    const onToggleOption = vi.fn();
    await mount(
      <ModifierGroupSelector
        group={singleGroup}
        selectedOptionIds={[]}
        onToggleOption={onToggleOption}
      />,
    );

    const charcoal = radios()[2];
    expect(charcoal.disabled).toBe(true);
    await act(async () => charcoal.click());
    expect(onToggleOption).not.toHaveBeenCalled();
  });
});
