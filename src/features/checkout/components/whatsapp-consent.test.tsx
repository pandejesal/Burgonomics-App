/** @vitest-environment jsdom */
/**
 * Owner decision 2026-11-25 #3 / A6-c11 (WhatsApp consent).
 *
 * The creator routes used to default `whatsappOptIn` to TRUE
 * (`input.whatsappOptIn !== false`), so a customer who was never asked could be
 * recorded as consenting. The server now counts only a literal true and stamps
 * `whatsappOptInAt` itself (origin/fix/orders-notify-c11 98c3256). The customer
 * app must therefore:
 *   - start UNTICKED on every checkout (no pre-ticked, no inherited consent);
 *   - send an EXPLICIT boolean on both order-creation payloads, true only when
 *     the box was ticked in THIS checkout, and never a client-side timestamp;
 *   - drop the consent again on the next order.
 *
 * Assertions are on the real POST bodies and on the real store, not on copy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/core/network/http";

const cash = vi.hoisted(() => ({ createCashOrderOnServer: vi.fn() }));
const draft = vi.hoisted(() => ({ createOnlineDraftOnServer: vi.fn() }));
const service = vi.hoisted(() => ({ getOrder: vi.fn() }));
const cartRepo = vi.hoisted(() => ({ calculateTotals: vi.fn() }));

vi.mock("@/features/payments/services/cashOrderService", () => ({
  ...cash,
  CREATE_CASH_ORDER_PATH: "/orders/createCashOrder",
  createCashOrderUrl: () => "http://x/orders/createCashOrder",
}));
vi.mock("@/features/payments/services/onlineDraftService", () => ({
  createOnlineDraftOnServer: draft.createOnlineDraftOnServer,
  retireOnlineDraftOnServer: vi.fn(async () => ok(null)),
}));
vi.mock("@/features/orders/services/ordersService", () => ({ ordersService: service }));
vi.mock("@/features/cart/repositories/CartRepository", () => ({
  cartRepository: cartRepo,
  CartRepository: class {},
}));

import { WhatsappOptInCheckbox } from "@/features/checkout/components/WhatsappOptInCheckbox";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { OrderRepository } from "@/features/orders/repositories/OrderRepository";
import { useCartStore } from "@/features/cart/state/cartStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import type { CartTotals } from "@/features/cart/models";
import { renderToStaticMarkup } from "react-dom/server";

const totals: CartTotals = {
  subtotal: 100,
  itemDiscount: 0,
  promoDiscount: 0,
  taxes: 4.76,
  cgst: 2.38,
  sgst: 2.38,
  gstRate: 0.05,
  deliveryFee: 0,
  packingFee: 15,
  grandTotal: 119,
  currency: "INR",
};

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: async (_key: string, claim: () => unknown) => claim() },
  });
  cash.createCashOrderOnServer.mockReset();
  draft.createOnlineDraftOnServer.mockReset();
  service.getOrder.mockReset();
  cartRepo.calculateTotals.mockReset();
  cartRepo.calculateTotals.mockResolvedValue(ok(totals));
  cash.createCashOrderOnServer.mockImplementation(async (request: { orderId: string }) =>
    ok({
      orderId: request.orderId,
      replayed: false,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise: 11900,
      totals: {},
      status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
    }),
  );
  draft.createOnlineDraftOnServer.mockImplementation(async (request: { orderId: string }) =>
    ok({ orderId: request.orderId, amountPaise: 11900, replayed: false }),
  );
  service.getOrder.mockResolvedValue(ok({ id: "ord_wa" }));
  useCartStore.setState({
    lines: [
      {
        lineId: "l1",
        productId: "p1",
        storeId: "s1",
        name: "Burger",
        unitPrice: 100,
        quantity: 1,
        modifiers: [],
        availability: "available",
      },
    ],
    storeId: "s1",
    status: "ready",
  });
  useStoreSelection.setState({
    activeStore: { id: "s1", name: "S" } as never,
    fulfillment: "takeaway",
  });
  useCheckoutStore.getState().reset();
  configureAuthUidSource({ getUid: () => "cust_wa", subscribe: () => () => {} });
});

describe("WhatsApp consent is opt-in (owner decision 2026-11-25 #3)", () => {
  it("renders UNTICKED by default", () => {
    const html = renderToStaticMarkup(
      <WhatsappOptInCheckbox checked={false} onChange={() => {}} />,
    );
    expect(html).toContain("Send me order updates on WhatsApp");
    // No `checked` attribute at all — a pre-ticked box would opt people in.
    expect(html).not.toMatch(/<input[^>]*\schecked/);
    expect(useCheckoutStore.getState().whatsappOptIn).toBe(false);
  });

  it("records a consent timestamp when ticked and clears it when unticked", () => {
    const store = useCheckoutStore.getState();
    store.setWhatsappOptIn(true);
    expect(useCheckoutStore.getState().whatsappOptIn).toBe(true);
    expect(typeof useCheckoutStore.getState().whatsappOptInAt).toBe("string");

    useCheckoutStore.getState().setWhatsappOptIn(false);
    expect(useCheckoutStore.getState().whatsappOptIn).toBe(false);
    expect(useCheckoutStore.getState().whatsappOptInAt).toBeNull();
  });

  it("sends an explicit false when the box was not ticked (cash)", async () => {
    await new OrderRepository(service as never).createCashOrder();

    const posted = cash.createCashOrderOnServer.mock.calls[0][0] as Record<string, unknown>;
    // Explicit, NOT omitted: the server counts only a literal true, and an
    // absent key must never be read as consent.
    expect(posted.whatsappOptIn).toBe(false);
    expect(posted).not.toHaveProperty("whatsappOptInAt");
  });

  it("sends true only when the customer ticked the box (cash)", async () => {
    useCheckoutStore.getState().setWhatsappOptIn(true);

    await new OrderRepository(service as never).createCashOrder();

    const posted = cash.createCashOrderOnServer.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.whatsappOptIn).toBe(true);
  });

  it("sends an explicit false when the box was not ticked (online draft)", async () => {
    await new OrderRepository(service as never).createOnlineDraft();

    const posted = draft.createOnlineDraftOnServer.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.whatsappOptIn).toBe(false);
  });

  it("sends true only when ticked (online draft)", async () => {
    useCheckoutStore.getState().setWhatsappOptIn(true);

    await new OrderRepository(service as never).createOnlineDraft();

    const posted = draft.createOnlineDraftOnServer.mock.calls[0][0] as Record<string, unknown>;
    expect(posted.whatsappOptIn).toBe(true);
  });

  it("does not carry consent into the next order", () => {
    useCheckoutStore.getState().setWhatsappOptIn(true);
    useCheckoutStore.getState().reset();

    const state = useCheckoutStore.getState();
    expect(state.whatsappOptIn).toBe(false);
    expect(state.whatsappOptInAt).toBeNull();
  });

  it("never persists consent, so a reload starts unticked", () => {
    useCheckoutStore.getState().setWhatsappOptIn(true);
    useCheckoutStore.getState().reset();
    const persisted = window.localStorage.getItem("burg.checkout") ?? "";
    expect(persisted).not.toContain("whatsappOptIn");
  });
});
