/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  const orderId = "ord_old_receipt";
  return {
    orderId,
    order: {
      id: orderId,
      shortCode: "SUR-OLD-4242",
      whatsappOptIn: true,
      fulfillment: "delivery" as const,
      estimatedAt: null,
      status: "preparing",
      petpoojaStatus: null,
      store: { name: "Vesu Outlet", address: "1 Main Road, Vesu" },
      payment: { label: "UPI", status: "paid" },
      items: [{ lineId: "l1", name: "Old Burger", quantity: 1, unitPrice: 199 }],
      totals: {
        subtotal: 199,
        taxes: 10,
        packingFee: 10,
        deliveryFee: 0,
        promoDiscount: 0,
        loyaltyDiscount: 0,
        grandTotal: 219,
      },
      promo: null,
      tableNumber: "",
    },
    cartClear: vi.fn(async () => ({ success: true })),
    hapticNotification: vi.fn(async () => {}),
    navigate: vi.fn(),
    getOrder: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (opts: Record<string, unknown>) => ({
    ...opts,
    options: opts,
    _$path: path,
    useParams: () => ({ orderId: fixture.orderId }),
  }),
  useNavigate: () => fixture.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/shared/components/feedback/AppToaster", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/core/services/haptics", () => ({
  HapticService: {
    notification: fixture.hapticNotification,
    selection: vi.fn(),
    impact: vi.fn(async () => {}),
  },
}));
vi.mock("@/core/config/firebase", () => ({ db: null }));
vi.mock("@/features/cart", () => ({
  cartRepository: { clear: fixture.cartClear },
}));
vi.mock("@/features/orders", () => ({
  orderRepository: {
    getOrder: fixture.getOrder,
    setWhatsappOptIn: vi.fn(async () => ({ success: true })),
    buildShareMessage: vi.fn(async () => ({ success: false })),
    buildTrackUrl: vi.fn(() => ""),
  },
  useOrdersStore: (selector: (s: { orders: unknown[] }) => unknown) =>
    selector({ orders: [fixture.order] }),
  selectOrderById: (id: string) => (state: { orders: Array<{ id: string }> }) =>
    state.orders.find((order) => order.id === id) ?? null,
  orderPayableAmount: () => 219,
  OrderStatusBadge: () => null,
  OrderPriceSummary: () => null,
  OrderSuccessCelebration: () => null,
  EstimatedDeliveryCountdown: () => null,
}));
vi.mock("@/features/checkout", () => ({
  ReviewItemsList: () => null,
}));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = { user: { id: "cust_trust", name: "Test Customer" } };
  return {
    useAuthStore: Object.assign((select: (s: typeof authState) => unknown) => select(authState), {
      getState: () => authState,
    }),
  };
});
vi.mock("@/features/loyalty/state/loyaltyStore", () => ({
  useLoyaltyStore: Object.assign(
    (select: (s: { balance: number }) => unknown) => select({ balance: 0 }),
    { getState: () => ({ balance: 0, refreshFromServer: vi.fn(async () => {}) }) },
  ),
}));
vi.mock("@/features/payments", async () => {
  const actual = await vi.importActual<typeof import("@/features/payments/state/paymentStore")>(
    "@/features/payments/state/paymentStore",
  );
  return { usePaymentStore: actual.usePaymentStore };
});

import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import {
  loadPaymentReconciliation,
  persistPaymentReconciliation,
  usePaymentStore,
} from "@/features/payments/state/paymentStore";
import { Route as ConfirmationRoute } from "./order-confirmation.$orderId";

const OrderConfirmationPage = (
  ConfirmationRoute as unknown as { options: { component: React.ComponentType } }
).options.component;

const UID = "cust_trust";

let container: HTMLDivElement;
let root: Root;

function seedUnrelatedActiveOrder() {
  const checkout = useCheckoutStore.getState();
  checkout.setOrderNotes("New order notes — keep me");
  checkout.setTipAmount(35);
  checkout.setLoyaltyPointsToRedeem(60);
  checkout.setTableNumber("12");
  checkout.setDeliveryInstructions("Ring the bell");
  checkout.setPickupInstructions("I'll be at the counter");
  checkout.setDiningNotes("Window seat");

  usePaymentStore
    .getState()
    .setReconciliation(true, "PAYMENT_SYNC_PENDING", "ord_new_pending", "order_rzp_new");
  usePaymentStore.getState().setStatus("waiting");

  persistPaymentReconciliation(UID, {
    internalOrderId: "ord_new_pending",
    gatewayOrderId: "order_rzp_new",
    reason: "PAYMENT_SYNC_PENDING",
  });
}

function snapshotUnrelatedState() {
  const checkout = useCheckoutStore.getState();
  return {
    notes: checkout.orderNotes,
    tip: checkout.tipAmount,
    points: checkout.loyaltyPointsToRedeem,
    table: checkout.tableNumber,
    delivery: checkout.deliveryInstructions,
    pickup: checkout.pickupInstructions,
    dining: checkout.diningNotes,
  };
}

function expectUnrelatedState(previous: ReturnType<typeof snapshotUnrelatedState>) {
  expect(snapshotUnrelatedState()).toEqual(previous);
  const payment = usePaymentStore.getState();
  expect(payment.reconciliationPending).toBe(true);
  expect(payment.reconciliationReason).toBe("PAYMENT_SYNC_PENDING");
  expect(payment.internalOrderId).toBe("ord_new_pending");
  expect(payment.gatewayOrderId).toBe("order_rzp_new");
  const record = loadPaymentReconciliation(UID);
  expect(record).not.toBeNull();
  expect(record?.internalOrderId).toBe("ord_new_pending");
  expect(record?.gatewayOrderId).toBe("order_rzp_new");
  expect(record?.reason).toBe("PAYMENT_SYNC_PENDING");
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useCheckoutStore.getState().reset();
  usePaymentStore.getState().reset();
  fixture.getOrder.mockResolvedValue({ success: true, data: fixture.order });
  seedUnrelatedActiveOrder();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => root.render(<OrderConfirmationPage />));
}

describe("old receipt mount is inert to a newer in-progress order", () => {
  it("does not clear the cart, checkout form, or pending reconciliation", async () => {
    const before = snapshotUnrelatedState();
    expect(before.tip).toBe(35);

    await mount();
    await act(async () => {});

    expect(fixture.cartClear).not.toHaveBeenCalled();
    expectUnrelatedState(before);
    // Fresh-success handlers own the success haptic; a receipt revisit must
    // not fire it again for an order that was already confirmed.
    expect(fixture.hapticNotification).not.toHaveBeenCalled();
  });

  it("stays inert when the receipt is opened again and through StrictMode double effects", async () => {
    const before = snapshotUnrelatedState();

    await mount();
    await act(async () => {});
    await act(async () => root.unmount());

    root = createRoot(container);
    await act(async () =>
      root.render(
        <React.StrictMode>
          <OrderConfirmationPage />
        </React.StrictMode>,
      ),
    );
    await act(async () => {});

    expect(fixture.cartClear).not.toHaveBeenCalled();
    expect(fixture.hapticNotification).not.toHaveBeenCalled();
    expectUnrelatedState(before);
  });

  it("keeps the authenticated reply/session reconciliation record readable", async () => {
    await mount();
    await act(async () => {});

    const record = loadPaymentReconciliation(UID);
    expect(record).toEqual(
      expect.objectContaining({
        internalOrderId: "ord_new_pending",
        gatewayOrderId: "order_rzp_new",
        reason: "PAYMENT_SYNC_PENDING",
      }),
    );
    expect(typeof record?.createdAt).toBe("number");
  });
});
