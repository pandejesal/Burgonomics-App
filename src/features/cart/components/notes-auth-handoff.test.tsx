/**
 * The real hand-off: type into the cart's cooking-notes editor, sign in at
 * checkout (auth uid change), then place a cash order. The note the customer
 * typed must be the note the order document is created with.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  createOrder: vi.fn(async () => ({ success: true, data: { id: "ord_notes" } })),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...rest}>{children}</a>
  ),
}));

vi.mock("@/core/services/haptics", () => ({
  HapticService: { selection: vi.fn(), impact: vi.fn() },
}));

vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: {
    calculateTotals: vi.fn(async () => ({
      success: true,
      data: {
        subtotal: 199,
        taxes: 9.48,
        packingFee: 20,
        deliveryFee: 0,
        promoDiscount: 0,
        grandTotal: 219,
      },
    })),
    updateNotes: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock("@/features/orders/services/ordersService", () => ({
  ordersService: { createOrder: fixture.createOrder },
}));

vi.mock("@/features/orders/state/ordersStore", () => ({
  useOrdersStore: {
    getState: () => ({ upsert: vi.fn(), setActiveOrderId: vi.fn() }),
  },
  selectAllOrders: () => [],
}));

vi.mock("@/features/stores/state/storeStore", () => ({
  useStoreSelection: Object.assign(
    (select: (state: unknown) => unknown) =>
      select({ activeStore: { id: "demo", name: "DEMO" }, fulfillment: "takeaway" }),
    {
      getState: () => ({
        activeStore: { id: "demo", name: "DEMO" },
        fulfillment: "takeaway",
      }),
    },
  ),
}));

vi.mock("@/features/addresses", () => ({
  useAddressStore: Object.assign(
    (select: (state: unknown) => unknown) => select({ selectedId: null }),
    { getState: () => ({ selectedId: null }) },
  ),
  selectSelectedAddress: () => null,
}));

import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import { CookingInstructionsSection } from "@/features/cart/components/CookingInstructionsSection";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { OrderRepository } from "@/features/orders/repositories/OrderRepository";

let emitAuth: (state: { user: { id?: string } | null }) => void = () => {};
let currentUid: string | null = null;
const listeners: Array<(state: { user: { id?: string } | null }) => void> = [];

configureAuthUidSource({
  getUid: () => currentUid,
  subscribe: (listener) => {
    listeners.push(listener);
    emitAuth = (state) => {
      for (const registered of listeners) registered(state);
    };
    return () => undefined;
  },
});

const repository = new OrderRepository({ createOrder: fixture.createOrder } as never);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.clear();
  fixture.createOrder.mockClear();
  currentUid = null;
  useCartStore.setState({
    lines: [
      {
        lineId: "line_1",
        productId: "prod_demo_30653",
        storeId: "demo",
        name: "Matar Mushroom Rice Bowl",
        unitPrice: 10,
        quantity: 1,
        modifiers: [],
        availability: "available",
      },
    ],
  } as never);
  useCheckoutStore.setState({
    orderNotes: "",
    legacyOrderNotes: "",
    deliveryInstructions: "",
    pickupInstructions: "",
    diningNotes: "",
    tableNumber: "",
    tipAmount: 0,
    notesScope: { uid: null, storeId: "demo" },
    notesRevision: 0,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function typeNote(value: string) {
  const toggle = container.querySelector<HTMLButtonElement>('[aria-controls="cooking-notes-field"]');
  expect(toggle).not.toBeNull();
  await act(async () => toggle!.click());
  const field = container.querySelector<HTMLTextAreaElement>("#order-notes");
  expect(field).not.toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(field, value);
    field!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("cooking notes typed before checkout sign-in reach the order", () => {
  it("keeps the guest draft through sign-in and saves it on a cash order", async () => {
    await act(async () => root.render(<CookingInstructionsSection />));
    await typeNote("No onions, extra spicy");
    expect(useCheckoutStore.getState().orderNotes).toBe("No onions, extra spicy");

    // The customer signs in inside checkout before paying.
    await act(async () => {
      currentUid = "uid_qa";
      emitAuth({ user: { id: "uid_qa" } });
    });
    expect(useCheckoutStore.getState().orderNotes).toBe("No onions, extra spicy");

    await act(async () => {
      await repository.createFromCurrentContext({ paymentMethod: "cash" });
    });

    expect(fixture.createOrder).toHaveBeenCalledTimes(1);
    const input = (fixture.createOrder.mock.calls[0] as unknown[])[0] as { notes?: string };
    expect(input.notes).toBe("No onions, extra spicy");
  });
});
