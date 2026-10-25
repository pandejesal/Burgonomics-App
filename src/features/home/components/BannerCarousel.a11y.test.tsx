/** @vitest-environment jsdom */
/**
 * L3 — carousel slides must be keyboard-activatable and the ~5s autoplay must
 * pause for user interaction and for `prefers-reduced-motion: reduce`.
 *
 * Pre-fix: the slide is a `<div onClick>` (no anchor/button ancestor → the
 * keyboard test fails) and the rotator ignores both hover/focus and the OS
 * motion preference (the reduced-motion test fails).
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => router.navigate,
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { selection: vi.fn(), impact: vi.fn() },
}));

import { BannerCarousel } from "./BannerCarousel";
import type { Banner } from "../models";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const banners: Banner[] = [
  {
    id: "b1",
    title: "Big Bang Meal",
    subtitle: "Two burgers, one price",
    ctaLabel: "Order Now",
    ctaHref: "/offers/big-bang",
    gradient: "bg-gradient-to-br from-[#B2452B] to-[#E06637] text-white",
    visual: "burger",
  },
  {
    id: "b2",
    title: "Peri Peri Week",
    subtitle: "Extra hot",
    ctaLabel: "Order Now",
    ctaHref: "/offers/peri-peri",
    gradient: "bg-gradient-to-br from-[#B2452B] to-[#E06637] text-white",
    visual: "chilli",
  },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let scrollTo: ReturnType<typeof vi.fn>;

const mount = async (ui: React.ReactElement) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
};

/** The interactive control each slide is (or should be) wrapped in. */
const slideControls = () =>
  Array.from(host!.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')).map(
    (slide) => slide.closest<HTMLElement>("a[href], button"),
  );

const stubReducedMotion = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn((query: string) => ({
      matches: matches && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
    writable: true,
  });
};

beforeEach(() => {
  // jsdom ships no layout engine: record and swallow the scroll call.
  scrollTo = vi.fn();
  Object.defineProperty(Element.prototype, "scrollTo", {
    value: scrollTo,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(Element.prototype, "scrollTo");
  Reflect.deleteProperty(Element.prototype, "setPointerCapture");
  Reflect.deleteProperty(Element.prototype, "releasePointerCapture");
  vi.clearAllMocks();
});

describe("L3 — carousel keyboard access and motion preferences", () => {
  it("renders each slide as a keyboard-activatable link with a real href", async () => {
    await mount(<BannerCarousel banners={banners} />);

    const controls = slideControls();
    expect(controls.length).toBe(2);
    for (const control of controls) {
      expect(control, "each slide must be a real link or button").not.toBeNull();
      expect(control?.tagName).toBe("A");
      expect(control?.getAttribute("href")).toBeTruthy();
      control?.focus();
      expect(document.activeElement).toBe(control);
    }
  });

  it("does not rotate when the user prefers reduced motion", async () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    await mount(<BannerCarousel banners={banners} />);

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("pauses rotation while a slide holds focus", async () => {
    vi.useFakeTimers();
    await mount(<BannerCarousel banners={banners} />);

    const control = slideControls()[0];
    expect(control).not.toBeNull();
    await act(async () => {
      control!.focus();
    });
    expect(document.activeElement).toBe(control);

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("still rotates by default (control test for the harness)", async () => {
    vi.useFakeTimers();
    await mount(<BannerCarousel banners={banners} />);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("does not follow the slide link after a horizontal drag, but a plain tap still navigates", async () => {
    await mount(<BannerCarousel banners={banners} />);

    const scroller = host!.querySelector<HTMLElement>(".snap-x")!;
    const link = slideControls()[0]!;
    const pointer = (type: string, x: number, y: number) =>
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });

    await act(async () => {
      scroller.dispatchEvent(pointer("pointerdown", 200, 100));
      scroller.dispatchEvent(pointer("pointermove", 100, 100));
      scroller.dispatchEvent(pointer("pointerup", 100, 100));
      link.dispatchEvent(pointer("click", 100, 100));
    });

    expect(router.navigate).not.toHaveBeenCalled();

    await act(async () => {
      link.dispatchEvent(pointer("click", 100, 100));
    });

    expect(router.navigate).toHaveBeenCalledWith({ to: "/offers/big-bang" });
  });
});
