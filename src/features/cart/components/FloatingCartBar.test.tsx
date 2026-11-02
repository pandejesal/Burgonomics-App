/** @vitest-environment jsdom */
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/services/haptics", () => ({ HapticService: { selection: vi.fn() } }));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));

// The bar only uses <Link to="/cart"> for navigation; a plain anchor keeps the
// real rendered markup measurable without standing up a router.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    className,
    children,
    ...rest
  }: {
    to: string;
    className?: string;
    children?: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={to} className={className} {...rest}>
      {children}
    </a>
  ),
}));

const cart = {
  lines: [
    {
      lineId: "l1",
      productId: "p1",
      storeId: "s1",
      name: "Smash Burger",
      unitPrice: 1299,
      quantity: 3,
      modifiers: [],
      availability: "available",
    },
  ],
  count: 3,
};

vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: (selector: (s: { lines: unknown[] }) => unknown) => selector({ lines: cart.lines }),
  selectItemCount: () => cart.count,
}));

const { FloatingCartBar } = await import("./FloatingCartBar");

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<FloatingCartBar inline />));
  return root;
}

describe("FloatingCartBar compact shell", () => {
  it("is a 56px bar, not a 72px second navigation row", async () => {
    const root = await mount();
    const link = document.body.querySelector<HTMLAnchorElement>('a[href="/cart"]')!;
    expect(link).not.toBeNull();

    const tokens = link.className.split(/\s+/);
    // 56px = 14 * 4. The old 72px shell plus the 44px pill read as a second
    // bottom bar on a phone.
    expect(tokens).toContain("min-h-14");
    expect(tokens).not.toContain("min-h-[72px]");
    expect(tokens).not.toContain("min-h-[56px]");

    await act(async () => root.unmount());
  });

  it("still carries the count and the long-form total for screen readers", async () => {
    const root = await mount();
    const summary = document.body.querySelector<HTMLElement>(
      'aside[aria-label^="Floating cart summary"]',
    )!;
    // The summary lives on the landmark so the count and total are announced as
    // one sentence, not as two separate visible lines.
    expect(summary).not.toBeNull();
    expect(summary.getAttribute("aria-label")).toBe(
      "Floating cart summary, 3 items, total ₹3,897.00",
    );

    const link = document.body.querySelector<HTMLAnchorElement>('a[href="/cart"]')!;
    expect(link.textContent).toContain("₹3,897.00");
    expect(link.textContent).toContain("3 items");
    expect(link.textContent).toContain("View Cart");
    await act(async () => root.unmount());
  });

  it("keeps the View Cart pill at the 44px touch floor inside the shorter shell", async () => {
    const root = await mount();
    const link = document.body.querySelector<HTMLAnchorElement>('a[href="/cart"]')!;
    const pill = Array.from(link.querySelectorAll("span")).find(
      (node) => node.classList.contains("inline-flex") && node.textContent?.includes("View Cart"),
    );
    expect(pill).toBeDefined();
    expect(pill!.className.split(/\s+/)).toContain("min-h-[44px]");
    await act(async () => root.unmount());
  });

  it("preserves a long total and the item count without truncation", async () => {
    const root = await mount();
    const link = document.body.querySelector<HTMLAnchorElement>('a[href="/cart"]')!;
    expect(link.textContent).toContain("₹3,897.00"); // 1299 * 3
    expect(link.textContent).toContain("3 items");
    // A money amount is never clipped.
    expect(link.querySelector(".truncate")).toBeNull();
    await act(async () => root.unmount());
  });

  it("stays on two fixed lines at 360dp instead of wrapping to five", async () => {
    // Measured on a real SM-S921B (360 CSS px): with `flex-wrap` and a slogan
    // line the 104px text column wrapped to five lines and the bar grew to
    // 124px. `min-h-14` only sets a floor, so the height has to be held by the
    // content: exactly two lines that cannot wrap.
    const root = await mount();
    const link = document.body.querySelector<HTMLAnchorElement>('a[href="/cart"]')!;
    expect(link.querySelector(".flex-wrap")).toBeNull();

    const nodeFor = (text: string) =>
      Array.from(link.querySelectorAll("span")).find((node) => node.textContent?.trim() === text);
    const price = nodeFor("₹3,897.00");
    const count = nodeFor("3 items");
    expect(price, "price line").toBeDefined();
    expect(count, "count line").toBeDefined();
    expect(price!.className.split(/\s+/)).toContain("whitespace-nowrap");
    expect(count!.className.split(/\s+/)).toContain("whitespace-nowrap");
    await act(async () => root.unmount());
  });

  it("leaves the tax statement to the bill instead of a third line", async () => {
    // BillBreakdown states "Inclusive of all taxes (5% GST)" on cart and
    // checkout, so GST stays visible wherever the customer commits to a total.
    const root = await mount();
    const link = document.body.querySelector<HTMLAnchorElement>('a[href="/cart"]')!;
    expect(link.textContent).not.toContain("Taxes included");
    expect(link.textContent).not.toContain("Pure Veg");
    await act(async () => root.unmount());
  });
});
