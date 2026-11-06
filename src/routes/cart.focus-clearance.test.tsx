/** @vitest-environment jsdom */
/**
 * Cart fixed-chrome clearance (WCAG 2.2 SC 2.4.11 â€” Focus Not Obscured).
 *
 * Measured on the shipped bundle at 390x844 (staging-review-20261030/
 * 22-final-session/ui-independent-probe-results.json):
 *
 *  - 200% text: summary 323px (top 367), nav offset 154px, so the fixed chrome
 *    covers 477px of an 844px viewport. `documentElement.scrollPaddingBottom`
 *    computed to `auto`, so Tab-to-focus never scrolled a target into the
 *    255px open band. Every quantity/note/offers control hit-tested as fully
 *    covered, and "Increase quantity" sat at x 385..473 â€” outside the 390px
 *    viewport because the quantity group is `shrink-0`.
 *  - 100% text: "Browse available offers" at 636..680 against a summary top of
 *    596 was already fully covered.
 *  - `main` padding-bottom was 474px against 477px of chrome (and the `10rem`
 *    term assumed a summary height nothing measured), so even at max scroll
 *    the last content sat 24-80px behind the summary.
 *
 * These tests assert the *mechanism* that fixes it, not prose:
 *  1. the route PUBLISHES the measured summary height on the root element and
 *     keeps it current as the summary resizes (ResizeObserver);
 *  2. it REMOVES the property and disconnects the observer on unmount, so no
 *     other route inherits a stale cart height;
 *  3. the content padding contract clears summary + nav instead of the fixed
 *     `10rem`, and the root scroll-padding clears the same chrome.
 *
 * jsdom cannot compute layout, so the measured height is injected through the
 * element's own getBoundingClientRect; the arithmetic the CSS must satisfy is
 * checked against the real probe numbers.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* â”€â”€ probe numbers (ui-independent-probe-results.json, cart.text200) â”€â”€â”€â”€â”€â”€ */
const PROBE_100 = { summaryHeight: 162, navOffset: 86 };
const PROBE_200 = { summaryHeight: 323, navOffset: 154 };

const fixture = vi.hoisted(() => ({
  calculateTotals: vi.fn(),
  updateQuantity: vi.fn(),
  removeItem: vi.fn(),
  clearCart: vi.fn(),
  validateCart: vi.fn(),
  prepareCheckout: vi.fn(),
  updateNotes: vi.fn(),
  setFulfillment: vi.fn(),
  navigate: vi.fn(),
  shellProps: { contentClassName: "" as string | undefined },
}));

/* â”€â”€ shell: captures the padding contract the route asks for â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (options: Record<string, unknown>) => ({
    ...options,
    options,
    _$path: path,
  }),
  useNavigate: () => fixture.navigate,
  Link: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    bottomSlot,
    contentClassName,
  }: {
    children?: React.ReactNode;
    bottomSlot?: React.ReactNode;
    contentClassName?: string;
  }) => {
    fixture.shellProps.contentClassName = contentClassName;
    return (
      <div>
        <main data-testid="app-shell-content" className={contentClassName}>
          {children}
        </main>
        {bottomSlot}
      </div>
    );
  },
}));
vi.mock("@/shared/hooks/useHydrated", async () => {
  // Faithful replica of the real hook (src/shared/hooks/useHydrated.ts:4-7), not
  // a permanent `true`:
  //
  //   const [hydrated, setHydrated] = useState(false);
  //   useEffect(() => setHydrated(true), []);
  //
  // The previous always-true mock hid a real lifecycle defect: the cart renders
  // its skeleton on the first commit, so the summary bar does not exist yet and
  // the measurement effect must not treat that first pass as final. A replica
  // is used rather than `importActual` because the other cases in this file
  // assert the post-hydration state and this keeps every test on ONE hydration
  // model instead of two.
  const React = await import("react");
  return {
    useHydrated: () => {
      const [hydrated, setHydrated] = React.useState(false);
      React.useEffect(() => setHydrated(true), []);
      return hydrated;
    },
  };
});
vi.mock("@/shared/hooks/useKitchenHours", () => ({
  useKitchenHours: () => ({ isOpen: true, isClosed: false }),
}));
vi.mock("@/shared/components/feedback/KitchenClosedBanner", () => ({
  KitchenClosedBanner: () => null,
}));
vi.mock("@/shared/components/common/ConfirmDialog", () => ({ ConfirmDialog: () => null }));

/* â”€â”€ leaves kept out of this contract (the summary + bars are the subject) â”€â”€ */
vi.mock("@/features/cart/components/CartItemRow", () => ({
  CartItemRow: () => <div data-testid="cart-line" />,
}));
vi.mock("@/features/cart/components/CookingInstructionsSection", () => ({
  CookingInstructionsSection: () => <div data-testid="cooking-notes" />,
}));
vi.mock("@/features/cart/components/PromoInput", () => ({ PromoInput: () => null }));
vi.mock("@/features/cart/components/BillBreakdown", () => ({ BillBreakdown: () => null }));
vi.mock("@/features/cart/components/DeliveryTipSelector", () => ({
  DeliveryTipSelector: () => null,
}));
vi.mock("@/features/stores/components/FulfillmentSheet", () => ({
  FulfillmentSheet: () => null,
}));
// This route imports the rail unconditionally, so the module is evaluated even
// on the filled branch. Stub it rather than dragging the order-history import
// chain (and its repository) into a focus-geometry suite.
vi.mock("@/features/orders/components/RecentOrdersRail", () => ({
  RecentOrdersRail: () => null,
}));

vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: {
    calculateTotals: fixture.calculateTotals,
    updateQuantity: fixture.updateQuantity,
    removeItem: fixture.removeItem,
    clear: fixture.clearCart,
    validateCart: fixture.validateCart,
    prepareCheckout: fixture.prepareCheckout,
    updateNotes: fixture.updateNotes,
  },
  CartRepository: class {},
}));

vi.mock("@/features/stores/state/storeStore", async () => {
  const { create } = await import("zustand");
  const useStoreSelection = create<{
    activeStore: { id: string; name: string };
    fulfillment: "delivery" | "takeaway" | "dinein";
    setFulfillment: (f: string) => void;
  }>()(() => ({
    activeStore: { id: "store-A", name: "Surat Vesu" },
    fulfillment: "delivery",
    setFulfillment: fixture.setFulfillment,
  }));
  return { useStoreSelection };
});
vi.mock("@/features/addresses", () => ({
  useAddressStore: (selector: (state: unknown) => unknown) =>
    selector({ addresses: [], selectedId: null }),
  selectAddresses: () => [],
  selectSelectedAddress: () => ({
    id: "addr_home",
    label: "home",
    line1: "12 Test Street",
    city: "Surat",
    pincode: "395007",
  }),
}));
vi.mock("@/features/auth/state/authStore", async () => {
  const { create } = await import("zustand");
  const useAuthStore = create<{ user: { id: string; phone: string } | null }>(() => ({ user: null }));
  return {
    useAuthStore,
    selectIsAuthenticated: (state: { user: unknown }) => Boolean(state.user),
  };
});
// Keep the real checkout store (tip seeding is part of the route), but skip the
// rest of the barrel this contract does not touch.
vi.mock("@/features/checkout", async () => {
  const { useCheckoutStore } = await vi.importActual<
    typeof import("@/features/checkout/state/checkoutStore")
  >("@/features/checkout/state/checkoutStore");
  return { useCheckoutStore };
});

import { useCartStore } from "@/features/cart/state/cartStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { Route as CartRoute } from "./cart";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const CartPage = (CartRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;

/* â”€â”€ a ResizeObserver we can drive, since jsdom has none â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
  /** Fire the observer as the browser would after a reflow. */
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/**
 * Give the measured height to every box the route could be measuring: the DOM
 * boxes that render the summary label, plus anything an observer watches. A
 * `useLayoutEffect` reading a ref gets the fixed bar; a `ResizeObserver` gets
 * whatever it observes. jsdom has no layout, so without this every rect is 0
 * and a correct implementation would still publish nothing.
 */
