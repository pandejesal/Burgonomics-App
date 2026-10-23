/** @vitest-environment jsdom */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryNavRail } from "./CategoryNavRail";

vi.mock("@/core/services/haptics", () => ({ HapticService: { selection: vi.fn() } }));

const categories = [{ id: "first", name: "First" }, { id: "middle", name: "Middle" }, { id: "last", name: "Last" }];
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("category rail alignment", () => {
  it("centres only the rail, provides end space, and does not fight manual scrolling on re-render", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(580);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return 130 + categories.findIndex((c) => c.id === this.dataset.categoryId) * 110;
    });
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scroll });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const select = vi.fn();
    await act(async () => root.render(<CategoryNavRail categories={categories} activeCategoryId="middle" onSelectCategory={select} />));
    const rail = container.querySelector<HTMLElement>("[role=tablist]")!;
    expect(rail.style.paddingLeft).toBe("130px");
    expect(rail.style.paddingRight).toBe("130px");
    expect(scroll).toHaveBeenLastCalledWith({ left: 110, behavior: "instant" });
    scroll.mockClear();
    rail.scrollLeft = 20;
    await act(async () => root.render(<CategoryNavRail categories={[...categories]} activeCategoryId="middle" onSelectCategory={select} />));
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => root.render(<CategoryNavRail categories={categories} activeCategoryId="last" onSelectCategory={select} />));
    expect(scroll).toHaveBeenLastCalledWith({ left: 220, behavior: "smooth" });
    await act(async () => root.unmount());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  });
});
