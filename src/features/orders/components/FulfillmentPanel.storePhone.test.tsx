/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { byId } = vi.hoisted(() => ({ byId: vi.fn() }));
vi.mock("@/features/stores/services/storesService", () => ({ storesService: { byId } }));

const { FulfillmentPanel } = await import("./FulfillmentPanel");
const { OrderCancellationGrace } =
  await import("@/features/tracking/components/OrderCancellationGrace");
import type { Order } from "@/features/orders/models";

/**
 * "Call Store" must not be dead on an order whose checkout snapshot lost the
 * outlet phone. The snapshot is written at placement and legacy/imported orders
 * can carry `"phone": ""`; the public outlet directory still knows the number.
 * The same fallback the tracker already uses (storesService.byId) must cover the
 * other screens that offer the button, and it must never invent a number.
 */

const order = (phone: string) =>
  ({
    id: "ord_store_phone",
    shortCode: "BG-PHONE1",
    status: { code: "PREPARING", label: "Preparing", kind: "in_progress", terminal: false },
    fulfillment: "delivery",
    store: {
      id: "store_satellite",
      name: "Burgonomics Satellite",
      address: "Satellite, Ahmedabad",
      phone,
    },
    items: [{ name: "Hero Burger", quantity: 1, unitPrice: 249 }],
    totals: { subtotal: 249, taxes: 12, deliveryFee: 0, grandTotal: 261 },
    payment: { method: "online", label: "Paid Online", status: "paid" },
    placedAt: new Date(Date.now() - 120_000).toISOString(),
  }) as unknown as Order;

async function mount(element: React.ReactElement) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root };
}

beforeEach(() => {
  byId.mockReset();
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("order details 'Call store' survives a blank snapshot phone", () => {
  it("dials the directory number the snapshot is missing", async () => {
    byId.mockResolvedValue({ success: true, data: { phone: "+919812345678" } });
    const { host, root } = await mount(<FulfillmentPanel order={order("")} />);

    expect(byId).toHaveBeenCalledWith("store_satellite");
    const call = [...host.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Call store"),
    );
    expect(call, "Call store renders when the directory knows the number").toBeTruthy();
    await act(async () => root.unmount());
  });

  it("renders no Call store button when neither source has a number", async () => {
    byId.mockResolvedValue({ success: true, data: { phone: "" } });
    const { host, root } = await mount(<FulfillmentPanel order={order("")} />);

    expect(
      [...host.querySelectorAll("button")].some((b) =>
        (b.textContent ?? "").includes("Call store"),
      ),
      "no button without a real number",
    ).toBe(false);
    await act(async () => root.unmount());
  });
});

describe("cancellation card 'Call Store' survives a blank snapshot phone", () => {
  it("links the directory number once the grace window has closed", async () => {
    byId.mockResolvedValue({ success: true, data: { phone: "+919812345678" } });
    const { host, root } = await mount(<OrderCancellationGrace order={order("")} />);

    const link = host.querySelector('a[href^="tel:"]');
    expect(link?.getAttribute("href")).toBe("tel:+919812345678");
    await act(async () => root.unmount());
  });
});
