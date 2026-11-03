/**
 * Live UI finding 9: the notification switches on /profile/settings rendered at
 * 36x20 with no larger hit area — below the WCAG 2.2 AA 24x24 minimum and far
 * below the 44x44 touch aim.
 *
 * The fix must not resize the designed track, so it expands the interactive
 * region with a transparent ::before pseudo-element. A jsdom test cannot measure
 * layout, so this asserts the mechanism is present and, crucially, that the
 * track classes were not changed into something bigger (which would break the
 * settings layout).
 */
/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Switch } from "./switch";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(<Switch aria-label="Push notifications" defaultChecked />);
  });
  await act(async () => {});
  return container.querySelector('[role="switch"]') as HTMLElement;
}

describe("Switch touch target", () => {
  it("expands the interactive region to 44x44 without resizing the track", async () => {
    const el = await render();
    const cls = el.className;

    // The visual track is unchanged (h-5 = 20px, w-9 = 36px).
    expect(cls).toMatch(/\bh-5\b/);
    expect(cls).toMatch(/\bw-9\b/);

    // The hit area is expanded by a centred pseudo-element.
    expect(cls).toContain("before:absolute");
    expect(cls).toContain("before:h-11");
    expect(cls).toContain("before:w-11"); // 11 * 0.25rem = 44px
    expect(cls).toContain("before:-translate-x-1/2");
    expect(cls).toContain("before:-translate-y-1/2");
  });

  it("keeps the element relatively positioned so the pseudo-element anchors to it", async () => {
    const el = await render();
    expect(el.className).toMatch(/\brelative\b/);
  });

  it("keeps its switch semantics and accessible name", async () => {
    const el = await render();
    expect(el.getAttribute("role")).toBe("switch");
    expect(el.getAttribute("aria-label")).toBe("Push notifications");
    expect(el.getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the focus ring so the expanded target stays discoverable", async () => {
    const el = await render();
    expect(el.className).toContain("focus-visible:ring-2");
    expect(el.className).toContain("focus-visible:ring-offset-2");
  });
});