function stubSummaryHeights(height: number) {
  const boxes = Array.from(
    document.body.querySelectorAll<HTMLElement>("div, section, aside"),
  ).filter((el) => (el.textContent ?? "").includes("Estimated Total"));
  const targets = new Set<Element>(boxes);
  for (const observer of ControllableResizeObserver.instances) {
    for (const observed of observer.observed) targets.add(observed);
  }
  expect(targets.size, "the route must render the sticky summary").toBeGreaterThan(0);
  for (const target of targets) giveHeight(target as HTMLElement, height);
}

/** Every observer that has been constructed, for disconnect assertions. */
function allObservers(): ControllableResizeObserver[] {
  return ControllableResizeObserver.instances;
}

/** Give an element a real measured height without touching real layout. */
function giveHeight(el: HTMLElement, height: number) {
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

const rootHeightVar = () =>
  document.documentElement.style.getPropertyValue("--cart-summary-height");

const SRC_STYLES = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

/**
 * The `scroll-padding-bottom` published on the document scroller.
 *
 * Read from an `html { â€¦ }` block specifically, because `html` is the document
 * scroller in this app (see the sticky/overflow note above it in styles.css) and
 * a rule anywhere else would not affect Tab-to-focus. Returns null when nothing
 * is published â€” that is the defect, not a harness failure.
 */
function rootScrollPaddingBottom(): string | null {
  const htmlBlocks = Array.from(SRC_STYLES.matchAll(/(?:^|\n)\s*html\s*\{([^}]*)\}/g)).map(
    (m) => m[1],
  );
  const declarations = htmlBlocks
    .flatMap((block) =>
      Array.from(block.matchAll(/scroll-padding-bottom\s*:\s*([^;]+);/g)).map((m) => m[1].trim()),
    )
    .filter((value) => value !== "auto");
  return declarations.length ? declarations[declarations.length - 1] : null;
}

/**
 * Evaluate a CSS clearance expression of the additive shape this app uses,
 * e.g. `calc(var(--bottom-nav-offset,86px) + var(--cart-summary-height,0px) + 8px)`.
 *
 * `remPx` is the root font size for the case under test: 16 at 100% text, 32 at
 * 200%. `env(safe-area-inset-bottom, Npx)` resolves to its fallback because a
 * headless viewport has no inset.
 *
 * Returns null for an expression this evaluator cannot read, so an unfamiliar
 * (or malformed) formula surfaces as a failed assertion with the formula in the
 * message rather than as an exception from the harness.
 */
function evaluateClearance(
  expression: string | null,
  vars: Record<string, number>,
  remPx = 16,
): number | null {
  if (expression === null) return null;
  const body = expression.replace(/^calc\(/, "").replace(/\)$/, "");
  let total = 0;
  for (const rawTerm of body.split("+")) {
    const term = rawTerm.trim();
    if (!term) continue;

    const pxTerm = /^(-?\d+(?:\.\d+)?)px$/.exec(term);
    if (pxTerm) {
      total += Number(pxTerm[1]);
      continue;
    }

    const remTerm = /^(-?\d+(?:\.\d+)?)rem$/.exec(term);
    if (remTerm) {
      total += Number(remTerm[1]) * remPx;
      continue;
    }

    const varTerm = /^var\(\s*(--[\w-]+)\s*(?:,\s*(-?\d+(?:\.\d+)?)px\s*)?\)$/.exec(term);
    if (varTerm) {
      const [, name, fallback] = varTerm;
      if (name in vars) total += vars[name];
      else if (fallback !== undefined) total += Number(fallback);
      else return null; // unresolved property with no fallback
      continue;
    }

    const envTerm = /^env\(\s*[\w-]+\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)$/.exec(term);
    if (envTerm) {
      total += Number(envTerm[1]);
      continue;
    }

    return null; // unsupported term
  }
  return total;
}

let container: HTMLDivElement;
let root: Root | null = null;

/**
 * Mount the route and let the hydration effect flush, so the real summary bar
 * is on screen. `useHydrated` now starts false (as it really does), so one extra
 * effect pass is required before the bar exists.
 */
