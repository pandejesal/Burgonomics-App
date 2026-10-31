/** @vitest-environment jsdom */
/**
 * L2 — the loyalty redemption row must be a real switch with on/off state.
 *
 * Pre-fix the outer control was a clickable `<div>` and the only `role="switch"`
 * sat on a nested, non-interactive div with no `aria-checked`. These tests fail
 * against the pre-fix source (outer element is a DIV, `aria-checked` absent).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/services/haptics", () => ({
  HapticService: { selection: vi.fn(), impact: vi.fn() },
}));

import { GrillCoinsRedemption } from "./GrillCoinsRedemption";

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

const switchEl = () => host!.querySelector<HTMLButtonElement>('[role="switch"]')!;

describe("L2 — redemption control is a real switch", () => {
  it("exposes one native button[role=switch] that reports off and toggles on", async () => {
    const onToggleRedemption = vi.fn();
    await mount(
      <GrillCoinsRedemption
        availableCoins={250}
        subtotal={500}
        redeemedCoins={0}
        onToggleRedemption={onToggleRedemption}
      />,
    );

    // Exactly one switch: no nested fake role on the decorative track.
    expect(host!.querySelectorAll('[role="switch"]').length).toBe(1);

    const control = switchEl();
    expect(control.tagName).toBe("BUTTON");
    expect(control.type).toBe("button");
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(control.getAttribute("aria-label")).toBe("Redeem Loyalty Points");

    // Keyboard users can reach it.
    control.focus();
    expect(document.activeElement).toBe(control);

    await act(async () => control.click());
    expect(onToggleRedemption).toHaveBeenCalledTimes(1);
    // 20% of the ₹500 subtotal, capped by the 250-point balance.
    expect(onToggleRedemption).toHaveBeenCalledWith(true, 100);
  });

  it("reports on when the redemption is already applied", async () => {
    await mount(
      <GrillCoinsRedemption
        availableCoins={250}
        subtotal={500}
        redeemedCoins={100}
        onToggleRedemption={vi.fn()}
      />,
    );

    const control = switchEl();
    expect(control.tagName).toBe("BUTTON");
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("marks the control aria-disabled when nothing is redeemable", async () => {
    const onToggleRedemption = vi.fn();
    await mount(
      <GrillCoinsRedemption
        availableCoins={250}
        subtotal={0}
        redeemedCoins={0}
        onToggleRedemption={onToggleRedemption}
      />,
    );

    const control = switchEl();
    expect(control.getAttribute("aria-disabled")).toBe("true");
    await act(async () => control.click());
    expect(onToggleRedemption).not.toHaveBeenCalled();
  });
});
