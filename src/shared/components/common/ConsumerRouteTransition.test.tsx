/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsumerRouteTransition } from "./ConsumerRouteTransition";

// React act() needs this flag outside of Jest.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// The route identity is injected so the suite can drive push/pop navigation
// without mounting a TanStack Router (hermetic: no router, network or app shell).
const route = vi.hoisted(() => ({ pathname: "/first-load" }));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: route.pathname }),
}));

let root: Root | null = null;
let host: HTMLElement | null = null;

const container = () => host!.firstElementChild as HTMLElement;
const screen = () => container().querySelector(".screen") as HTMLElement;

// A fresh element per render: React skips re-rendering a function component
// when it receives the *same* element object (identical props reference), so
// the navigation helper must not hand it a cached one.
const screenTree = () => (
  <ConsumerRouteTransition>
    <div className="screen">screen</div>
  </ConsumerRouteTransition>
);

/** Mount at a fresh pathname; the very first mount is the "initial load". */
async function mountAt(pathname: string) {
  route.pathname = pathname;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(screenTree()));
  return container();
}

/** Re-render at another pathname — this is what a navigation looks like here. */
async function navigateTo(pathname: string) {
  route.pathname = pathname;
  await act(async () => root!.render(screenTree()));
  return container();
}

/**
 * Dispatch a synthetic animation event. jsdom runs no CSS animations, so the
 * event that settles the real transition is produced here.
 */
function fireAnimation(target: Element, type: "animationend" | "animationcancel") {
  const init: EventInit = { bubbles: true, composed: true };
  const event =
    typeof AnimationEvent === "function" ? new AnimationEvent(type, init) : new Event(type, init);
  target.dispatchEvent(event);
}

async function settleOn(target: Element, type: "animationend" | "animationcancel") {
  await act(async () => {
    fireAnimation(target, type);
  });
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
});

describe("ConsumerRouteTransition — route containment after the slide (audit 05-02)", () => {
  it("does not animate the very first paint", async () => {
    const el = await mountAt("/first-load");
    expect(el.className).toBe("route-transition-container");
    expect(el.classList.contains("route-transition-push")).toBe(false);
    expect(el.classList.contains("route-transition-pop")).toBe(false);
  });

  it("keeps the forward (push) native transition on navigation", async () => {
    await mountAt("/first-load");
    const el = await navigateTo("/menu");
    expect(el.classList.contains("route-transition-container")).toBe(true);
    expect(el.classList.contains("route-transition-push")).toBe(true);
    expect(el.classList.contains("route-transition-pop")).toBe(false);
  });

  it("drops the transition class once the container's own animation ends", async () => {
    await mountAt("/first-load");
    const el = await navigateTo("/menu");
    expect(el.classList.contains("route-transition-push")).toBe(true);

    await settleOn(el, "animationend");

    // The class is the only carrier of `will-change: transform` and of the
    // animation, so dropping it is what removes the containing block that
    // reparented position:fixed children (05-02).
    expect(el.className).toBe("route-transition-container");
    expect(el.classList.contains("route-transition-push")).toBe(false);
    expect(el.classList.contains("route-transition-pop")).toBe(false);
  });

  it("ignores an animationend bubbled up from a descendant", async () => {
    await mountAt("/first-load");
    const el = await navigateTo("/cart");
    expect(el.classList.contains("route-transition-push")).toBe(true);

    await settleOn(screen(), "animationend");

    expect(el.classList.contains("route-transition-push")).toBe(true);
  });

  it("keeps the back (pop) native transition and settles it the same way", async () => {
    await mountAt("/first-load");
    await navigateTo("/menu");

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const el = await navigateTo("/cart");
    expect(el.classList.contains("route-transition-pop")).toBe(true);
    expect(el.classList.contains("route-transition-push")).toBe(false);

    await settleOn(el, "animationend");
    expect(el.className).toBe("route-transition-container");
  });

  it("clears the transition class when the run is cancelled instead of ending", async () => {
    await mountAt("/first-load");
    const el = await navigateTo("/menu");
    expect(el.classList.contains("route-transition-push")).toBe(true);

    await settleOn(el, "animationcancel");

    expect(el.className).toBe("route-transition-container");
  });

  it("ignores an animationcancel bubbled up from a descendant", async () => {
    await mountAt("/first-load");
    const el = await navigateTo("/checkout");
    expect(el.classList.contains("route-transition-push")).toBe(true);

    await settleOn(screen(), "animationcancel");

    expect(el.classList.contains("route-transition-push")).toBe(true);
  });

  it("still animates the next navigation after a settle", async () => {
    await mountAt("/first-load");
    const first = await navigateTo("/menu");
    await settleOn(first, "animationend");

    const second = await navigateTo("/cart");
    expect(second.classList.contains("route-transition-push")).toBe(true);

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const third = await navigateTo("/profile");
    expect(third.classList.contains("route-transition-pop")).toBe(true);
  });
});

