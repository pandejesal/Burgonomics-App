/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

// React act() needs this flag outside of Jest.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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
  MapContainer: ({ children }: any) => <div className="leaflet-map-mock">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => ({ setView: () => {}, fitBounds: () => {} }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// The card links through TanStack Router but mounts standalone here;
// TanStack's Link dereferences the router, so stub it with a plain anchor
// that still resolves the `search` object into query params.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      search,
      className,
      children,
      ...rest
    }: {
      to: string;
      search?: Record<string, string>;
      className?: string;
      children?: React.ReactNode;
    }) => (
      <a
        href={search ? `${to}?${new URLSearchParams(search).toString()}` : String(to)}
        className={className}
        {...rest}
      >
        {children}
      </a>
    ),
  };
});

vi.mock("@/features/orders/services/ordersService", () => ({
  ordersService: { cancelOrder: vi.fn() },
}));

import { getTrackingStateFromOrder } from "../features/tracking/hooks/usePorterLiveTracking";
import { LiveOrderMap } from "../features/tracking/components/LiveOrderMap";
import { DeliveryStepTracker } from "../features/tracking/components/DeliveryStepTracker";
import { CancellationGraceCard } from "./orders.$orderId.track";
import { ordersService } from "@/features/orders/services/ordersService";
import { toast } from "sonner";
import type { Order } from "../features/orders";

