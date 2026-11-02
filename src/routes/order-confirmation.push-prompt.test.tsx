/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * One-time push opt-in on the order-confirmation screen (Samsung S24 finding).
 *
 * Contract pinned here:
 *  - shown after a CONFIRMED order on native while the OS is undecided;
 *  - hidden when permission is granted, when it is denied (Settings is the
 *    route then), after "Not now", and on web;
 *  - "Turn on" calls the permission request ONCE;
 *  - "Not now" persists, so a later order does not ask again;
 *  - the confirmation itself never waits on any of it.
 */
const fixture = vi.hoisted(() => {
  const order = {
    id: "ord_push_1",
    shortCode: "SUR-PUSH-1",
    whatsappOptIn: true,
    fulfillment: "delivery" as const,
    estimatedAt: null,
    status: "preparing",
    petpoojaStatus: null,
    store: { name: "Vesu Outlet", address: "1 Main Road, Vesu" },
    payment: { label: "UPI", status: "paid" },
    items: [{ lineId: "l1", name: "Burger", quantity: 1, unitPrice: 199 }],
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
  };
  return {
    order,
    platform: { value: "android" as string },
    permission: { value: "default" as string },
    requestPermission: vi.fn(async () => true),
    getOrder: vi.fn(async () => ({ success: true, data: order })),
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (opts: Record<string, unknown>) => ({
    ...opts,
    options: opts,
    _$path: path,
    useParams: () => ({ orderId: fixture.order.id }),
  }),
  useNavigate: () => vi.fn(),
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
  HapticService: { notification: vi.fn(), selection: vi.fn(), impact: vi.fn(async () => {}) },
}));
vi.mock("@/core/config/firebase", () => ({ db: null }));
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
  orderPaymentState: () => "paid",
  OrderStatusBadge: () => null,
  OrderPriceSummary: () => null,
  OrderSuccessCelebration: () => null,
  EstimatedDeliveryCountdown: () => null,
}));
vi.mock("@/features/checkout", () => ({ ReviewItemsList: () => null }));
vi.mock("@/features/auth/state/authStore", () => {
  const authState = { user: { id: "cust_push", name: "Test Customer" } };
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

// Platform + permission are the two real inputs under test.
vi.mock("@/shared/platform/platform", () => ({
  getPlatform: () => fixture.platform.value,
  isNative: () => fixture.platform.value !== "web",
  isIOS: () => fixture.platform.value === "ios",
  isAndroid: () => fixture.platform.value === "android",
  isWeb: () => fixture.platform.value === "web",
}));
vi.mock("@/shared/platform/pushNotifications", () => ({
  getPushStatusSnapshot: () => ({
    enabled: true,
    permission: fixture.permission.value,
    listenerAttached: true,
  }),
  requestPushPermissions: fixture.requestPermission,
  requestPushPermissionsWithListeners: fixture.requestPermission,
}));

import { Route as ConfirmationRoute } from "./order-confirmation.$orderId";
import { PUSH_PROMPT_DECISION_KEY } from "@/features/notifications/pushPrompt";

const OrderConfirmationPage = (
  ConfirmationRoute as unknown as { options: { component: React.ComponentType } }
).options.component;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => root.render(<OrderConfirmationPage />));
  await act(async () => {});
}

function cardButton(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  localStorage.clear();
  fixture.platform.value = "android";
  fixture.permission.value = "default";
  fixture.requestPermission.mockClear();
  fixture.requestPermission.mockResolvedValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("order-confirmation push opt-in", () => {
  it("offers the card after a confirmed order on native while the OS is undecided", async () => {
    await mount();

    expect(container.textContent).toContain("Get live order updates");
    expect(cardButton("Turn on")).toBeTypeOf("object");
    expect(cardButton("Not now")).toBeTypeOf("object");
    // A card, not a surprise prompt: mounting must not have asked the OS.
    expect(fixture.requestPermission).not.toHaveBeenCalled();
  });

  it.each(["granted", "denied"])("is hidden when permission is %s", async (permission) => {
    fixture.permission.value = permission;
    await mount();
    expect(container.textContent).not.toContain("Get live order updates");
  });

  it("is not shown on web", async () => {
    fixture.platform.value = "web";
    await mount();
    expect(container.textContent).not.toContain("Get live order updates");
  });

  it("is not shown once an answer is already recorded", async () => {
    localStorage.setItem(PUSH_PROMPT_DECISION_KEY, "dismissed");
    await mount();
    expect(container.textContent).not.toContain("Get live order updates");
  });

  it("Turn on asks the OS once and records the grant", async () => {
    await mount();

    const turnOn = cardButton("Turn on");
    expect(turnOn).toBeTypeOf("object");
    await act(async () => turnOn!.click());
    await act(async () => {});

    expect(fixture.requestPermission).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PUSH_PROMPT_DECISION_KEY)).toBe("granted");
    expect(container.textContent).not.toContain("Get live order updates");
  });

  it("Not now persists the choice and never asks the OS", async () => {
    await mount();

    const notNow = cardButton("Not now");
    await act(async () => notNow!.click());
    await act(async () => {});

    expect(fixture.requestPermission).not.toHaveBeenCalled();
    expect(localStorage.getItem(PUSH_PROMPT_DECISION_KEY)).toBe("dismissed");
    expect(container.textContent).not.toContain("Get live order updates");
  });

  it("keeps the confirmation usable when the permission request fails", async () => {
    fixture.requestPermission.mockRejectedValue(new Error("plugin missing"));
    await mount();

    const turnOn = cardButton("Turn on");
    await act(async () => turnOn!.click());
    await act(async () => {});

    // Silent to the customer, recorded as "not granted", receipt still intact.
    expect(container.textContent).toContain("Track your order live");
    expect(container.textContent).not.toContain("Get live order updates");
    expect(localStorage.getItem(PUSH_PROMPT_DECISION_KEY)).toBe("dismissed");
  });

  it("a later order does not ask again after Not now", async () => {
    await mount();
    await act(async () => cardButton("Not now")!.click());
    await act(async () => {});
    await act(async () => root.unmount());

    // Fresh mount = a later confirmed order on the same install.
    root = createRoot(container);
    await mount();

    expect(container.textContent).not.toContain("Get live order updates");
    expect(fixture.requestPermission).not.toHaveBeenCalled();
  });

  it("gives both card buttons a 44px minimum target", async () => {
    await mount();

    for (const label of ["Turn on", "Not now"]) {
      const button = cardButton(label)!;
      expect(button.className).toContain("min-h-11");
    }
  });
});
