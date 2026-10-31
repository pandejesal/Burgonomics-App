/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/features/menu/models";

const effects = vi.hoisted(() => ({
  navigate: vi.fn(),
  addItem: vi.fn(async () => ({ success: true })),
  updateQuantity: vi.fn(async () => ({ success: true })),
  removeItem: vi.fn(async () => ({ success: true })),
  lines: [] as Array<{ lineId: string; productId: string; quantity: number }>,
  fulfillment: "delivery",
  setFulfillment: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => effects.navigate,
  Link: ({
    to,
    params: _params,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    params?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/features/cart/state/cartStore", () => ({
  useCartStore: (select: (state: unknown) => unknown) => select({ lines: effects.lines }),
}));
vi.mock("@/features/cart/repositories/CartRepository", () => ({ cartRepository: effects }));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({
      activeStore: {
        id: "verified-store",
        name: "Burgonomics - An unusually long owner-confirmed outlet name",
        address: "The actual loaded address, Ahmedabad",
      },
      fulfillment: effects.fulfillment,
      setFulfillment: effects.setFulfillment,
    }),
}));
vi.mock("@/features/addresses", () => ({
  useAddressStore: () => null,
  selectSelectedAddress: vi.fn(),
}));
vi.mock("@/features/notifications/state/notificationsStore", () => ({
  useNotificationsStore: (select: (state: unknown) => unknown) => select({ unreadCount: 2 }),
}));
vi.mock("@/shared/components/common/SafeImage", () => ({
  SafeImage: ({
    fallbackSrc: _fallback,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fallbackSrc?: string;
  }) => <img {...props} />,
}));
vi.mock("motion/react", () => ({ useReducedMotion: () => true }));

import { BestSellerCard } from "./BestSellerCard";
import { BrandHeader } from "./BrandHeader";
import { ComboCard } from "./ComboCard";
import { ModeSegmentedSwitch } from "./ModeSegmentedSwitch";
import { SectionHeader } from "./SectionHeader";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | null = null;
let host: HTMLDivElement;
const product: Product = {
  id: "product-1",
  categoryId: "actual-category",
  name: "A long product title that must remain readable",
  description: "A full product description that must not be hidden behind a one-line clamp.",
  price: 249,
  veg: true,
  inStock: true,
};

async function mount(element: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
  effects.lines = [];
  vi.clearAllMocks();
});