async function mountCart() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<CartPage />));
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ControllableResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
  document.documentElement.style.removeProperty("--cart-summary-height");
  document.documentElement.style.removeProperty("--bottom-nav-offset");

  fixture.calculateTotals.mockResolvedValue({
    success: true,
    data: {
      subtotal: 249,
      taxes: 0,
      packingFee: 0,
      deliveryFee: 0,
      promoDiscount: 0,
      loyaltyDiscount: 0,
      grandTotal: 249,
    },
  });
  fixture.updateQuantity.mockResolvedValue({ success: true });
  fixture.removeItem.mockResolvedValue({ success: true });

  useCartStore.setState({
    lines: [
      {
        lineId: "l1",
        productId: "prod-1",
        storeId: "store-A",
        name: "Smash Burger",
        quantity: 2,
        unitPrice: 249,
        modifiers: [],
        veg: true,
        availability: "available",
      },
    ] as never,
    promo: null,
    priceLockExpiresAt: null,
    status: "ready",
    error: null,
    syncPending: false,
  });
  useCheckoutStore.setState({ orderNotes: "", tipAmount: 0, notesScope: null });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--cart-summary-height");
  document.documentElement.style.removeProperty("--bottom-nav-offset");
});

describe("cart publishes the measured summary height", () => {
  it("writes --cart-summary-height from the summary's real height", async () => {
    await mountCart();

    stubSummaryHeights(PROBE_100.summaryHeight);

    // A browser delivers a resize to whichever observer watches the element;
    // firing every constructed observer is the same event, without guessing
    // which one the route chose.
    await act(async () => allObservers().forEach((observer) => observer.trigger()));

    expect(rootHeightVar()).toBe(`${PROBE_100.summaryHeight}px`);
  });

  it("tracks growth at 200% text without remounting the observer", async () => {
    await mountCart();

    const observersAfterMount = allObservers().length;
    expect(observersAfterMount, "a ResizeObserver must watch the summary").toBeGreaterThan(0);
    stubSummaryHeights(PROBE_100.summaryHeight);
    await act(async () => allObservers().forEach((observer) => observer.trigger()));
    expect(rootHeightVar()).toBe(`${PROBE_100.summaryHeight}px`);

    // The summary reflows to 323px when the root font size doubles.
    stubSummaryHeights(PROBE_200.summaryHeight);
    await act(async () => allObservers().forEach((observer) => observer.trigger()));

    expect(rootHeightVar()).toBe(`${PROBE_200.summaryHeight}px`);
    // The same observer kept reporting: growth is a resize, not a re-subscribe.
    expect(allObservers().length).toBe(observersAfterMount);
  });

  it("removes the property and disconnects on unmount (no other-route leak)", async () => {
    await mountCart();

    const observers = allObservers();
    expect(observers.length, "a ResizeObserver must watch the summary").toBeGreaterThan(0);
    stubSummaryHeights(PROBE_200.summaryHeight);
    await act(async () => observers.forEach((observer) => observer.trigger()));

    // Another owner's inline style must survive this route's cleanup.
    document.documentElement.style.setProperty("--bottom-nav-offset", "154px");
    document.documentElement.style.setProperty("color-scheme", "dark");
    expect(rootHeightVar()).toBe(`${PROBE_200.summaryHeight}px`);

    await act(async () => root!.unmount());
    root = null;

    expect(rootHeightVar()).toBe("");
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
    // Untouched: the nav's own publication and an unrelated root style survive.
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-offset")).toBe("154px");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");
  });
});

