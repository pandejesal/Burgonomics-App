/** @vitest-environment jsdom */
/**
 * Top-chrome focus clearance (WCAG 2.2 SC 2.4.11 - Focus Not Obscured).
 *
 * Measured in the hosted 56-row matrix (`final-native-results-hosted-final-
 * matrix-20261106-r3.json`): on customer `/menu`, `/cart` and partner `/orders`,
 * Tab-focused controls hit-tested as fully covered by `position: sticky` chrome
 * (`--top-chrome-height` boundary) and, on `/menu`, by the fixed floating cart
 * bar near the bottom edge. The document scroller reserved only bottom padding,
 * so `scroll-padding-top` computed to `auto` and focus never scrolled out from
 * under the bar.
 *
 * These tests assert the mechanism, not prose:
 *  1. each chrome owner publishes its OWN measured height on the root and keeps
 *     it current through a ResizeObserver;
 *  2. it removes only that property on detach, so neighbouring owners and
 *     unrelated root styles survive;
 *  3. the root rules consume those variables additively (`calc(... + 8px)`), so
 *     a measured height cannot be replaced by a constant that goes stale when
 *     the bar wraps at 200% text.
 *
 * jsdom has no layout, so heights are injected through getBoundingClientRect.
 * The arithmetic the CSS must satisfy is checked against the same expression
 * the browser will evaluate.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOOK_SRC = readFileSync(resolve(__dirname, "../hooks/useRootHeightVar.ts"), "utf8");
const MENU_SRC = readFileSync(resolve(__dirname, "../../routes/menu.index.tsx"), "utf8");
const STYLES_SRC = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
// Both owners render a router `Link`; a bare anchor is enough for measurement
// and keeps this suite out of the router provider.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

import { TopBar } from "./TopBar";
import { FloatingCartBar } from "@/features/cart/components/FloatingCartBar";
import { useCartStore } from "@/features/cart/state/cartStore";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class ControllableResizeObserver {
  static instances: ControllableResizeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    ControllableResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function giveHeight(el: Element, height: number) {
  Object.defineProperty(el, "offsetHeight", { configurable: true, get: () => height });
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      bottom: height,
      left: 0,
      right: 390,
      width: 390,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

/** Re-measure every attached owner, as the browser does after a reflow. */
async function reflow() {
  await act(async () => {
    ControllableResizeObserver.instances.forEach((observer) => observer.trigger());
  });
}

/** The declaration published inside an `html { ... }` block. */
function htmlDeclaration(property: string): string | null {
  const blocks = Array.from(STYLES_SRC.matchAll(/(?:^|\n)\s*html\s*\{([^}]*)\}/g)).map((m) => m[1]);
  const values = blocks
    .flatMap((block) =>
      Array.from(block.matchAll(new RegExp(`${property}\\s*:\\s*([^;]+);`, "g"))).map((m) =>
        m[1].trim(),
      ),
    )
    .filter((value) => value !== "auto");
  return values.length ? values[values.length - 1] : null;
}

/** Additive `calc(var(--x,Npx) + Npx + ...)`, the only shape this app uses. */
function evaluate(expression: string | null, vars: Record<string, number>, remPx = 16) {
  if (expression === null) return null;
  const body = expression.replace(/^calc\(/, "").replace(/\)$/, "");
  let total = 0;
  for (const raw of body.split("+")) {
    const term = raw.trim();
    if (!term) continue;
    const px = /^(-?\d+(?:\.\d+)?)px$/.exec(term);
    if (px) {
      total += Number(px[1]);
      continue;
    }
    const rem = /^(-?\d+(?:\.\d+)?)rem$/.exec(term);
    if (rem) {
      total += Number(rem[1]) * remPx;
      continue;
    }
    const variable = /^var\(\s*(--[\w-]+)\s*(?:,\s*(-?\d+(?:\.\d+)?)px\s*)?\)$/.exec(term);
    if (variable) {
      const [, name, fallback] = variable;
      if (name in vars) total += vars[name];
      else if (fallback !== undefined) total += Number(fallback);
      else return null;
      continue;
    }
    return null;
  }
  return total;
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(element: React.ReactElement) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
}

beforeEach(() => {
  ControllableResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
  document.documentElement.style.removeProperty("--top-chrome-height");
  document.documentElement.style.removeProperty("--menu-rail-height");
  document.documentElement.style.removeProperty("--floating-cart-height");
  useCartStore.setState({ lines: [] } as never);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--top-chrome-height");
  document.documentElement.style.removeProperty("--menu-rail-height");
  document.documentElement.style.removeProperty("--floating-cart-height");
});

