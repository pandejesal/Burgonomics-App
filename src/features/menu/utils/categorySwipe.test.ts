/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { attachCategorySwipe } from "./categorySwipe";

function touch(element: HTMLElement, type: string, x: number, y: number, count = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { identifier: 1, clientX: x, clientY: y };
  Object.defineProperties(event, {
    touches: { value: Array.from({ length: count }, () => point) },
    changedTouches: { value: [point] },
  });
  element.dispatchEvent(event);
  return event;
}

describe("category swipes", () => {
  it("switches in both directions and prevents horizontal page movement", () => {
    const el = document.createElement("div");
    const select = vi.fn();
    const dispose = attachCategorySwipe(el, select);
    touch(el, "touchstart", 200, 100);
    expect(touch(el, "touchmove", 170, 103).defaultPrevented).toBe(true);
    touch(el, "touchend", 110, 120);
    expect(select).toHaveBeenLastCalledWith(1);
    touch(el, "touchstart", 100, 100);
    touch(el, "touchmove", 130, 102);
    touch(el, "touchend", 180, 105);
    expect(select).toHaveBeenLastCalledWith(-1);
    dispose();
  });

  it("locks vertical scrolling even if the finger later moves sideways", () => {
    const el = document.createElement("div");
    const select = vi.fn();
    attachCategorySwipe(el, select);
    touch(el, "touchstart", 100, 100);
    expect(touch(el, "touchmove", 104, 130).defaultPrevented).toBe(false);
    touch(el, "touchend", 200, 135);
    expect(select).not.toHaveBeenCalled();
  });

  it("ignores short, cancelled and multi-touch gestures", () => {
    const el = document.createElement("div");
    const select = vi.fn();
    attachCategorySwipe(el, select);
    touch(el, "touchstart", 100, 100);
    touch(el, "touchend", 130, 100);
    touch(el, "touchstart", 100, 100);
    touch(el, "touchcancel", 170, 100);
    touch(el, "touchend", 200, 100);
    touch(el, "touchstart", 100, 100, 2);
    touch(el, "touchend", 200, 100);
    expect(select).not.toHaveBeenCalled();
  });

  it("suppresses a swipe's accidental click but allows the next tap", () => {
    const el = document.createElement("div");
    const child = document.createElement("button");
    el.append(child);
    const clicked = vi.fn();
    child.addEventListener("click", clicked);
    const dispose = attachCategorySwipe(el, vi.fn());
    touch(child, "touchstart", 100, 100);
    touch(child, "touchend", 200, 100);
    child.click();
    expect(clicked).not.toHaveBeenCalled();
    touch(child, "touchstart", 100, 100);
    touch(child, "touchend", 100, 100);
    child.click();
    expect(clicked).toHaveBeenCalledOnce();
    dispose();
    touch(child, "touchstart", 100, 100);
    expect(touch(child, "touchmove", 200, 100).defaultPrevented).toBe(false);
  });

  it("does not arm click suppression when the category change is refused", () => {
    // A boundary swipe returns `false`: nothing moved, so the next tap must
    // still reach the control underneath.
    const el = document.createElement("div");
    const child = document.createElement("button");
    el.appendChild(child);
    document.body.appendChild(el);

    const onClick = vi.fn();
    child.addEventListener("click", onClick);
    const dispose = attachCategorySwipe(el, () => false);

    touch(child, "touchstart", 300, 100);
    touch(child, "touchend", 100, 100); // 200px left swipe, refused
    child.click();
    expect(onClick).toHaveBeenCalledOnce();

    dispose();
    el.remove();
  });
});
