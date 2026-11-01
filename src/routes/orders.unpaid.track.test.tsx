/**
 * CUS-16 — a live staging order (ord_1793523404362_PKKeDF) was created before
 * Razorpay opened, then the customer closed the sheet. The server document is
 * `status PLACED` + `payment.status pending` (online), yet the tracking screen
 * said "Order Placed & Confirmed" and "Kitchen has acknowledged" — neither was
 * true. This mounts the REAL tracking route with the REAL server-shaped order.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  orderId: "ord_1793523404362_PKKeDF",
  order: null as unknown,
  getOrderResult: null as unknown,
  navigate: vi.fn(),
  cancelOrder: vi.fn(),
}));

vi.mock("leaflet", () => ({
  default: {
    divIcon: () => ({}),
    icon: () => ({}),
    map: () => ({}),
    marker: () => ({}),
    latLng: () => ({}),
    latLngBounds: () => ({ fitBounds: () => {} }),
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ setView: () => {}, fitBounds: () => {} }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: { component: React.ComponentType }) => ({
      options,
      useParams: () => ({ orderId: fixture.orderId }),
    }),
    useNavigate: () => fixture.navigate,
    Link: ({
      to,
      search,
      children,
      ...rest
    }: {
      to: string;
      search?: Record<string, string>;
      children?: React.ReactNode;
    }) => (
      <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : String(to)} {...rest}>
        {children}
      </a>
    ),
  };
});

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    bottomSlot,
  }: {
    children?: React.ReactNode;
    bottomSlot?: React.ReactNode;
  }) => (
    <main>
      {children}
      {bottomSlot}
    </main>
  ),
}));

vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/features/orders/repositories/OrderRepository", () => ({
  orderRepository: {
    getOrder: vi.fn(
      async () => (fixture.getOrderResult as any) ?? { success: true, data: fixture.order },
    ),
    subscribeTracking: vi.fn(() => ({ stop: () => {}, refresh: async () => {} })),
    buildTrackUrl: vi.fn(() => "/track"),
  },
}));

vi.mock("@/features/orders/services/ordersService", () => ({
  ordersService: { cancelOrder: fixture.cancelOrder },
}));

import { Route } from "@/routes/orders.$orderId.track";
import { useOrdersStore } from "@/features/orders/state/ordersStore";
import type { Order } from "@/features/orders/models";

const TrackOrderPage = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

/** The real server document shape for the stuck staging order. */
function serverOrder(overrides: {
  paymentStatus?: "pending" | "paid";
  method?: "online" | "cod";
  placedAt?: string;
  statusCode?: string;
} = {}): Order {
  return {
    id: fixture.orderId,
    shortCode: "BG-PKKEDF",
    userId: "ueVCEFPxfEW5tJy4NgBebTqudgy1",
    customerId: "ueVCEFPxfEW5tJy4NgBebTqudgy1",
    status: { code: overrides.statusCode ?? "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    fulfillment: "takeaway",
    store: {
      id: "demo",
      name: "Burgonomics DEMO",
      address: "Demo outlet",
      area: "Vesu",
      city: "Surat",
      phone: "+919876543210",
    },
    items: [
      {
        lineId: "prod_demo_30653-1793523392676-y5zn",
        productId: "prod_demo_30653",
        storeId: "demo",
        name: "Matar Mushroom Rice Bowl",
        unitPrice: 10,
        quantity: 1,
        modifiers: [],
        availability: "available",
      },
    ],
    totals: {
      subtotal: 10,
      taxes: 0.48,
      packingFee: 0,
      deliveryFee: 0,
      promoDiscount: 0,
      grandTotal: 10,
    },
    payment: {
      method: overrides.method ?? "online",
      label: overrides.method === "cod" ? "Cash on Delivery" : "Pay Online",
      status: overrides.paymentStatus ?? "pending",
    },
    placedAt: overrides.placedAt ?? new Date(Date.now() - 10 * 60_000).toISOString(),
  } as unknown as Order;
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => root.render(<TrackOrderPage />));
  await act(async () => {});
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  useOrdersStore.setState({ byId: {}, orderIds: [], activeOrderId: null } as never);
  fixture.cancelOrder.mockResolvedValue({ success: true, data: null });
  fixture.getOrderResult = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("CUS-16 — tracking derives status from the real payment state", () => {
  it("an abandoned unpaid online order never claims the kitchen confirmed it", async () => {
    fixture.order = serverOrder();
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("Payment not completed");
    expect(text).toContain("kitchen has not received");
    expect(text).not.toContain("Order Placed & Confirmed");
    expect(text).not.toContain("Kitchen has acknowledged");

    const payLink = Array.from(container.querySelectorAll("a")).find((a) =>
      (a.getAttribute("href") ?? "").startsWith("/payment"),
    );
    expect(payLink?.textContent).toContain("Complete payment");
    // Resume the SAME order; do not mint another one.
    expect(payLink?.getAttribute("href")).toContain(
      `orderId=${encodeURIComponent(fixture.orderId)}`,
    );
    expect(container.querySelector('[data-testid="cancel-unpaid-order"]')).not.toBeNull();
  });

  it("the progress stepper never reads as confirmed on an unpaid order", async () => {
    // Live (3515da9): the stepper still showed a "Confirmed" sub-label on an
    // unpaid order, and step 1 rendered as the current (highlighted) stage.
    // An order the kitchen never received has not been confirmed.
    fixture.order = serverOrder();
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("Payment not completed");
    expect(text).not.toContain("Confirmed");

    // No step is done or current before the server records the payment.
    const current = container.querySelectorAll('[aria-current="step"]');
    expect(current.length).toBe(0);
  });

  it("the payment race shows confirming, never a failure, right after paying", async () => {
    fixture.order = serverOrder({ placedAt: new Date().toISOString() });
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("Confirming payment");
    expect(text).not.toContain("Payment not completed");
    expect(text).not.toMatch(/payment failed/i);
    expect(text).not.toContain("Kitchen has acknowledged");
  });

  it("a paid online order keeps the paid confirmation state", async () => {
    fixture.order = serverOrder({ paymentStatus: "paid", statusCode: "CONFIRMED" });
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("Order Placed & Confirmed");
    expect(text).not.toContain("Payment not completed");
  });

  it("a cash order behaves exactly as before", async () => {
    fixture.order = serverOrder({ method: "cod" });
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("Order Placed & Confirmed");
    expect(text).not.toContain("Payment not completed");
  });

  it("shows a load failure with Retry, never 'Order not found', when the read fails", async () => {
    // Live incident: a signed-in customer deep-linked to a real order while
    // Firebase Auth was still restoring; the denied read rendered "Order not
    // found". A failed read must be visibly a failure.
    fixture.order = null;
    fixture.getOrderResult = {
      success: false,
      error: {
        code: "ORDER_READ_FAILED",
        message: "We couldn't load this order. Please check your connection and try again.",
        retryable: true,
      },
    };
    await mount();

    const text = container.textContent ?? "";
    expect(text).toContain("Couldn't load this order");
    expect(text).not.toContain("Order not found");
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Try again",
      ),
    ).toBe(true);
  });

  it("cancelling the unpaid order uses the existing cancel flow", async () => {
    fixture.order = serverOrder();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await mount();

    const cancel = container.querySelector<HTMLButtonElement>('[data-testid="cancel-unpaid-order"]');
    expect(cancel).not.toBeNull();
    await act(async () => cancel!.click());

    expect(fixture.cancelOrder).toHaveBeenCalledWith(fixture.orderId);
    confirmSpy.mockRestore();
  });
});
