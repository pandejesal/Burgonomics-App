/** @vitest-environment jsdom */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HorizontalRail } from "./HorizontalRail";

vi.mock("@/core/services/haptics", () => ({ HapticService: { selection: vi.fn() } }));

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(ui: React.ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(ui));
  return { container, root };
}

describe("HorizontalRail vertical panning", () => {
  it("keeps horizontal overscroll contained but leaves Y to the document", async () => {
    const { container, root } = await mount(
      <HorizontalRail ariaLabel="Best selling items">
        <div>Card</div>
      </HorizontalRail>,
    );
    const rail = container.querySelector<HTMLElement>('[aria-label="Best selling items"]')!;
    expect(rail).not.toBeNull();

    // X stays contained so a rail fling cannot drag the page sideways.
    expect(rail.className).toContain("overscroll-x-contain");

    // Y must NOT be contained. `overflow-x: auto` makes this element a
    // vertical scrollport too, so `overscroll-behavior-y: contain` stopped a
    // vertical drag from ever chaining to the document: the page did not
    // scroll when the finger started on a home rail.
    expect(rail.style.overscrollBehaviorY).toBe("auto");

    await act(async () => root.unmount());
  });

  it("still declares touch-action: pan-y so the browser owns vertical panning", async () => {
    const { container, root } = await mount(
      <HorizontalRail ariaLabel="Popular combos">
        <div>Card</div>
      </HorizontalRail>,
    );
    const rail = container.querySelector<HTMLElement>('[aria-label="Popular combos"]')!;
    expect(rail.className).toContain("touch-pan-y");
    await act(async () => root.unmount());
  });
});
