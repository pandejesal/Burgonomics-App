/**
 * Polish regression: product Add To Cart uses the semantic accent pair and
 * still performs the real add navigation. Synthetic product fixture only.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  addItem: vi.fn(),
  product: {
    id: "product_1",
    categoryId: "cat_1",
    name: "Test Burger",
    description: "A test burger",
    price: 199,
    veg: true,
    inStock: true,
    customizations: [],
    nutrition: undefined,
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useParams: () => ({ productId: "product_1" }),
  }),
  useParams: () => ({ productId: "product_1" }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    bottomSlot,
  }: {
    children: React.ReactNode;
    bottomSlot?: React.ReactNode;
  }) => (
    <div>
      {children}
      {bottomSlot}
    </div>
  ),
}));
vi.mock("@/shared/components/common/SafeImage", () => ({
  SafeImage: ({ alt }: { alt?: string }) => <img alt={alt} />,
}));
vi.mock("@/shared/components/feedback/EmptyState", () => ({
  EmptyState: () => null,
}));
vi.mock("@/shared/components/feedback/FailureState", () => ({
  FailureState: () => null,
}));
vi.mock("@/shared/components/feedback/Skeleton", () => ({
  Skeleton: () => null,
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({ activeStore: { id: "store_1" } }),
}));
vi.mock("@/features/menu/state/menuStore", () => ({
  useMenuStore: (select: (state: unknown) => unknown) =>
    select({ pushRecentlyViewed: vi.fn() }),
}));
vi.mock("@/features/menu/repositories/MenuRepository", () => ({
  menuRepository: {
    getProduct: vi.fn(async () => ({ success: true, data: fixture.product })),
    listRelatedProducts: vi.fn(async () => ({ success: true, data: [] })),
  },
}));
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: { addItem: fixture.addItem },
}));
vi.mock("@/features/menu/components/ModifierGroupSelector", () => ({
  ModifierGroupSelector: () => null,
}));
vi.mock("@/features/menu/components/NutritionAllergenPanel", () => ({
  NutritionAllergenPanel: () => null,
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn() },
}));

import { Route as ProductRoute } from "./menu.product.$productId";
import { toast } from "sonner";

const ProductPage = (ProductRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fixture.navigate.mockReset();
  fixture.addItem.mockReset();
  fixture.addItem.mockResolvedValue({ success: true, data: {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => root.render(<ProductPage />));
  await act(async () => {});
}

const classTokens = (node: Element) => node.className.split(/\s+/);

describe("product purchase-path accent tokens", () => {
  it("renders Add To Cart with the accent pair and still adds the item", async () => {
    await mount();

    const add = Array.from(container.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Add To Cart"),
    );
    expect(add, "Add To Cart button").toBeDefined();
    expect(classTokens(add!)).toEqual(
      expect.arrayContaining([
        "bg-accent",
        "text-accent-foreground",
        "hover:bg-[var(--accent-hover)]",
        "dark:bg-[var(--accent-hover)]",
      ]),
    );
    expect(container.innerHTML).not.toContain("#FF6600");
    expect(container.innerHTML).not.toContain("#e05a00");

    await act(async () => add!.click());

    expect(fixture.addItem).toHaveBeenCalledOnce();
    expect(fixture.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product_1",
        name: "Test Burger",
        quantity: 1,
        unitPrice: 199,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Added 1x Test Burger to cart!");
    expect(fixture.navigate).toHaveBeenCalledWith({ to: "/menu" });
  });

  it("reflects veg tri-state accurately: true -> 100% PURE VEG, false -> NON-VEG, undefined -> neither", async () => {
    // 1. veg: true
    fixture.product.veg = true;
    await mount();
    expect(container.textContent).toContain("100% PURE VEG");
    expect(container.textContent).not.toContain("NON-VEG");

    // 2. veg: false
    fixture.product.veg = false;
    await mount();
    expect(container.textContent).toContain("NON-VEG");
    expect(container.textContent).not.toContain("100% PURE VEG");

    // 3. veg: undefined
    delete (fixture.product as { veg?: boolean }).veg;
    await mount();
    expect(container.textContent).not.toContain("100% PURE VEG");
    expect(container.textContent).not.toContain("NON-VEG");
  });

  it("renders compareAtPrice strikethrough, discount pill, badges, and unavailableReason fallback", async () => {
    fixture.product.veg = true;
    fixture.product.price = 199;
    (fixture.product as Record<string, unknown>).compareAtPrice = 299;
    (fixture.product as Record<string, unknown>).badges = [{ id: "b1", label: "Chef Special" }];
    (fixture.product as Record<string, unknown>).inStock = false;
    (fixture.product as Record<string, unknown>).unavailableReason = "Kitchen Closed for Maintenance";

    await mount();

    // compareAtPrice & discount
    expect(container.textContent).toContain("₹299.00");
    expect(container.textContent).toContain("33% OFF");

    // badges
    expect(container.textContent).toContain("Chef Special");

    // unavailableReason
    expect(container.textContent).toContain("Kitchen Closed for Maintenance");
  });
});
