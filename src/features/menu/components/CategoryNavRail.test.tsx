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
});