describe("Home readability without changing ordering/navigation", () => {
  it("keeps long headings visible and identifies their sections", async () => {
    await mount(
      <SectionHeader
        id="section-title"
        title="A long section title"
        actionLabel="Full menu"
        actionTo="/menu"
      />,
    );
    expect(host.querySelector("h2")?.id).toBe("section-title");
    expect(host.querySelector("h2")?.className).not.toContain("truncate");
    expect(host.querySelector("a")?.className).toContain("min-h-11");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/menu");
  });

  it("shows full product copy and a named, 44px green Add action", async () => {
    await mount(<BestSellerCard product={product} />);
    expect(host.querySelector("h3")?.textContent).toBe(product.name);
    expect(host.querySelector("h3")?.className).not.toMatch(/truncate|line-clamp/);
    expect(host.querySelector("p")?.textContent).toBe(product.description);
    expect(host.querySelector("p")?.className).not.toContain("line-clamp");
    const add = host.querySelector("button")!;
    expect(add.getAttribute("aria-label")).toBe(`Add ${product.name} to cart`);
    expect(add.className).toContain("min-h-11");
    expect(add.className).toContain("bg-primary");
    await act(async () => add.click());
    expect(effects.addItem).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "verified-store", productId: product.id }),
    );
  });

  it("keeps the lower-Home food rail unboxed with a square photo", async () => {
    await mount(<BestSellerCard product={product} />);
    expect(host.firstElementChild?.classList.contains("border")).toBe(false);
    expect(host.firstElementChild?.className).not.toContain("bg-surface");
    expect(host.querySelector("a")?.className).toContain("aspect-square");
    expect(host.querySelectorAll("button")).toHaveLength(1);
  });

  it("opens required product options instead of quick-adding a customizable bestseller", async () => {
    await mount(<BestSellerCard product={{ ...product, customizable: true }} />);
    await act(async () => host.querySelector("button")!.click());
    expect(effects.addItem).not.toHaveBeenCalled();
    expect(effects.navigate).toHaveBeenCalledWith({
      to: "/menu/product/$productId",
      params: { productId: product.id },
    });
  });

  it("names both stepper actions and keeps removal available for sold-out products", async () => {
    effects.lines = [{ lineId: "line-1", productId: product.id, quantity: 1 }];
    await mount(<BestSellerCard product={{ ...product, inStock: false }} />);
    const buttons = host.querySelectorAll("button");
    expect(buttons[0].getAttribute("aria-label")).toBe(`Remove one ${product.name}`);
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[0].className).toContain("h-11 w-11");
    await act(async () => buttons[0].click());
    expect(effects.removeItem).toHaveBeenCalledWith("line-1");
  });

  it("does not show a loyalty balance or clip the selected outlet in the header", async () => {
    await mount(<BrandHeader />);
    expect(host.querySelector("header")?.className).toContain("bg-background");
    expect(host.textContent).toContain("An unusually long owner-confirmed outlet name");
    expect(host.querySelector('[aria-label="Loyalty Points"]')).toBeNull();
    expect(host.textContent).not.toMatch(/\bpts\b|Grill Coins/);
    const notifications = host.querySelector('[aria-label="Notifications, 2 unread"]')!;
    expect(notifications.className).toContain("h-11 w-11");
    // Approved direction: the outlet row is unboxed and Search is no longer in
    // the header — it lives beside the Menu heading below the promo.
    const outlet = host.querySelector('a[href="/stores"]')!;
    expect(outlet.className).not.toContain("bg-bg-secondary");
    expect(host.querySelector('[aria-label="Search the menu"]')).toBeNull();
    expect(host.querySelector('input[type="search"]')).toBeNull();
    expect(host.querySelector('[aria-label="Burgonomics Home"] > span')?.className).toContain(
      "text-2xl",
    );
    expect(effects.navigate).not.toHaveBeenCalled();
  });

  it("keeps fulfillment keyboard-operable without gesture animation", async () => {
    const onChange = vi.fn();
    await mount(<ModeSegmentedSwitch value="delivery" onChange={onChange} />);
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(radios[0].tabIndex).toBe(0);
    expect(radios[1].tabIndex).toBe(-1);
    await act(async () =>
      radios[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(onChange).toHaveBeenCalledWith("takeaway");
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[0].className).toContain("min-h-12");
  });

  it("keeps combo names readable and does not invent a savings claim or image", async () => {
    await mount(
      <ComboCard
        combo={{
          id: "actual-combo",
          name: "An actual long combo name",
          description: "Full details",
          price: 100,
          originalPrice: 100,
          gradient: "",
          visual: "",
        }}
      />,
    );
    expect(host.querySelector("h3")?.className).not.toContain("truncate");
    expect(host.querySelector("button")?.getAttribute("aria-label")).not.toContain("save");
    expect(host.textContent).toContain("Photo unavailable");
    await act(async () => host.querySelector("button")!.click());
    expect(effects.navigate).toHaveBeenCalledWith({ to: "/menu" });
  });

  it("opens the actual meal product even when its catalog ID has no prd_ prefix", async () => {
    await mount(
      <ComboCard
        combo={{
          id: "812736",
          productId: "812736",
          name: "An actual meal",
          description: "From the catalog",
          price: 327,
          originalPrice: 327,
          gradient: "",
          visual: "",
        }}
      />,
    );
    await act(async () => host.querySelector("button")!.click());
    expect(effects.navigate).toHaveBeenCalledWith({
      to: "/menu/product/$productId",
      params: { productId: "812736" },
    });
  });
});
