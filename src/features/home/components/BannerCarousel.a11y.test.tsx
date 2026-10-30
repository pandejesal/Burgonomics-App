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
  vi.clearAllMocks();
});

describe("L3 — carousel keyboard access and motion preferences", () => {
  it("gives the top promo a larger image area without a fixed text-clipping height", async () => {
    await mount(<BannerCarousel banners={banners} />);
    const slide = host!.querySelector('[aria-roledescription="slide"]')!;
    expect(slide.className).toContain("min-h-[180px]");
    expect(slide.className).toContain("aspect-[2/1]");
    expect(slide.classList.contains("h-[180px]")).toBe(false);
  });

  it("keeps a dark foreground on the white promo badge in dark mode", async () => {
    await mount(<BannerCarousel banners={banners} />);
    const badges = host!.querySelectorAll<HTMLElement>('[aria-roledescription="slide"] span');
    expect(badges.length).toBe(banners.length);
    for (const badge of badges) {
      expect(badge.classList.contains("bg-white/95")).toBe(true);
      expect(badge.classList.contains("dark:text-text-inverse")).toBe(true);
    }
  });

  it("opens a changed banner set at zero rather than retaining a partial native offset", async () => {
    let offset = 17;
    Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
      configurable: true,
      get: () => offset,
      set: (value: number) => { offset = value; },
    });
    try {
      await mount(<BannerCarousel banners={banners} />);
      expect(offset).toBe(0);
      offset = 23;
      await act(async () => root!.render(<BannerCarousel banners={[{ ...banners[0], id: "new-first" }, banners[1]]} />));
      expect(offset).toBe(0);
      expect(slideControls()[0]?.className).toContain("snap-start");
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollLeft");
    }
  });

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

  it("uses instant button scrolling when reduced motion is requested", async () => {
    stubReducedMotion(true);
    await mount(<BannerCarousel banners={banners} />);
    const scroller = host!.querySelector<HTMLElement>('[aria-roledescription="slide"]')!
      .parentElement!.parentElement!;
    Object.defineProperty(scroller, "clientWidth", { value: 300, configurable: true });

    await act(async () => {
      host!.querySelector<HTMLButtonElement>('button[aria-label="Go to banner 2"]')!.click();
    });

    expect(scrollTo).toHaveBeenCalledWith({ left: 300, behavior: "auto" });
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
});