describe("styles.css route-transition blocks — source boundary", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

  /** Body of the first rule whose selector starts at (or after) `from`. */
  const ruleBody = (selector: string, from = 0) => {
    const at = css.indexOf(selector, from);
    expect(at, `missing ${selector}`).toBeGreaterThanOrEqual(0);
    const open = css.indexOf("{", at);
    const close = css.indexOf("}", open);
    return css.slice(open + 1, close);
  };

  const mediaAt = css.indexOf("@media (prefers-reduced-motion: reduce)");

  it("runs the route animation without retaining its final transform", () => {
    for (const selector of [".route-transition-push {", ".route-transition-pop {"]) {
      const body = ruleBody(selector);
      expect(body).toMatch(
        /animation:\s*nativeRoute(Push|Pop)\s+[\d.]+ms\s+cubic-bezier\([^)]*\)\s+none;/,
      );
      expect(body).not.toMatch(/\bboth\b/);
      // The compositing hint is kept for the run itself; it is the JS cleanup
      // (animationend) that removes it afterwards.
      expect(body).toMatch(/will-change:\s*transform, opacity;/);
    }
  });

  it("keeps both native keyframes (forward and back transitions retained)", () => {
    // Keyframe bodies nest braces, so match them across the whole sheet.
    const keyframes = (name: string) => {
      const at = css.indexOf(`@keyframes ${name}`);
      expect(at, `missing @keyframes ${name}`).toBeGreaterThanOrEqual(0);
      // The 100% *selector*, not the `translateX(100%)` inside the 0% block.
      const last = /100%\s*\{/.exec(css.slice(at));
      expect(last, `missing 100% stop in ${name}`).not.toBeNull();
      const body = css.slice(at, css.indexOf("}", at + last!.index) + 1);
      expect(body).toMatch(/100%\s*\{[\s\S]*?transform: translateX\(0\)/);
      expect(body).toMatch(/100%\s*\{[\s\S]*?opacity: 1/);
      return body;
    };
    expect(keyframes("nativeRoutePush")).toMatch(/transform: translateX\(100%\) scale\(0\.98\)/);
    expect(keyframes("nativeRoutePop")).toMatch(/transform: translateX\(-25%\)/);
  });

  it("leaves the container rule free of transform and will-change", () => {
    const body = ruleBody(".route-transition-container {");
    expect(body).not.toMatch(/transform/);
    expect(body).not.toMatch(/will-change/);
    // Base styles untouched by the repair.
    expect(body).toMatch(/min-height:\s*100dvh/);
    expect(body).toMatch(/overflow-x:\s*clip/);
    expect(body).toMatch(/position:\s*relative/);
  });

  it("neutralises the containing block under reduced motion", () => {
    expect(mediaAt).toBeGreaterThanOrEqual(0);
    const push = ruleBody(".route-transition-push", mediaAt);
    expect(push).toMatch(/animation:\s*none\s*!important/);
    expect(push).toMatch(/transform:\s*none\s*!important/);
    // Without this, will-change: transform survives reduced motion (where no
    // animationend ever fires) and 05-02 reproduces itself.
    expect(push).toMatch(/will-change:\s*auto\s*!important/);
    expect(ruleBody(".route-transition-pop", mediaAt)).toMatch(/will-change:\s*auto\s*!important/);
  });

  it("does not touch the other reduced-motion rules (ownership boundary)", () => {
    const skeleton = ruleBody(".skeleton", mediaAt);
    expect(skeleton).toMatch(/animation:\s*none\s*!important/);
    expect(skeleton).toMatch(/background-position:\s*0 0\s*!important/);
    expect(ruleBody(".animate-float", mediaAt)).toMatch(/animation:\s*none\s*!important/);
  });
});
