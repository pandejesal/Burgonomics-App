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
 * The selected chip's underline was reported as a defect twice: first as the
 * green "not covering" the pill, then, once it was moved inside, as "a white
 * line". Selection never needed it. A solid dark fill among outlined chips, with
 * heavier text, already reads without relying on hue (WCAG 1.4.1), and
 * aria-current carries the state for assistive tech.
 *
 * The one place those cues vanish is forced-colours mode, which discards
 * background fills, so the marker survives there and nowhere else.
 */
describe("selected chip marker", () => {
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

  function tokensOf(element: HTMLElement) {
    return element.className.split(/\s+/);
  }

  it("paints no white line on the selected pill in normal display", async () => {
    const { container, root } = await mountRail("middle");
    const marker = container.querySelector<HTMLElement>(
      '[data-testid="category-rail-active-marker"]',
    )!;

    const tokens = tokensOf(marker);
    expect(tokens, "the marker must not render outside forced-colours").toContain("hidden");
    expect(tokens, "no white fill on the pill").not.toContain("bg-primary-foreground");

    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });

  it("keeps the marker for forced-colours mode, which discards fills", async () => {
    const { container, root } = await mountRail("middle");
    const marker = container.querySelector<HTMLElement>(
      '[data-testid="category-rail-active-marker"]',
    )!;

    const tokens = tokensOf(marker);
    expect(tokens).toContain("forced-colors:block");
    // A system colour: a brand colour would be replaced in this mode.
    expect(tokens).toContain("forced-colors:bg-[CanvasText]");
    expect(marker.getAttribute("aria-hidden")).toBe("true");

    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });

  it("still shows selection without relying on hue", async () => {
    const { container, root } = await mountRail("middle");

    const active = container.querySelector<HTMLButtonElement>('[data-category-id="middle"]')!;
    const other = container.querySelector<HTMLButtonElement>('[data-category-id="first"]')!;

    // Solid fill and heavier text against an outlined sibling.
    expect(tokensOf(active)).toEqual(expect.arrayContaining(["bg-primary", "font-extrabold"]));
    expect(tokensOf(other)).toEqual(expect.arrayContaining(["bg-surface", "border-divider"]));
    expect(tokensOf(other)).not.toContain("font-extrabold");

    expect(active.getAttribute("aria-current")).toBe("true");
    expect(active.getAttribute("aria-label")).toBe("Current category: Middle");
    for (const button of buttons(container)) {
      const has = button.querySelector('[data-testid="category-rail-active-marker"]') !== null;
      expect(has).toBe(button.dataset.categoryId === "middle");
    }

    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });
});

describe("keyboard focus stays inside the rail's own visible width", () => {
  it.each([
    { name: "right-clipped", left: 135, width: 120, expected: 199 },
    { name: "left-clipped", left: 5, width: 100, expected: 91 },
    { name: "oversized", left: 5, width: 200, expected: 91 },
    { name: "already visible", left: 25, width: 100, expected: 100 },
  ])("reveals a $name chip without selecting a category", async ({ left, width, expected }) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host), select = vi.fn();
    await act(async () => root.render(<CategoryNavRail categories={categories} onSelectCategory={select} />));
    try {
      const rail = host.querySelector("nav")!, chip = rail.querySelector("button")!;
      const rect = (x: number, w: number) => ({ x, y: 68, top: 68, bottom: 112, left: x, right: x + w, width: w, height: 44, toJSON: () => ({}) });
      Object.defineProperty(rail, "clientWidth", { value: 150 });
      rail.getBoundingClientRect = () => rect(10, 150);
      chip.getBoundingClientRect = () => rect(left, width);
      rail.scrollLeft = 100;
      await act(async () => chip.focus());
      expect(document.activeElement).toBe(chip);
      expect(rail.scrollLeft).toBe(expected);
      expect(select).not.toHaveBeenCalled();
      expect(chip.getAttribute("aria-current")).toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});