describe("Prompt 26: Live Order Tracking & Porter GPS Map Suite", () => {
  describe("1. 4-Stage Stepper State Mapping", () => {
    it("maps ORDER_PLACED status code to Stage 1", () => {
      const order = {
        id: "ord_101",
        status: { code: "ORDER_PLACED", label: "Order Placed", kind: "upcoming", terminal: false },
        fulfillment: "delivery",
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.currentStage).toBe(1);
      expect(state.stageName).toBe("Order Placed & Confirmed");
      // ETA comes from order.estimatedAt only — this order has none.
      expect(state.etaMinutes).toBeNull();
    });

    it("maps KITCHEN_PREPARING status code to Stage 2 with Grilling status", () => {
      const order = {
        id: "ord_102",
        status: {
          code: "KITCHEN_PREPARING",
          label: "Grilling",
          kind: "in_progress",
          terminal: false,
        },
        fulfillment: "delivery",
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.currentStage).toBe(2);
      expect(state.stageName).toBe("Freshly Grilling in Kitchen");
      // No hardcoded stage countdown — null without a real estimate.
      expect(state.etaMinutes).toBeNull();
    });

    it("maps OUT_FOR_DELIVERY status code to Stage 3 with active Porter rider", () => {
      const order = {
        id: "ord_103",
        status: {
          code: "OUT_FOR_DELIVERY",
          label: "Out for Delivery",
          kind: "in_progress",
          terminal: false,
        },
        fulfillment: "delivery",
        delivery: {
          riderName: "Vikram Rathore",
          riderPhone: "+91 98250 88991",
          riderVehicleNumber: "GJ-01-AB-1234",
        },
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.currentStage).toBe(3);
      expect(state.stageName).toBe("Out for Delivery with Porter");
      expect(state.riderName).toBe("Vikram Rathore");
      expect(state.riderPhone).toBe("+91 98250 88991");
      expect(state.riderVehicleNumber).toBe("GJ-01-AB-1234");
    });

    it("maps DELIVERED status code to Stage 4 Complete", () => {
      const order = {
        id: "ord_104",
        status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
        fulfillment: "delivery",
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.currentStage).toBe(4);
      expect(state.isDelivered).toBe(true);
      // A delivered order without an estimate has no ETA to report.
      expect(state.etaMinutes).toBeNull();
    });
  });

  describe("2. Takeaway vs Delivery Mode Handling", () => {
    it("switches stage 3 to Counter Pickup ready state for takeaway orders", () => {
      const order = {
        id: "ord_201",
        status: { code: "READY", label: "Ready", kind: "in_progress", terminal: false },
        fulfillment: "takeaway",
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.isTakeawayOrDineIn).toBe(true);
      expect(state.currentStage).toBe(3);
      expect(state.stageName).toBe("Packed & Ready for Counter Pickup");
    });
  });

  describe("3. Coordinate Sanity & Geocoding", () => {
    it("returns null coordinates instead of fabricating defaults when coordinates are missing", () => {
      const order = {
        id: "ord_301",
        status: { code: "ORDER_PLACED", label: "Placed", kind: "upcoming", terminal: false },
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.storeLocation).toBeNull();
      expect(state.dropLocation).toBeNull();
    });

    it("keeps real outlet and address coordinates when the order provides them", () => {
      const order = {
        id: "ord_302",
        status: {
          code: "OUT_FOR_DELIVERY",
          label: "Out for Delivery",
          kind: "in_progress",
          terminal: false,
        },
        fulfillment: "delivery",
        store: { id: "s1", name: "Burgonomics CG Road", lat: 23.0131, lng: 72.5085 },
        address: { label: "Home", line1: "5 River Side", lat: 23.0338, lng: 72.5262 },
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      expect(state.storeLocation).toEqual({ lat: 23.0131, lng: 72.5085 });
      expect(state.dropLocation).toEqual({ lat: 23.0338, lng: 72.5262 });
      // GPS absent → no rider pin source, ever.
      expect(state.riderLocation).toBeNull();
    });
  });

  describe("4. Honest map rendering (P1-2)", () => {
    const noCoordsOrder = {
      id: "ord_401",
      status: {
        code: "OUT_FOR_DELIVERY",
        label: "Out for Delivery",
        kind: "in_progress",
        terminal: false,
      },
      fulfillment: "delivery",
      store: { id: "s1", name: "Burgonomics CG Road" },
    } as unknown as Order;

    const withCoordsOrder = {
      id: "ord_402",
      status: {
        code: "OUT_FOR_DELIVERY",
        label: "Out for Delivery",
        kind: "in_progress",
        terminal: false,
      },
      fulfillment: "delivery",
      store: { id: "s1", name: "Burgonomics CG Road", lat: 23.0131, lng: 72.5085 },
      address: { label: "Home", line1: "5 River Side", lat: 23.0338, lng: 72.5262 },
    } as unknown as Order;

    it("renders no map and no Google Maps link when coordinates are null", () => {
      const state = getTrackingStateFromOrder(noCoordsOrder);
      expect(state.storeLocation).toBeNull();
      expect(state.dropLocation).toBeNull();

      const html = renderToStaticMarkup(<LiveOrderMap tracking={state} />);
      expect(html).toBe("");
      expect(html).not.toContain("google.com/maps");
      expect(html).not.toContain("Open in Google Maps");
    });

    it("renders no rider pin or GPS chip when riderLocation is null", () => {
      const state = getTrackingStateFromOrder(withCoordsOrder);
      expect(state.storeLocation).not.toBeNull();
      expect(state.dropLocation).not.toBeNull();
      expect(state.riderLocation).toBeNull();

      const html = renderToStaticMarkup(<LiveOrderMap tracking={state} />);
      // Real route still renders — honestly labeled.
      expect(html).not.toBe("");
      expect(html).toContain("Route overview");
      expect(html).not.toContain("Live Porter Courier GPS");
      expect(html).not.toContain("rider-pin");
      expect(html).not.toContain("Porter En-Route");
      expect(html).not.toContain("Porter Live Radar");
      // Directions link: kitchen branch pickup is the ORIGIN, the customer's
      // delivery address is the DESTINATION (mirrors the drawn polyline).
      expect(html).toContain("origin=23.0131,72.5085");
      expect(html).toContain("destination=23.0338,72.5262");
    });

    it("routes from the kitchen branch to the customer address", () => {
      const state = getTrackingStateFromOrder(withCoordsOrder);
      // Real delivery address coordinates become the route destination.
      expect(state.dropLocation).toEqual({ lat: 23.0338, lng: 72.5262 });

      const html = renderToStaticMarkup(<LiveOrderMap tracking={state} />);
      const originIdx = html.indexOf("origin=23.0131,72.5085");
      const destIdx = html.indexOf("destination=23.0338,72.5262");
      expect(originIdx).toBeGreaterThan(-1);
      // Origin precedes destination in the href.
      expect(destIdx).toBeGreaterThan(originIdx);
    });

    it("sends no origin for takeaway, where the drop point IS the outlet", () => {
      const order = {
        id: "ord_404",
        status: { code: "READY", label: "Ready", kind: "in_progress", terminal: false },
        fulfillment: "takeaway",
        store: { id: "s1", name: "Burgonomics CG Road", lat: 23.0131, lng: 72.5085 },
      } as unknown as Order;

      const html = renderToStaticMarkup(
        <LiveOrderMap tracking={getTrackingStateFromOrder(order)} />,
      );
      expect(html).not.toContain("origin=");
      expect(html).toContain("destination=23.0131,72.5085");
    });

    it("renders a rider pin and GPS chip only when the backend supplied rider GPS", () => {
      const state = getTrackingStateFromOrder(withCoordsOrder);
      const withGps = {
        ...state,
        riderLocation: { lat: 23.02, lng: 72.515 },
        riderName: "Vikram Rathore",
      };

      const html = renderToStaticMarkup(<LiveOrderMap tracking={withGps} />);
      expect(html).toContain("rider-pin");
      expect(html).toContain("Live Porter Courier GPS");
    });

    it("keeps the takeaway map when the outlet coordinates are real", () => {
      const order = {
        id: "ord_403",
        status: { code: "READY", label: "Ready", kind: "in_progress", terminal: false },
        fulfillment: "takeaway",
        store: { id: "s1", name: "Burgonomics CG Road", lat: 23.0131, lng: 72.5085 },
      } as unknown as Order;

      const state = getTrackingStateFromOrder(order);
      // The outlet is the pickup destination — no invented drop point.
      expect(state.dropLocation).toEqual({ lat: 23.0131, lng: 72.5085 });

      const html = renderToStaticMarkup(<LiveOrderMap tracking={state} />);
      expect(html).not.toBe("");
      expect(html).toContain("Outlet Directions Map");
      expect(html).toContain("destination=23.0131,72.5085");
      expect(html).not.toContain("rider-pin");
    });
  });

  describe("5. ETA derivation from order.estimatedAt", () => {
    it("returns null when the order carries no estimatedAt", () => {
      const order = {
        id: "ord_501",
        status: {
          code: "KITCHEN_PREPARING",
          label: "Grilling",
          kind: "in_progress",
          terminal: false,
        },
        fulfillment: "delivery",
      } as unknown as Order;

      expect(getTrackingStateFromOrder(order).etaMinutes).toBeNull();
    });

    it("derives minutes remaining from the real estimatedAt timestamp", () => {
      const order = {
        id: "ord_502",
        status: {
          code: "KITCHEN_PREPARING",
          label: "Grilling",
          kind: "in_progress",
          terminal: false,
        },
        fulfillment: "delivery",
        estimatedAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      } as unknown as Order;

      const eta = getTrackingStateFromOrder(order).etaMinutes;
      expect(eta).toBeGreaterThanOrEqual(29);
      expect(eta).toBeLessThanOrEqual(30);
    });
  });

  describe("6. Tracker honesty (P1-2)", () => {
    it("shows 'Estimate unavailable' instead of a countdown when ETA is null", () => {
      const order = {
        id: "ord_601",
        status: {
          code: "KITCHEN_PREPARING",
          label: "Grilling",
          kind: "in_progress",
          terminal: false,
        },
        fulfillment: "delivery",
      } as unknown as Order;

      const html = renderToStaticMarkup(
        <DeliveryStepTracker tracking={getTrackingStateFromOrder(order)} />,
      );
      expect(html).toContain("Estimate unavailable");
      expect(html).not.toContain("mins");
    });

    it("does not assert a courier exists at stage 3 before dispatch assigns one", () => {
      const order = {
        id: "ord_602",
        status: {
          code: "OUT_FOR_DELIVERY",
          label: "Out for Delivery",
          kind: "in_progress",
          terminal: false,
        },
        fulfillment: "delivery",
      } as unknown as Order;

      const html = renderToStaticMarkup(
        <DeliveryStepTracker tracking={getTrackingStateFromOrder(order)} />,
      );
      expect(html).toContain("courier details appear after dispatch");
      expect(html).not.toContain("With Courier");
      expect(html).not.toContain("Porter 2-wheeler courier is en-route");
    });

    it("keeps courier copy when the order actually names a rider", () => {
      const order = {
        id: "ord_603",
        status: {
          code: "OUT_FOR_DELIVERY",
          label: "Out for Delivery",
          kind: "in_progress",
          terminal: false,
        },
        fulfillment: "delivery",
        delivery: { riderName: "Vikram Rathore", riderPhone: "+91 98250 88991" },
      } as unknown as Order;

      const html = renderToStaticMarkup(
        <DeliveryStepTracker tracking={getTrackingStateFromOrder(order)} />,
      );
      expect(html).toContain("With Courier");
      expect(html).not.toContain("courier details appear after dispatch");
    });
  });
});

describe("7. 60-Second Cancellation Grace Flow", () => {
  const buildOrder = (overrides: Record<string, unknown> = {}) =>
    ({
      id: "ord_grace_1",
      shortCode: "BG-GRACE1",
      status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
      fulfillment: "delivery",
      store: { id: "s1", name: "Burgonomics CG Road", phone: "+91 98250 88991" },
      items: [{ name: "Smashed Burger", quantity: 1, unitPrice: 299 }],
      totals: { subtotal: 349, taxes: 50, deliveryFee: 0, grandTotal: 349 },
      payment: { method: "online", label: "Paid Online", status: "paid" },
      placedAt: new Date(Date.now() - 10_000).toISOString(),
      ...overrides,
    }) as unknown as Order;

  async function mount(element: React.ReactElement) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(element);
    });
    return {
      container,
      unmount: async () => {
        await act(async () => {
          root.unmount();
        });
        container.remove();
      },
    };
  }

  beforeEach(() => {
    vi.mocked(ordersService.cancelOrder).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(ordersService.cancelOrder).mockImplementation(async (id: string) => ({
      success: true,
      data: {
        ...buildOrder({ id }),
        status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the live countdown while the order is still inside the 60s window", async () => {
    const { container, unmount } = await mount(<CancellationGraceCard order={buildOrder()} />);

    // placedAt is 10s old → 50s of grace remaining.
    expect(container.textContent).toContain("Cancellation Grace Period: 50s remaining");
    expect(container.querySelector('[data-testid="cancel-order-button"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="call-store-link"]')).toBeNull();
    await unmount();
  });

  it("opens the confirm dialog, cancels via the service, and does NOT promise a refund the client cannot perform", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onOrderCancelled = vi.fn();
    const { container, unmount } = await mount(
      <CancellationGraceCard order={buildOrder()} onOrderCancelled={onOrderCancelled} />,
    );

    container.querySelector<HTMLButtonElement>('[data-testid="cancel-order-button"]')!.click();
    await act(async () => {});

    expect(confirmSpy).toHaveBeenCalledWith("Cancel this order?");
    expect(ordersService.cancelOrder).toHaveBeenCalledWith("ord_grace_1");
    // REFUND TRUTH: the client never initiates a refund (cancelOrder writes
    // only the CANCELLED status), so the refund claim is shown ONLY when the
    // order carries a server-written "refunded" payment marker.
    expect(toast.success).toHaveBeenCalledWith("Order cancelled.");
    // Route reloads with the CANCELLED order the service returned.
    expect(onOrderCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ord_grace_1",
        status: expect.objectContaining({ code: "CANCELLED" }),
      }),
    );
    await unmount();
  });

  it("claims the refund only when the order itself records a refunded payment", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // The route reads the refund marker from the CANCELLED doc the SERVICE
    // returns — server-written truth, not the locally mounted prop.
    vi.mocked(ordersService.cancelOrder).mockImplementation(async (id: string) => ({
      success: true,
      data: {
        ...buildOrder({ id }),
        payment: { method: "online", label: "Paid Online", status: "refunded" },
        status: { code: "CANCELLED", label: "Cancelled", kind: "cancelled", terminal: true },
      },
    }));
    const { container, unmount } = await mount(
      <CancellationGraceCard
        order={buildOrder({
          payment: { method: "online", label: "Paid Online", status: "refunded" },
        })}
      />,
    );

    container.querySelector<HTMLButtonElement>('[data-testid="cancel-order-button"]')!.click();
    await act(async () => {});

    expect(toast.success).toHaveBeenCalledWith("Order cancelled. Your refund has been initiated.");
    await unmount();
  });

  it("does not cancel when the customer dismisses the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container, unmount } = await mount(<CancellationGraceCard order={buildOrder()} />);

    container.querySelector<HTMLButtonElement>('[data-testid="cancel-order-button"]')!.click();
    await act(async () => {});

    expect(ordersService.cancelOrder).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    await unmount();
  });

  it("switches to 'Call Store' once the 60s window has expired", async () => {
    const { container, unmount } = await mount(
      <CancellationGraceCard
        order={buildOrder({ placedAt: new Date(Date.now() - 61_000).toISOString() })}
      />,
    );

    expect(container.querySelector('[data-testid="cancel-order-button"]')).toBeNull();
    const callStore = container.querySelector('[data-testid="call-store-link"]');
    expect(callStore?.getAttribute("href")).toBe("tel:+91 98250 88991");
    expect(callStore?.textContent).toContain("Need changes? Call Store");
    // MT-08: the WhatsApp thread is prefilled with this order's short code.
    expect(
      container.querySelector('[data-testid="whatsapp-support-link"]')?.getAttribute("href"),
    ).toBe(
      `https://wa.me/917878848480?text=${encodeURIComponent(
        "Hello Burgonomics, I need help with order #BG-GRACE1",
      )}`,
    );
    await unmount();
  });

  it("offers an in-app support ticket alongside WhatsApp once the window closes (MT-08)", async () => {
    const { container, unmount } = await mount(
      <CancellationGraceCard
        order={buildOrder({ placedAt: new Date(Date.now() - 61_000).toISOString() })}
      />,
    );

    const ticket = container.querySelector('[data-testid="raise-ticket-link"]');
    expect(ticket?.textContent).toContain("Raise Support Ticket");
    // Deep link carries the order context so the ticket can be traced at once.
    expect(ticket?.getAttribute("href")).toBe("/support?topic=order&orderId=ord_grace_1");
    // Both gateways are reachable at the same time — neither replaces the other.
    expect(container.querySelector('[data-testid="whatsapp-support-link"]')).toBeTruthy();
    await unmount();
  });

  it("falls back to the raw order id when the order carries no short code", async () => {
    const { container, unmount } = await mount(
      <CancellationGraceCard
        order={buildOrder({
          shortCode: "",
          placedAt: new Date(Date.now() - 61_000).toISOString(),
        })}
      />,
    );

    expect(
      container.querySelector('[data-testid="whatsapp-support-link"]')?.getAttribute("href"),
    ).toBe(
      `https://wa.me/917878848480?text=${encodeURIComponent(
        "Hello Burgonomics, I need help with order ord_grace_1",
      )}`,
    );
    await unmount();
  });

  it("switches to 'Call Store' as soon as the kitchen starts (PREPARING)", async () => {
    const { container, unmount } = await mount(
      <CancellationGraceCard
        order={buildOrder({
          status: { code: "PREPARING", label: "Preparing", kind: "in_progress", terminal: false },
        })}
      />,
    );

    // Still inside 60s, but the kitchen already accepted — no self-cancel.
    expect(container.querySelector('[data-testid="cancel-order-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="call-store-link"]')).toBeTruthy();
    await unmount();
  });

  it("renders no cancellation UI once the order is terminal", async () => {
    const { container, unmount } = await mount(
      <CancellationGraceCard
        order={buildOrder({
          status: { code: "DELIVERED", label: "Delivered", kind: "completed", terminal: true },
        })}
      />,
    );

    expect(container.innerHTML).toBe("");
    await unmount();
  });

  it("never dials an unsafe staff-entered store phone", async () => {
    const { container, unmount } = await mount(
      <CancellationGraceCard
        order={buildOrder({
          store: { id: "s1", name: "Burgonomics CG Road", phone: "12345" },
          placedAt: new Date(Date.now() - 61_000).toISOString(),
        })}
      />,
    );

    expect(container.querySelector('[data-testid="call-store-link"]')).toBeNull();
    expect(container.textContent).toContain("Store phone unavailable");
    await unmount();
  });
});
