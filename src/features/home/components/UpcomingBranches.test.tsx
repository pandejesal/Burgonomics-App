/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeAnnouncements } from "./HomeAnnouncements";
import { approvedHomeContent } from "../approvedHomeContent";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | null = null;
let host: HTMLDivElement;
let motion: MediaQueryList;
const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  motion = Object.assign(new EventTarget(), {
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }) as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => motion),
  );
  vi.stubGlobal("IntersectionObserver", undefined);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (hiddenDescriptor) Object.defineProperty(document, "hidden", hiddenDescriptor);
  else Reflect.deleteProperty(document, "hidden");
});
async function mount(single = false) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <HomeAnnouncements
        content={{
          awards: [],
          upcomingStores: single
            ? approvedHomeContent.upcomingStores.slice(0, 1)
            : approvedHomeContent.upcomingStores,
        }}
      />,
    ),
  );
}
const selected = () => host.querySelector('li[data-active="true"]')?.textContent;
async function tick(ms = 6000) {
  await act(async () => vi.advanceTimersByTime(ms));
}
async function arrow(key: "ArrowLeft" | "ArrowRight") {
  await act(async () =>
    host.querySelector("ul")!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
  );
}
function pointerEvent(type: string, pointerType: string) {
  return Object.assign(new Event(type, { bubbles: true }), { pointerType });
}

describe("Upcoming Branches horizontal rotation", () => {
  // The content itself is pinned by approvedHomeContent.test.ts. Here it is the
  // FIXTURE, so rotation/wrap/pause behaviour is exercised against whatever the
  // owner approved rather than a copy of the old list (Hydrogen, 28 Nov 2026:
  // the hardcoded "8" and the Gor Dhod Road / Vallabh Vidhyanagar names made a
  // legitimate content edit look like nine behavioural regressions).
  const stores = approvedHomeContent.upcomingStores;
  const first = stores[0].name;
  const second = stores[1].name;
  const last = stores[stores.length - 1].name;
  it("keeps every approved announcement in a horizontal strip, without order/store actions", async () => {
    await mount();
    const list = host.querySelector("ul")!;
    expect(list.className).toContain("flex");
    expect(list.className).toContain("overflow-x-auto");
    expect(list.children).toHaveLength(stores.length);
    for (const store of approvedHomeContent.upcomingStores) {
      expect(list.textContent).toContain(store.name);
      expect(list.textContent).toContain(store.location);
      expect(list.textContent).toContain(store.openingText);
    }
    expect(host.querySelector("a, form, input")).toBeNull();
    expect(host.textContent).not.toContain("Announced openings");
    expect(host.textContent).not.toContain("not yet orderable");
    expect(host.querySelector("button")).toBeNull();
    expect(list.parentElement!.className).not.toMatch(/\bborder-(?:y|b)\b/);
    expect(list.getAttribute("aria-live")).toBe("off");
    expect(host.textContent).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
    expect(host.querySelector(`[aria-label="Branch 1 of ${stores.length}"]`)).toBeNull();
  });

  it("advances after six seconds and wraps without dropping announcements", async () => {
    await mount();
    expect(selected()).toContain(first);
    await tick(5999);
    expect(selected()).toContain(first);
    await tick(1);
    expect(selected()).toContain(second);
    for (let i = 0; i < stores.length - 1; i++) await tick();
    expect(selected()).toContain(first);
  });

  it("keeps touch-to-pause and keyboard browsing without a visible control strip", async () => {
    await mount();
    await act(async () =>
      host.querySelector("ul")!.dispatchEvent(new Event("pointerdown", { bubbles: true })),
    );
    await tick(18000);
    expect(selected()).toContain(first);
    await arrow("ArrowLeft");
    expect(selected()).toContain(last);
    await arrow("ArrowRight");
    expect(selected()).toContain(first);
    await tick();
    expect(selected()).toContain(first);
    expect(host.querySelector("button")).toBeNull();
  });

  it("stops for keyboard focus and supports horizontal arrow navigation", async () => {
    await mount();
    const list = host.querySelector("ul")!;
    await act(async () => list.focus());
    await tick();
    expect(selected()).toContain(first);
    await act(async () =>
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(selected()).toContain(second);
    await tick();
    expect(selected()).toContain(second);
  });

  it("temporarily pauses on hover and stops persistently on a touch gesture", async () => {
    await mount();
    const section = host.querySelector("section")!;
    await act(async () => {
      section.dispatchEvent(pointerEvent("pointerover", "mouse"));
      section.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await tick();
    expect(selected()).toContain(first);
    await act(async () => {
      section.dispatchEvent(
        Object.assign(pointerEvent("pointerout", "mouse"), { relatedTarget: document.body }),
      );
      section.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    await tick();
    expect(selected()).toContain(second);
    await act(async () =>
      host.querySelector("ul")!.dispatchEvent(new Event("pointerdown", { bubbles: true })),
    );
    await tick();
    expect(selected()).toContain(second);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not resume unexpectedly after touch emits compatibility mouse events", async () => {
    await mount();
    const section = host.querySelector("section")!;
    await act(async () => {
      section.dispatchEvent(pointerEvent("pointerover", "touch"));
      section.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      host.querySelector("ul")!.dispatchEvent(pointerEvent("pointerdown", "touch"));
    });
    await tick();
    expect(selected()).toContain(first);
    await arrow("ArrowRight");
    expect(selected()).toContain(second);
    await tick(18000);
    expect(selected()).toContain(second);
    expect(host.querySelector("button")).toBeNull();
  });

  it("leaves vertical swipe chaining to Home while containing horizontal overscroll", async () => {
    await mount();
    expect(host.querySelector("ul")!.style.overscrollBehaviorY).toBe("auto");
  });

  it("does not rotate offscreen and disconnects its visibility observer", async () => {
    let notify: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    await mount();
    await act(async () =>
      notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
    await tick();
    expect(selected()).toContain(first);
    await act(async () =>
      notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
    await tick();
    expect(selected()).toContain(second);
    await act(async () => root!.unmount());
    root = null;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not autoplay for reduced motion, including a changed OS preference", async () => {
    Object.assign(motion, { matches: true });
    await mount();
    await tick(18000);
    expect(selected()).toContain(first);
    expect(vi.getTimerCount()).toBe(0);
    await arrow("ArrowRight");
    expect(selected()).toContain(second);
    await act(async () => {
      Object.assign(motion, { matches: false });
      motion.dispatchEvent(new Event("change"));
    });
    await tick();
    expect(selected()).toContain(second);
    await act(async () => {
      Object.assign(motion, { matches: true });
      motion.dispatchEvent(new Event("change"));
    });
    await tick();
    expect(selected()).toContain(second);
  });

  it("pauses while the page is hidden and clears its timer on unmount", async () => {
    await mount();
    await act(async () => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await tick();
    expect(selected()).toContain(first);
    await act(async () => root!.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not add controls or timers for one announcement", async () => {
    await mount(true);
    expect(host.querySelector("button")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