describe("TopBar publishes its measured sticky height", () => {
  it("is the sticky top chrome the padding refers to", async () => {
    await mount(<TopBar title="Cart" backTo="/" />);
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.className).toContain("sticky");
    expect(header!.className).toContain("top-0");

    giveHeight(header!, 56);
    await reflow();
    expect(rootVar("--top-chrome-height")).toBe("56px");
  });

  it("tracks the taller wrapped bar at 200% text with the same observer", async () => {
    await mount(<TopBar title="Cart" backTo="/" />);
    const header = container.querySelector("header")!;
    giveHeight(header, 56);
    await reflow();
    const observers = ControllableResizeObserver.instances.length;
    expect(observers).toBeGreaterThan(0);

    giveHeight(header, 112);
    await reflow();
    expect(rootVar("--top-chrome-height")).toBe("112px");
    expect(ControllableResizeObserver.instances.length).toBe(observers);
  });

  it("removes only its own property on detach", async () => {
    await mount(<TopBar title="Cart" backTo="/" />);
    const header = container.querySelector("header")!;
    giveHeight(header, 56);
    await reflow();
    document.documentElement.style.setProperty("--bottom-nav-offset", "154px");
    document.documentElement.style.setProperty("color-scheme", "dark");

    await act(async () => root!.unmount());
    root = null;

    expect(rootVar("--top-chrome-height")).toBe("");
    expect(ControllableResizeObserver.instances.every((o) => o.disconnected)).toBe(true);
    expect(rootVar("--bottom-nav-offset")).toBe("154px");
    expect(rootVar("color-scheme")).toBe("dark");
  });
});

describe("the /menu rail publishes its own band", () => {
  it("positions the rail below the measured TopBar, not a fixed 56px assumption", () => {
    expect(MENU_SRC).toContain("top-[var(--top-chrome-height,calc(3.5rem+env(safe-area-inset-top,0px)))]");
    expect(MENU_SRC).not.toContain("sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))]");
  });

  it("wires the measured rail height, separately from the app bar", () => {
    // The rail's height depends on the view toggle, so it must be measured
    // rather than folded into a constant; the TopBar keeps its own property.
    expect(MENU_SRC).toContain('useRootHeightVar("--menu-rail-height")');
    expect(MENU_SRC).toContain("railHeightRef(node)");
    expect(MENU_SRC).toContain("ref={attachStickyChrome}");
    // The obsolete direct ref would mean the publish never runs.
    expect(MENU_SRC).not.toContain("ref={stickyRef}");
  });
});

describe("FloatingCartBar publishes the fixed bar height", () => {
  const line = {
    lineId: "l1",
    productId: "prod-1",
    storeId: "store-A",
    name: "Smash Burger",
    quantity: 2,
    unitPrice: 249,
    modifiers: [],
    veg: true,
    availability: "available",
  };

  it("publishes the fixed bar and releases it when the cart empties", async () => {
    useCartStore.setState({ lines: [line] } as never);
    await mount(<FloatingCartBar />);
    const bar = document.querySelector<HTMLElement>('[aria-label^="Floating cart summary"]');
    expect(bar, "the fixed bar must render for a populated cart").not.toBeNull();

    giveHeight(bar!, 72);
    await reflow();
    expect(rootVar("--floating-cart-height")).toBe("72px");

    await act(async () => {
      useCartStore.setState({ lines: [] } as never);
    });
    expect(rootVar("--floating-cart-height")).toBe("");
  });

  it("an inline bar claims no viewport space", async () => {
    useCartStore.setState({ lines: [line] } as never);
    await mount(<FloatingCartBar inline />);
    const bar = document.querySelector<HTMLElement>('[aria-label^="Floating cart summary"]');
    expect(bar).not.toBeNull();
    giveHeight(bar!, 72);
    await reflow();
    expect(rootVar("--floating-cart-height")).toBe("");
  });
});

describe("root scroll padding consumes the measured heights", () => {
  it("publishes a top rule that is no longer `auto`", () => {
    expect(htmlDeclaration("scroll-padding-top")).not.toBeNull();
  });

  it("reserves app bar + rail + 8px at 100% and 200% text", () => {
    const expression = htmlDeclaration("scroll-padding-top");
    for (const probe of [
      { top: 56, rail: 131, rem: 16 },
      { top: 112, rail: 232, rem: 32 },
    ]) {
      const clearance = evaluate(
        expression,
        { "--top-chrome-height": probe.top, "--menu-rail-height": probe.rail },
        probe.rem,
      );
      expect(clearance, `unreadable scroll-padding-top: ${expression}`).not.toBeNull();
      const chrome = probe.top + probe.rail;
      expect(clearance!).toBeGreaterThanOrEqual(chrome + 8);
      // A constant would not grow with the measured chrome; this band must.
      expect(clearance! - chrome).toBe(8);
    }
  });

  it("keeps the bottom rule additive with the floating cart bar", () => {
    const expression = htmlDeclaration("scroll-padding-bottom");
    const clearance = evaluate(
      expression,
      {
        "--bottom-nav-offset": 154,
        "--cart-summary-height": 0,
        "--floating-cart-height": 72,
      },
      32,
    );
    expect(clearance, `unreadable scroll-padding-bottom: ${expression}`).not.toBeNull();
    expect(clearance!).toBeGreaterThanOrEqual(154 + 72 + 8);
  });

  it("still degrades to the 8px gap with no chrome mounted", () => {
    expect(evaluate(htmlDeclaration("scroll-padding-top"), {}, 16)).toBe(8);
    expect(evaluate(htmlDeclaration("scroll-padding-bottom"), {}, 16)).toBe(86 + 8);
  });

  it("never reintroduces a hard-coded chrome constant", () => {
    // The measured properties are the contract; a literal rem/px band would
    // silently regress the moment the bar wraps at 200% text.
    expect(htmlDeclaration("scroll-padding-top")).toContain("--top-chrome-height");
    expect(htmlDeclaration("scroll-padding-top")).toContain("--menu-rail-height");
    expect(htmlDeclaration("scroll-padding-bottom")).toContain("--floating-cart-height");
    expect(HOOK_SRC).toContain("ResizeObserver");
  });
});
