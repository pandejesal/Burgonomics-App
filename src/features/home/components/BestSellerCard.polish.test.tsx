/**
 * Polish regression: Home's quick-add and stepper must meet the 44px touch
 * floor used on Menu and carry product-specific action names. Synthetic product
 * and cart-line fixtures only; repository calls are mocked.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  addItem: vi.fn(),
  updateQuantity: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    className,
    children,
    onClick,
  }: {
    to: string;
    className?: string;
    children?: React.ReactNode;
    onClick?: (event: React.MouseEvent) => void;
  }) => (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("motion/react", async () => {
  const ReactRuntime = await vi.importActual<typeof import("react")>("react");
  const motionTypes = new Map<string, React.ComponentType<Record<string, unknown>>>();
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const cached = motionTypes.get(tag);
        if (cached) return cached;
        const type = ReactRuntime.forwardRef(
          (
            props: Record<string, unknown> & { children?: React.ReactNode },
            ref: React.Ref<unknown>,
          ) => {
            const {
              children,
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              whileTap: _whileTap,
              whileHover: _whileHover,
              layout: _layout,
              ...domProps
            } = props;
            return ReactRuntime.createElement(
              tag,
              { ...domProps, ref },
              children,
            );
          },
        );
        motionTypes.set(tag, type as unknown as React.ComponentType<Record<string, unknown>>);
        return type;
      },
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      ReactRuntime.createElement(ReactRuntime.Fragment, null, children),
    useReducedMotion: () => false,
  };
});
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: {
    addItem: fixture.addItem,
    updateQuantity: fixture.updateQuantity,
    removeItem: fixture.removeItem,
  },
}));
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (select: (state: unknown) => unknown) =>
    select({ activeStore: { id: "store_1" } }),
}));

import { BestSellerCard } from "./BestSellerCard";
import { useCartStore } from "@/features/cart/state/cartStore";
import type { CartLine } from "@/features/cart/models";
import type { Product } from "@/features/menu/models";

const product: Product = {
  id: "prod_truffle",
  categoryId: "cat_burgers",
  name: "Truffle Mushroom Smash",
  description: "Sauteed mushrooms, truffle aioli",
  price: 299,
  veg: true,
  inStock: true,
};

const lineFor = (quantity: number): CartLine => ({
  lineId: "line_truffle",
  productId: product.id,
  storeId: "store_1",
  name: product.name,
  unitPrice: 299,
  quantity,
  modifiers: [],
  availability: "available",
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fixture.addItem.mockReset();
  fixture.addItem.mockResolvedValue({ success: true, data: {} });
  fixture.updateQuantity.mockReset();
  fixture.updateQuantity.mockResolvedValue({ success: true, data: {} });
  fixture.removeItem.mockReset();
  fixture.removeItem.mockResolvedValue({ success: true, data: {} });
  useCartStore.setState({ lines: [] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  useCartStore.setState({ lines: [] });
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => root.render(<BestSellerCard product={product} />));
  await act(async () => {});
}

const classTokens = (node: Element) => node.className.split(/\s+/);

describe("Home best-seller quick add", () => {
  it("renders a named 44px ADD control and still quick-adds the product", async () => {
    await mount();

    const add = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add Truffle Mushroom Smash to cart"]',
    );
    expect(add, "named ADD button").not.toBeNull();
    expect(add!.tagName).toBe("BUTTON");
    expect(classTokens(add!)).toContain("min-h-[44px]");
    expect(container.querySelectorAll("a button")).toHaveLength(0);

    await act(async () => add!.click());

    expect(fixture.addItem).toHaveBeenCalledOnce();
    expect(fixture.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store_1",
        productId: "prod_truffle",
        name: "Truffle Mushroom Smash",
        quantity: 1,
      }),
    );
  });

  it("renders 44px product-named stepper actions and preserves increment/decrement", async () => {
    useCartStore.setState({ lines: [lineFor(2)] });
    await mount();

    const increase = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase quantity of Truffle Mushroom Smash"]',
    );
    const decrease = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Decrease quantity of Truffle Mushroom Smash"]',
    );
    expect(increase, "named increase button").not.toBeNull();
    expect(decrease, "named decrease button").not.toBeNull();
    expect(classTokens(increase!)).toContain("min-h-[44px]");
    expect(classTokens(decrease!)).toContain("min-h-[44px]");

    await act(async () => increase!.click());
    expect(fixture.updateQuantity).toHaveBeenCalledWith("line_truffle", 3);

    await act(async () => decrease!.click());
    expect(fixture.updateQuantity).toHaveBeenCalledWith("line_truffle", 1);
  });

  it("keeps the decrement-at-one remove behaviour with an accurate action name", async () => {
    useCartStore.setState({ lines: [lineFor(1)] });
    await mount();

    const remove = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Truffle Mushroom Smash from cart"]',
    );
    expect(remove, "named remove button at quantity 1").not.toBeNull();
    expect(classTokens(remove!)).toContain("min-h-[44px]");

    await act(async () => remove!.click());
    expect(fixture.removeItem).toHaveBeenCalledWith("line_truffle");
  });
});