describe("banner gesture contracts — native touch/pen and mouse-only dragging", () => {
  const scroller = () =>
    host!.querySelector<HTMLElement>('[aria-roledescription="slide"]')!.parentElement!
      .parentElement!;

  let setCapture: ReturnType<typeof vi.fn>;
  let releaseCapture: ReturnType<typeof vi.fn>;
  const scrollPositions = new WeakMap<Element, number>();
  const scrollWrites: number[] = [];

  // These synthetic events pin JS ownership only, not actual native panning or snap.
  const pointer = async (
    el: HTMLElement,
    type: string,
    x: number,
    y: number,
    pointerType: "mouse" | "touch" | "pen",
  ) => {
    const event = new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    await act(async () => {
      el.dispatchEvent(event);
    });
    return event;
  };

  const click = async (el: HTMLElement, detail = 1) => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail });
    await act(async () => { el.dispatchEvent(event); });
    return event;
  };

  const setSlideWidth = (el: HTMLElement, width = 300) => {
    Object.defineProperty(el, "clientWidth", { value: width, configurable: true });
  };

  beforeEach(() => {
    scrollWrites.length = 0;
    const capturedPointers = new Set<number>();
    setCapture = vi.fn((id: number) => { capturedPointers.add(id); });
    releaseCapture = vi.fn((id: number) => { capturedPointers.delete(id); });
    Object.defineProperty(Element.prototype, "setPointerCapture", {
      value: setCapture,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(Element.prototype, "releasePointerCapture", {
      value: releaseCapture,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(Element.prototype, "hasPointerCapture", {
      value: (id: number) => capturedPointers.has(id),
      configurable: true,
      writable: true,
    });
    // jsdom has no layout, so scrollLeft would not retain writes; keep a real
    // backing store so the drag arithmetic is observable.
    Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
      get(this: HTMLElement) {
        return scrollPositions.get(this) ?? 0;
      },
      set(this: HTMLElement, value: number) {
        scrollWrites.push(value);
        scrollPositions.set(this, value);
      },
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "setPointerCapture");
    Reflect.deleteProperty(Element.prototype, "releasePointerCapture");
    Reflect.deleteProperty(Element.prototype, "hasPointerCapture");
    Reflect.deleteProperty(HTMLElement.prototype, "scrollLeft");
  });

  it("allows both native axes and pinch zoom while preserving y-axis scroll chaining", async () => {
    await mount(<BannerCarousel banners={banners} />);
    // This pins the override, not real scrolling: jsdom does not apply our CSS
    // utility or perform touch panning. Physical-device replay is still needed.
    expect(scroller().style.overscrollBehaviorY).toBe("auto");
    expect(scroller().style.touchAction).toBe("auto");
    expect(scroller().classList.contains("scroll-smooth")).toBe(false);
  });

  it.each(["touch", "pen"] as const)("never captures or writes scroll position for native %s gestures", async (pointerType) => {
    await mount(<BannerCarousel banners={banners} />);
    const el = scroller();
    el.scrollLeft = 100;
    scrollWrites.length = 0;
    for (const [x, y] of [[80, 14], [14, 80]]) {
      const down = await pointer(el, "pointerdown", 10, 10, pointerType);
      const move = await pointer(el, "pointermove", x, y, pointerType);
      await pointer(el, "pointerup", x, y, pointerType);
      await pointer(el, "pointercancel", x, y, pointerType);
      expect(down.defaultPrevented).toBe(false);
      expect(move.defaultPrevented).toBe(false);
    }
    expect(setCapture).not.toHaveBeenCalled();
    expect(releaseCapture).not.toHaveBeenCalled();
    expect(scrollWrites).toEqual([]);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(el.style.scrollSnapType).toBe("");
  });

  it("updates the active dot from the browser's scroll event without driving native scrolling", async () => {
    await mount(<BannerCarousel banners={banners} />);
    const el = scroller();
    setSlideWidth(el);
    el.scrollLeft = 300; // Simulate a browser-reported position, not a touch implementation.
    scrollWrites.length = 0;
    await act(async () => { el.dispatchEvent(new Event("scroll")); });
    expect(host!.querySelector('button[aria-label="Go to banner 2"]')?.getAttribute("aria-selected")).toBe("true");
    expect(scrollWrites).toEqual([]);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not capture a mouse press or small movement before horizontal drag intent", async () => {
    await mount(<BannerCarousel banners={banners} />);
    const el = scroller();
    await pointer(el, "pointerdown", 10, 10, "mouse");
    await pointer(el, "pointermove", 15, 12, "mouse");
    expect(setCapture).not.toHaveBeenCalled();
    expect(scrollWrites).toEqual([]);
    expect(el.style.scrollSnapType).toBe("");
  });

  it("does not turn a vertical mouse movement into a carousel drag", async () => {
    await mount(<BannerCarousel banners={banners} />);
    const el = scroller();
    el.scrollLeft = 100;
    scrollWrites.length = 0;

    await pointer(el, "pointerdown", 10, 10, "mouse");
    await pointer(el, "pointermove", 14, 80, "mouse");
    await pointer(el, "pointerup", 14, 80, "mouse");

    expect(setCapture).not.toHaveBeenCalled();
    expect(scrollWrites).toEqual([]);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(el.scrollLeft).toBe(100);
  });

  it("captures confirmed mouse dragging, suspends snap, then restores and snaps on release", async () => {
    await mount(<BannerCarousel banners={banners} />);
    const el = scroller();
    setSlideWidth(el);
    el.scrollLeft = 100;
    scrollWrites.length = 0;

    await pointer(el, "pointerdown", 10, 10, "mouse");
    await pointer(el, "pointermove", 70, 14, "mouse");

    expect(setCapture).toHaveBeenCalledWith(1);
    expect(el.style.scrollSnapType).toBe("none");
    expect(scrollWrites).toEqual([40]);
    expect(el.scrollLeft).toBe(40);

    await pointer(el, "pointerup", 70, 14, "mouse");
    expect(releaseCapture).toHaveBeenCalledWith(1);
    expect(el.style.scrollSnapType).toBe("");
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "smooth" });
  });

  it("restores snap on mouse cancellation and respects reduced motion when settling", async () => {
    stubReducedMotion(true);
    await mount(<BannerCarousel banners={banners} />);
    const el = scroller();
    setSlideWidth(el);
    await pointer(el, "pointerdown", 100, 10, "mouse");
    await pointer(el, "pointermove", 40, 14, "mouse");
    expect(el.style.scrollSnapType).toBe("none");
    await pointer(el, "pointercancel", 40, 14, "mouse");
    expect(el.style.scrollSnapType).toBe("");
    expect(releaseCapture).toHaveBeenCalledWith(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "auto" });
  });

  it("suppresses the click after a real mouse drag, but permits the next actual tap", async () => {
    await mount(<BannerCarousel banners={banners} />);
    const el = scroller();
    const link = slideControls()[0]!;
    setSlideWidth(el);
    await pointer(link, "pointerdown", 100, 10, "mouse");
    await pointer(el, "pointermove", 40, 14, "mouse");
    await pointer(el, "pointerup", 40, 14, "mouse");
    const draggedClick = await click(link);
    expect(draggedClick.defaultPrevented).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();

    await pointer(link, "pointerdown", 20, 10, "mouse");
    await pointer(link, "pointerup", 20, 10, "mouse");
    await click(link);
    expect(router.navigate).toHaveBeenCalledWith({ to: banners[0].ctaHref });
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it("does not suppress keyboard activation after mouse dragging", async () => {
    await mount(<BannerCarousel banners={banners} />);
    const el = scroller();
    const link = slideControls()[0]!;
    await pointer(link, "pointerdown", 100, 10, "mouse");
    await pointer(el, "pointermove", 40, 14, "mouse");
    await pointer(el, "pointerup", 40, 14, "mouse");
    await click(link, 0); // Keyboard-generated click contract; jsdom does not synthesize Enter.
    expect(link.getAttribute("href")).toBe(banners[0].ctaHref);
    expect(router.navigate).toHaveBeenCalledWith({ to: banners[0].ctaHref });
  });

  it.each(["touch", "pen"] as const)("retains link activation for a %s tap without dragging in JS", async (pointerType) => {
    await mount(<BannerCarousel banners={banners} />);
    const link = slideControls()[0]!;
    await pointer(link, "pointerdown", 100, 10, pointerType);
    await pointer(link, "pointerup", 100, 10, pointerType);
    await click(link);
    expect(link.getAttribute("href")).toBe(banners[0].ctaHref);
    expect(router.navigate).toHaveBeenCalledWith({ to: banners[0].ctaHref });
    expect(setCapture).not.toHaveBeenCalled();
    expect(scrollWrites).toEqual([]);
  });
});