describe("cart summary leaves usable space in short zoomed viewports", () => {
  it("moves an over-tall summary into flow rather than covering the entire focus band", async () => {
    vi.stubGlobal("innerHeight", 390);
    await mountCart(); stubSummaryHeights(241);
    await act(async () => allObservers().forEach(observer => observer.trigger()));
    const summary = document.querySelector<HTMLElement>('[data-testid="cart-summary"]');
    expect(summary).not.toBeNull();
    expect(summary!.className.split(/\s+/)).not.toContain("fixed");
    expect(summary!.className).toContain("--bottom-nav-offset");
    expect(rootHeightVar()).toBe("0px");
  });
  it("returns to a pinned summary when only the viewport height grows", async () => {
    vi.stubGlobal("innerHeight", 390);
    await mountCart(); stubSummaryHeights(241);
    await act(async () => allObservers().forEach(observer => observer.trigger()));
    expect(rootHeightVar()).toBe("0px");
    vi.stubGlobal("innerHeight", 844);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(document.querySelector('[data-testid="cart-summary"]')!.className.split(/\s+/)).toContain("fixed");
    expect(rootHeightVar()).toBe("241px");
  });
  it("also recomputes viewport fit without ResizeObserver", async () => {
    vi.stubGlobal("ResizeObserver", undefined); vi.stubGlobal("innerHeight", 390);
    await mountCart(); stubSummaryHeights(241);
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(document.querySelector('[data-testid="cart-summary"]')).not.toBeNull();
    expect(rootHeightVar()).toBe("0px");
  });
  it("ignores a queued observer after the summary unmounts", async () => {
    await mountCart(); stubSummaryHeights(162);
    const observers = allObservers();
    await act(async () => observers.forEach(observer => observer.trigger()));
    expect(rootHeightVar()).toBe("162px");
    await act(async () => root!.unmount()); root = null;
    await act(async () => observers.forEach(observer => observer.trigger()));
    expect(rootHeightVar()).toBe("");
  });
  it("does not retain or publish a zero or non-finite measured clearance", async () => {
    await mountCart(); stubSummaryHeights(162);
    await act(async () => allObservers().forEach(observer => observer.trigger()));
    for (const height of [0, Number.NaN]) {
      stubSummaryHeights(height);
      await act(async () => allObservers().forEach(observer => observer.trigger()));
      expect(rootHeightVar()).toBe("");
    }
  });
});

describe("cart content padding clears the fixed chrome", () => {
  it("derives the content padding from the measured summary, not a fixed 10rem", async () => {
    await mountCart();
    const padding = fixture.shellProps.contentClassName ?? "";

    expect(padding).toContain("--cart-summary-height");
    expect(padding).not.toContain("10rem");
  });

  it("reserves at least summary + nav at 200% text", async () => {
    await mountCart();
    const padding = fixture.shellProps.contentClassName ?? "";
    const declaration = /pb-\[(calc\([^\]]+\))\]/.exec(padding);

    expect(declaration, "content padding must be an additive calc()").not.toBeNull();
    const reserved = evaluateClearance(
      declaration![1],
      {
        "--cart-summary-height": PROBE_200.summaryHeight,
        "--bottom-nav-offset": PROBE_200.navOffset,
      },
      32,
    );

    expect(reserved, `unreadable padding: ${declaration?.[1]}`).not.toBeNull();
    // The content must end above the summary top, not under it.
    expect(reserved!).toBeGreaterThanOrEqual(PROBE_200.summaryHeight + PROBE_200.navOffset);
    // And it must exceed the old fixed 160px + nav assumption.
    expect(reserved!).toBeGreaterThan(10 * 16 + PROBE_200.navOffset);
  });

  it("still clears the chrome at 100% text", async () => {
    await mountCart();
    const padding = fixture.shellProps.contentClassName ?? "";
    const declaration = /pb-\[(calc\([^\]]+\))\]/.exec(padding);

    expect(declaration, "content padding must be an additive calc()").not.toBeNull();
    const reserved = evaluateClearance(
      declaration![1],
      {
        "--cart-summary-height": PROBE_100.summaryHeight,
        "--bottom-nav-offset": PROBE_100.navOffset,
      },
      16,
    );

    expect(reserved, `unreadable padding: ${declaration?.[1]}`).not.toBeNull();
    expect(reserved!).toBeGreaterThanOrEqual(PROBE_100.summaryHeight + PROBE_100.navOffset);
  });
});

