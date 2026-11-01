/** @vitest-environment jsdom */
/**
 * L5 — the best-seller card took `lines.find(...)`, i.e. the FIRST line for the
 * product, so the same product added twice with different modifiers displayed
 * only one variant's quantity. Fails against the pre-fix source (shows 1 for a
 * 1 + 2 pair) and passes once matching lines are summed.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params: _params,
    className,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <a href={String(to)} className={className} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
// Hermetic motion: no rAF / matchMedia dependency in jsdom.
vi.mock("motion/react", () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: { children?: React.ReactNode }) => <div>{props.children}</div>,
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: {
    addItem: vi.fn(),
    updateQuantity: vi.fn(),
    removeItem: vi.fn(),
  },
}));
// The card only reads `activeStore` for the quick-add guard.
vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: (selector?: (s: { activeStore: null }) => unknown) =>
    selector ? selector({ activeStore: null }) : { activeStore: null },
}));

import { BestSellerCard } from "./BestSellerCard";
import { useCartStore } from "@/features/cart/state/cartStore";
import type { CartLine } from "@/features/cart/models";
import type { Product } from "@/features/menu/models";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const product: Product = {
  id: "prod_truffle",
  categoryId: "cat_burgers",
  name: "Truffle Mushroom Smash",
  description: "Sauteed mushrooms, truffle aioli",
  price: 299,
  veg: true,
  inStock: true,
};

/** One cart line for `product`, distinguished by its modifier selection. */
const lineFor = (lineId: string, quantity: number, optionId: string): CartLine => ({
  lineId,
  productId: product.id,
  storeId: "store_1",
  name: product.name,
  unitPrice: 299,
  quantity,
  modifiers: [
    {
      groupId: "grp_bun",
      groupName: "Choose Bun",
      optionId,
      name: optionId,
      priceDelta: 0,
    },
  ],
  availability: "available",
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const mount = async (ui: React.ReactElement) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
};

const shownQuantity = () =>
  host!.querySelector<HTMLElement>('[class*="tabular-nums"]')?.textContent ?? null;

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  root = null;
  host = null;
  document.body.innerHTML = "";
  useCartStore.setState({ lines: [] });
  vi.clearAllMocks();
});

describe("L5 — best-seller quantity reflects every line of the product", () => {
  it("sums the quantity across variant lines instead of showing only the first", async () => {
    useCartStore.setState({
      lines: [lineFor("line_custom", 2, "opt_gluten"), lineFor("line_basic", 1, "opt_brioche")],
    });
    await mount(<BestSellerCard product={product} />);

    expect(shownQuantity()).toBe("3");
  });

  it("ignores lines that belong to another product", async () => {
    useCartStore.setState({
      lines: [
        lineFor("line_own", 2, "opt_brioche"),
        { ...lineFor("line_other", 5, "opt_brioche"), productId: "prod_other" },
      ],
    });
    await mount(<BestSellerCard product={product} />);

    expect(shownQuantity()).toBe("2");
  });

  it("shows no stepper when the product is not in the cart", async () => {
    useCartStore.setState({
      lines: [{ ...lineFor("line_other_prod", 4, "opt_brioche"), productId: "prod_other" }],
    });
    await mount(<BestSellerCard product={product} />);

    expect(shownQuantity()).toBeNull();
  });
});
