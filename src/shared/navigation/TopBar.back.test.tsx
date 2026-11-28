/** @vitest-environment jsdom */
/**
 * UX audit 2026-11-26, Customer High #5.
 *
 * The 44px back control used to be a `<Link to={backTo}>`, which PUSHED a new
 * entry. The Android hardware handler pops with `window.history.back()`, so a
 * tap left a second copy of the previous screen on the stack. Here the same
 * control must pop when in-app history exists, and only fall back to a
 * replace-navigation to the parent route on a cold start / deep link.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const linkNavigations: Array<{ to: string; replace: boolean }> = [];

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, replace, onClick, children, className, "aria-label": label }: any) => (
    <a
      href="#"
      className={className}
      aria-label={label}
      data-to={to}
      data-replace={String(replace)}
      onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        // Mirrors TanStack's composeHandlers: its own navigation is skipped
        // when the consumer called preventDefault.
        if (!event.defaultPrevented) linkNavigations.push({ to, replace: replace === true });
      }}
    >
      {children}
    </a>
  ),
}));

import { TopBar } from "./TopBar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<TopBar title="Checkout" backTo="/cart" />);
  });
  return container.querySelector('a[aria-label="Go back"]') as HTMLAnchorElement;
}

beforeEach(() => {
  linkNavigations.length = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

describe("TopBar back control", () => {
  it("pops in-app history instead of pushing the parent route", () => {
    window.history.replaceState({ __TSR_index: 2 }, "", "/cart");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const control = render();

    act(() => {
      control.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    expect(back).toHaveBeenCalledTimes(1);
    expect(linkNavigations).toEqual([]);
  });

  it("falls back to a replace navigation to the parent when there is no history", () => {
    window.history.replaceState({ __TSR_index: 0 }, "", "/");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const control = render();

    act(() => {
      control.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    expect(back).not.toHaveBeenCalled();
    expect(linkNavigations).toEqual([{ to: "/cart", replace: true }]);
  });
});