describe("root scroll-padding clears the fixed chrome for keyboard focus", () => {
  it("is no longer `auto`", () => {
    expect(rootScrollPaddingBottom()).not.toBeNull();
  });

  it("reserves nav + summary + a visible gap at 200% text", () => {
    const expression = rootScrollPaddingBottom();
    const clearance = evaluateClearance(
      expression,
      {
        "--cart-summary-height": PROBE_200.summaryHeight,
        "--bottom-nav-offset": PROBE_200.navOffset,
      },
      32,
    );

    expect(clearance, `unreadable scroll-padding: ${expression}`).not.toBeNull();
    const chrome = PROBE_200.summaryHeight + PROBE_200.navOffset;
    expect(clearance!).toBeGreaterThan(chrome);
    // A focused control must land inside the open band with a real gap, not
    // flush against the summary's top edge.
    expect(clearance! - chrome).toBeGreaterThanOrEqual(8);
  });

  it("reserves the summary's own height at 100% text", () => {
    const expression = rootScrollPaddingBottom();
    const chrome = PROBE_100.summaryHeight + PROBE_100.navOffset;
    const clearance = evaluateClearance(
      expression,
      {
        "--cart-summary-height": PROBE_100.summaryHeight,
        "--bottom-nav-offset": PROBE_100.navOffset,
      },
      16,
    );

    expect(clearance, `unreadable scroll-padding: ${expression}`).not.toBeNull();
    expect(clearance!).toBeGreaterThanOrEqual(chrome);
  });

  it("falls back to the nav offset alone on routes with no cart summary", () => {
    const expression = rootScrollPaddingBottom();
    const clearance = evaluateClearance(
      expression,
      {
        "--cart-summary-height": 0,
        "--bottom-nav-offset": PROBE_100.navOffset,
      },
      16,
    );

    expect(clearance, `unreadable scroll-padding: ${expression}`).not.toBeNull();
    expect(clearance!).toBeGreaterThanOrEqual(PROBE_100.navOffset);
  });
});

/**
 * Effect lifecycle — reported by the parent from source, not yet observed as RED.
 *
 * `cart.tsx:97-119` runs a `useEffect(..., [])`, and its body begins
 * `if (!el ...) return`. Two consequences follow from that shape alone:
 *
 *  1. The first commit renders `CartSkeleton` while `useHydrated()` is false
 *     (`useHydrated.ts:4-7` starts `false` and only sets it in an effect), so
 *     `summaryRef.current` is null on the one run the effect ever gets. When
 *     hydration then swaps in the real bar, the effect never re-runs — nothing
 *     is measured and no ResizeObserver is attached. A permanently-true
 *     hydration mock hides exactly this.
 *  2. Because the deps are `[]`, an empty/error cart that removes the bar does
 *     not re-run the effect either, and the cleanup that exists only fires on
 *     UNMOUNT. The root would keep the last height and a live observer for a
 *     bar that is no longer on screen — reserving space for nothing.
 *
 * The third guard covers the `typeof ResizeObserver === "undefined"` early
 * return at line 109: it returns BEFORE registering a cleanup, so the property
 * it already wrote is never removed on unmount.
 *
 * These are the tests; they are NOT claimed as observed RED yet.
 */
/** Observers that are still watching (StrictMode creates more than one). */
function activeObservers(): ControllableResizeObserver[] {
  return ControllableResizeObserver.instances.filter((observer) => !observer.disconnected);
}

/**
 * StrictMode lifecycle.
 *
 * `src/boot.tsx:6,22` mounts the app inside `<StrictMode>` on React 19, which
 * double-invokes the mount cycle: refs attach, detach, then attach again, and
 * effects run, clean up, then run again. A callback ref that releases on detach
 * can leave the document correct only if the SECOND attach re-measures — and an
 * unmount effect that releases is only safe if releasing is idempotent and
 * ordered so the surviving attachment wins.
 *
 * This is the exact shape that breaks silently: the property looks fine at
 * first paint, then the simulated remount's cleanup removes it and nothing puts
 * it back, so the page reserves nothing and focus is obscured again in
 * production while every single-mount test stays green.
 */
