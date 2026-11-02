/** @vitest-environment jsdom */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryNavRail } from "./CategoryNavRail";

vi.mock("@/core/services/haptics", () => ({ HapticService: { selection: vi.fn() } }));

const categories = [
  { id: "first", name: "First" },
  { id: "middle", name: "Middle" },
  { id: "last", name: "Last" },
];
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("category rail alignment", () => {
  it("centres only the rail, provides end space, and does not fight manual scrolling on re-render", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(580);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return 130 + categories.findIndex((c) => c.id === this.dataset.categoryId) * 110;
    });
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scroll });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const select = vi.fn();
    await act(async () =>
      root.render(
        <CategoryNavRail
          categories={categories}
          activeCategoryId="middle"
          onSelectCategory={select}
        />,
      ),
    );
    const rail = container.querySelector<HTMLElement>('nav[aria-label="Menu categories"]')!;
    expect(rail).not.toBeNull();
    expect(rail.style.paddingLeft).toBe("130px");
    expect(rail.style.paddingRight).toBe("130px");
    expect(scroll).toHaveBeenLastCalledWith({ left: 110, behavior: "instant" });
    scroll.mockClear();
    rail.scrollLeft = 20;
    await act(async () =>
      root.render(
        <CategoryNavRail
          categories={[...categories]}
          activeCategoryId="middle"
          onSelectCategory={select}
        />,
      ),
    );
    expect(scroll).not.toHaveBeenCalled();
    await act(async () =>
      root.render(
        <CategoryNavRail
          categories={categories}
          activeCategoryId="last"
          onSelectCategory={select}
        />,
      ),
    );
    expect(scroll).toHaveBeenLastCalledWith({ left: 220, behavior: "smooth" });
    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });

  it("is navigation, not a tab set: chips expose aria-current and a non-colour marker", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(580);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(130);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const select = vi.fn();
    await act(async () =>
      root.render(
        <CategoryNavRail
          categories={[{ id: "a", name: "Burgers", itemCount: 12 }, ...categories]}
          activeCategoryId="a"
          onSelectCategory={select}
        />,
      ),
    );

    // No tablist / tab roles: every section stays in the page.
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('[role="tab"]')).toBeNull();

    const active = container.querySelector<HTMLButtonElement>('[data-category-id="a"]')!;
    expect(active.getAttribute("aria-current")).toBe("true");
    expect(active.querySelector('[data-testid="category-rail-active-marker"]')).not.toBeNull();
    // The accessible name carries the state and the real count.
    expect(active.getAttribute("aria-label")).toBe("Current category: Burgers, 12 items");
    // Unselected chips are links, not "aria-selected" tabs.
    const other = container.querySelector<HTMLButtonElement>('[data-category-id="middle"]')!;
    expect(other.hasAttribute("aria-current")).toBe(false);
    expect(other.getAttribute("aria-label")).toBe("Jump to Middle");

    await act(async () => other.click());
    expect(select).toHaveBeenCalledWith("middle");
    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });

  it("lets a vertical swipe pan the page instead of trapping it in the chip row", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(580);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(130);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <CategoryNavRail
          categories={categories}
          activeCategoryId="middle"
          onSelectCategory={vi.fn()}
        />,
      ),
    );

    const rail = container.querySelector<HTMLElement>('nav[aria-label="Menu categories"]')!;
    // `touch-action: pan-x` used to forbid vertical panning outright, so a
    // swipe that began on a chip never scrolled the menu page.
    expect(rail.className).not.toContain("touch-pan-x");
    // X stays contained; Y chains to the document scrollport.
    expect(rail.className).toContain("overscroll-x-contain");
    expect(rail.style.overscrollBehaviorY).toBe("auto");

    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });
});

/**
 * The selected chip's underline marker is a 2px white bar. It used to sit at
 * `-bottom-px`, i.e. flush with the bottom of a `rounded-full` pill, so the
 * white bar replaced the pill's green curved base with a flat white strip that
 * read as the fill "not covering" the pill.
 *
 * These are the class-level pins; the real geometry (marker bottom >= 2 CSS px
 * inside the button) is asserted against Chromium in
 * tests/playwright/ui-category-pill-marker.spec.ts, because jsdom has no layout
 * and returns 0 for every rect.
 */
describe("selected chip marker geometry (classes)", () => {
  async function mountRail(activeCategoryId: string, cats = categories) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(580);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(130);
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <CategoryNavRail
          categories={cats}
          activeCategoryId={activeCategoryId}
          onSelectCategory={vi.fn()}
        />,
      ),
    );
    return { container, root };
  }

  function buttons(container: HTMLElement) {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Menu categories"] button'),
    );
  }

  it("pulls the marker inside the pill instead of hanging on its bottom edge", async () => {
    const { container, root } = await mountRail("middle");
    const marker = container.querySelector<HTMLElement>(
      '[data-testid="category-rail-active-marker"]',
    )!;
    expect(marker).not.toBeNull();

    const tokens = marker.className.split(/\s+/);
    // The pill's border-radius curves away under the last pixels of its box;
    // a marker sitting at -1px paints a flat white strip across that curve.
    expect(tokens).not.toContain("-bottom-px");
    expect(tokens, "marker must sit inside the pill, not on its edge").toContain("bottom-1");

    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });

  it("clips the marker to the pill so it can never paint outside the fill", async () => {
    const { container, root } = await mountRail("middle");
    for (const button of buttons(container)) {
      // Every chip clips, selected or not: the marker is only rendered on the
      // active one, but a mismatch would reintroduce the artefact on selection.
      expect(
        button.className.split(/\s+/),
        `${button.dataset.categoryId} must clip to its rounded box`,
      ).toContain("overflow-hidden");
    }
    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });

  it("keeps the non-colour selection cue and aria-current after the geometry fix", async () => {
    const { container, root } = await mountRail("middle");

    const active = container.querySelector<HTMLButtonElement>('[data-category-id="middle"]')!;
    const marker = active.querySelector<HTMLElement>(
      '[data-testid="category-rail-active-marker"]',
    )!;

    // The marker survives: WCAG 1.4.1 — selection must not be colour-only.
    expect(marker).not.toBeNull();
    expect(marker.getAttribute("aria-hidden")).toBe("true");
    // Still a visible white rule inside the pill, not a zero-size element.
    const markerTokens = marker.className.split(/\s+/);
    expect(markerTokens).toContain("h-0.5");
    expect(markerTokens).toContain("bg-primary-foreground");
    expect(markerTokens).toContain("inset-x-3");

    // aria-current still marks the chip for assistive tech.
    expect(active.getAttribute("aria-current")).toBe("true");
    expect(active.getAttribute("aria-label")).toBe("Current category: Middle");
    // And only the active chip carries the marker.
    for (const button of buttons(container)) {
      const has = button.querySelector('[data-testid="category-rail-active-marker"]') !== null;
      expect(has).toBe(button.dataset.categoryId === "middle");
    }

    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });
});