describe("StrictMode double-mount lifecycle", () => {
  it("keeps the measured height and a live observer through the initial strict cycle", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () =>
      root!.render(
        <React.StrictMode>
          <CartPage />
        </React.StrictMode>,
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });

    // StrictMode mounts twice; at least one attachment must have survived.
    const observers = allObservers();
    expect(
      observers.length,
      "StrictMode still requires the measurement effect to attach an observer",
    ).toBeGreaterThan(0);

    stubSummaryHeights(PROBE_200.summaryHeight);
    await act(async () => observers.forEach((observer) => observer.trigger()));

    // The strict cycle's detach must NOT have won: the surviving attachment
    // re-measured and republished the height.
    expect(
      rootHeightVar(),
      "the simulated remount's cleanup must not leave the height cleared",
    ).toBe(`${PROBE_200.summaryHeight}px`);

    expect(
      activeObservers().length,
      "a disconnected observer must not be the one left watching the bar",
    ).toBeGreaterThan(0);
  });

  it("detaches every observer and clears only its own property on unmount", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () =>
      root!.render(
        <React.StrictMode>
          <CartPage />
        </React.StrictMode>,
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });

    stubSummaryHeights(PROBE_200.summaryHeight);
    await act(async () => allObservers().forEach((observer) => observer.trigger()));
    expect(rootHeightVar()).toBe(`${PROBE_200.summaryHeight}px`);

    // Another owner's root style must survive teardown, as in every other case.
    document.documentElement.style.setProperty("--bottom-nav-offset", "154px");
    document.documentElement.style.setProperty("color-scheme", "dark");

    await act(async () => root!.unmount());
    root = null;

    expect(rootHeightVar()).toBe("");
    expect(
      activeObservers().length,
      "no observer may outlive the route",
    ).toBe(0);
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-offset")).toBe("154px");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");
  });
});

describe("measurement effect follows the summary bar's real lifecycle", () => {
  it("measures and observes after hydration swaps the skeleton for the bar", async () => {
    // NOTE ON THE PROBE: `act()` flushes effects before returning, so the
    // skeleton pass cannot be observed as an intermediate DOM state here.
    // The observable consequence is what this test asserts instead: after
    // hydration settles, an observer must be attached and measuring. Against the
    // old `useEffect(..., [])` this fails — that effect ran once on the skeleton
    // pass (null ref, early return) and never re-ran, so no observer existed
    // once the real bar appeared.
    await mountCart();

    const observers = allObservers();
    expect(
      observers.length,
      "the effect must attach a ResizeObserver once the bar exists, not only on the skeleton pass",
    ).toBeGreaterThan(0);

    stubSummaryHeights(PROBE_100.summaryHeight);
    await act(async () => observers.forEach((observer) => observer.trigger()));

    expect(rootHeightVar()).toBe(`${PROBE_100.summaryHeight}px`);
  });

  it("clears the reserved height when the cart empties without unmounting", async () => {
    await mountCart();
    await act(async () => {
      await Promise.resolve();
    });
    stubSummaryHeights(PROBE_200.summaryHeight);
    await act(async () => allObservers().forEach((observer) => observer.trigger()));
    expect(rootHeightVar()).toBe(`${PROBE_200.summaryHeight}px`);

    // Emptying the cart removes the summary bar but keeps this route mounted.
    await act(async () => {
      useCartStore.setState({ lines: [], status: "empty", error: null } as never);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Space reserved for a bar that is no longer rendered would push the empty
    // state's content up off the top of the screen.
    expect(
      rootHeightVar(),
      "an empty cart must not keep reserving the removed summary's height",
    ).toBe("");
  });

  it("removes only its own property on unmount when ResizeObserver is unavailable", async () => {
    // Older engines have no ResizeObserver; the effect returns before it
    // registers any cleanup, so the property it wrote would otherwise leak.
    vi.stubGlobal("ResizeObserver", undefined);

    await mountCart();
    await act(async () => {
      await Promise.resolve();
    });

    // With no observer, the measurement still happens once (if the bar exists).
    // Seed the property the effect would have written and verify cleanup.
    document.documentElement.style.setProperty("--cart-summary-height", "323px");
    document.documentElement.style.setProperty("--bottom-nav-offset", "154px");
    document.documentElement.style.setProperty("color-scheme", "dark");

    await act(async () => root!.unmount());
    root = null;

    expect(
      rootHeightVar(),
      "unmount must clear the property even when no observer was created",
    ).toBe("");
    // Ownership: nothing else on the root may be disturbed.
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-offset")).toBe("154px");
    expect(document.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");
  });
});
