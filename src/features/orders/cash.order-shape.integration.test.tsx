/**
 * F7 — a server-created cash order must be usable from the Customer app.
 *
 * The document here has the shape staging actually stores for API-created COD
 * orders: no body `id`, no display `store`, and `placedAt` persisted as a
 * Firestore server timestamp (read back as a Timestamp object). The HTTP and
 * Firestore boundaries are fakes; the cash transport, orders service and both
 * route components are the real implementations.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  let seq = 0;
  const f: any = {
    orderId: "qa_cash_legacy_order",
    uid: "qa_cash_uid_0",
    currentUser: null as null | { uid: string; getIdToken: () => Promise<string> },
    placedAt: "",
    docs: new Map<string, Record<string, any>>(),
    httpPost: vi.fn(),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    cancelOrder: vi.fn(async () => ({ success: true, data: null })),
    navigate: vi.fn(),
    nextUid: () => {
      seq += 1;
      f.uid = `qa_cash_uid_${seq}`;
      f.currentUser = { uid: f.uid, getIdToken: async () => "test-id-token" };
      return f.uid;
    },
  };
  return f;
});

vi.mock("@/core/config/firebase", () => ({
  auth: {
    get currentUser() {
      return fixture.currentUser;
    },
    authStateReady: async () => {},
  },
  db: { kind: "fake-db" },
  getAppCheckToken: async () => "test-app-check-token",
}));

// The real auth store pulls in the profile/notification stores and has a
// circular import through the cart repository. Give the one address-store
// subscriber a real zustand store without evaluating that whole graph.
vi.mock("@/features/auth/state/authStore", async () => {
  const { create } = await import("zustand");
  const useAuthStore = create<any>((set) => ({
    status: "authenticated",
    user: { id: fixture.uid, phone: "9999999999" },
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    challenge: null,
    isBootstrapped: true,
    error: null,
    bootstrap: async () => {},
    requestOtp: async () => ({ ok: true }),
    verifyOtp: async () => ({ ok: true }),
    resendOtp: async () => ({ ok: true }),
    changePhone: () => {},
    logout: async () => {},
    clearError: () => {},
    setUser: (user: unknown) => set({ user }),
  }));
  return {
    useAuthStore,
    selectIsAuthenticated: (s: { status?: string; user?: unknown }) =>
      s.status === "authenticated" && !!s.user,
    getFirebaseSessionUid: async () => fixture.uid,
  };
});

vi.mock("@/core/network/httpClient", () => ({
  httpClient: {
    post: (...args: unknown[]) => fixture.httpPost(...args),
    get: vi.fn(),
  },
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path, kind: "collection" }),
  doc: (_db: unknown, path: string, id: string) => ({ path: `${path}/${id}`, id }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ...(ref as object), constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  getDocs: (q: unknown) => fixture.getDocs(q),
  getDoc: (ref: unknown) => fixture.getDoc(ref),
  onSnapshot: (...args: unknown[]) => fixture.onSnapshot(...args),
}));

vi.mock("@/features/orders/services/ordersService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/orders/services/ordersService")>();
  return {
    ...actual,
    ordersService: {
      ...actual.ordersService,
      cancelOrder: (...args: unknown[]) => fixture.cancelOrder(...args),
    },
  };
});

vi.mock("@/features/orders", async () => {
  const repository = await import("@/features/orders/repositories/OrderRepository");
  const store = await import("@/features/orders/state/ordersStore");
  const payment = await import("@/features/orders/utils/paymentState");
  return {
    orderRepository: repository.orderRepository,
    useOrdersStore: store.useOrdersStore,
    selectOrderById: store.selectOrderById,
    orderPaymentState: payment.orderPaymentState,
    useOrderTracking: () => ({
      snapshot: null,
      status: "idle",
      error: null,
      refresh: async () => {},
    }),
    OrderStatusBadge: () => null,
    OrderPriceSummary: () => null,
    OrderSuccessCelebration: () => null,
    EstimatedDeliveryCountdown: () => null,
  };
});

vi.mock("@/features/tracking", () => ({
  DeliveryStepTracker: () => null,
  LiveOrderMap: () => null,
  RiderContactCard: () => null,
  usePorterLiveTracking: () => ({
    storeLocation: null,
    dropLocation: null,
    isTakeawayOrDineIn: true,
    paymentState: "cash",
    status: "idle",
  }),
}));
vi.mock("@/features/tracking/components/DeliveryCodeCard", () => ({
  DeliveryCodeCard: () => null,
}));
vi.mock("@/features/orders/hooks/useStorePhone", () => ({ useStorePhone: () => undefined }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
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
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    rightSlot,
  }: {
    children?: React.ReactNode;
    rightSlot?: React.ReactNode;
  }) => (
    <main>
      {rightSlot}
      {children}
    </main>
  ),
}));
vi.mock("@/shared/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/shared/components/feedback/AppToaster", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/core/services/haptics", () => ({
  HapticService: { impact: vi.fn(), selection: vi.fn(), notification: vi.fn() },
}));
vi.mock("@/features/checkout", () => ({ ReviewItemsList: () => null }));
vi.mock("@/features/notifications/components/PushOptInCard", () => ({ PushOptInCard: () => null }));
vi.mock("@/features/notifications/pushPrompt", () => ({
  readPushPromptDecision: () => "dismissed",
  shouldOfferPushPrompt: () => false,
}));
vi.mock("@/shared/platform/pushNotifications", () => ({
  getPushStatusSnapshot: () => ({ permission: "default" }),
  requestPushPermissionsWithListeners: vi.fn(),
}));
vi.mock("@/shared/platform/platform", () => ({
  getPlatform: () => "web",
  isNative: () => false,
  isIOS: () => false,
  isAndroid: () => false,
  isWeb: () => true,
}));

import { createCashOrderOnServer } from "@/features/payments/services/cashOrderService";
import { ordersService } from "@/features/orders/services/ordersService";
import { useOrdersStore } from "@/features/orders/state/ordersStore";
import { Route as TrackRoute } from "@/routes/orders.$orderId.track";
import { Route as ConfirmationRoute } from "@/routes/order-confirmation.$orderId";

const TrackOrderPage = (TrackRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;
const OrderConfirmationPage = (
  ConfirmationRoute as unknown as { options: { component: React.ComponentType } }
).options.component;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(Page: React.ComponentType) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Page />));
  await act(async () => {});
  await act(async () => {});
  return container;
}

async function unmount() {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
}

async function createServerCashOrder() {
  return createCashOrderOnServer({
    orderId: fixture.orderId,
    storeId: "s1",
    orderType: "takeaway",
    items: [{ productId: "p1", quantity: 1 }],
    expectedTotalPaise: 10900,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.nextUid();
  fixture.placedAt = new Date(Date.now() - 1000).toISOString();
  fixture.docs.clear();
  useOrdersStore.setState({ byId: {}, orderIds: [], activeOrderId: null } as never);

  // The fake HTTP boundary writes the same legacy document shape staging has:
  // no body id, no display store, and a serverTimestamp-shaped placedAt.
  fixture.httpPost.mockImplementation(async (_url: string, body: any) => {
    const request = body as { orderId: string; orderType: string; expectedTotalPaise: number };
    fixture.docs.set(`orders/${request.orderId}`, {
      customerId: fixture.uid,
      userId: fixture.uid,
      branchId: "branch_a",
      orderId: request.orderId,
      shortCode: `BG-${request.orderId.slice(-6).toUpperCase()}`,
      orderType: request.orderType,
      fulfillment: request.orderType,
      status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
      paymentMethod: "cod",
      paymentStatus: "pending",
      payment: { method: "cod", label: "Cash on Delivery", status: "pending" },
      paymentChannel: "cash",
      cashDuePaise: request.expectedTotalPaise,
      items: [{ lineId: "l1", productId: "p1", name: "Hero Burger", unitPrice: 109, quantity: 1 }],
      totals: {
        subtotal: 109,
        taxes: 5.19,
        packingFee: 0,
        deliveryFee: 0,
        promoDiscount: 0,
        grandTotal: 109,
      },
      placedAt: { toDate: () => new Date(fixture.placedAt) },
      createdAt: { toDate: () => new Date(fixture.placedAt) },
      updatedAt: { toDate: () => new Date(fixture.placedAt) },
    });
    return {
      data: {
        orderId: request.orderId,
        replayed: false,
        cashDuePaise: request.expectedTotalPaise,
        totals: { grandTotal: 109 },
        status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
      },
    };
  });

  fixture.getDocs.mockImplementation((q: any) => {
    const owner = (q.constraints ?? []).find((c: any) => c.field === "userId");
    const docs = [...fixture.docs.entries()]
      .filter(([, data]) => !owner || data[owner.field] === owner.value)
      .map(([path, data]) => ({ id: path.split("/").pop(), data: () => ({ ...data }) }));
    return {
      size: docs.length,
      empty: docs.length === 0,
      docs,
      forEach: (cb: (d: unknown) => void) => docs.forEach(cb),
    };
  });

  fixture.getDoc.mockImplementation((ref: any) => {
    const data = fixture.docs.get(ref.path);
    return {
      exists: () => data !== undefined,
      id: ref.id,
      data: () => (data ? { ...data } : undefined),
    };
  });

  fixture.cancelOrder.mockResolvedValue({ success: true, data: null });
});

afterEach(async () => {
  await unmount();
});

describe("F7 — a server-created cash order is visible in the Customer app", () => {
  it("lists and hydrates the cash order from its legacy server document", async () => {
    const created = await createServerCashOrder();
    expect(created.success).toBe(true);

    const list = await ordersService.listOrders({ bucket: "ongoing" });
    expect(list.success).toBe(true);
    if (list.success) {
      expect(list.data.items.map((order) => order.id)).toContain(fixture.orderId);
    }

    const fetched = await ordersService.getOrder(fixture.orderId);
    expect(fetched.success).toBe(true);
    if (fetched.success) {
      expect(fetched.data).toMatchObject({
        id: fixture.orderId,
        placedAt: expect.any(String),
      });
    }
  });

  it("opens the same order in the real tracking and confirmation routes", async () => {
    expect((await createServerCashOrder()).success).toBe(true);
    const fetched = await ordersService.getOrder(fixture.orderId);
    expect(fetched.success).toBe(true);

    const track = await mount(TrackOrderPage);
    const trackText = track.textContent ?? "";
    expect(trackText).not.toContain("Order not found");
    expect(trackText).toContain("View Order Receipt");
    await unmount();

    const confirmation = await mount(OrderConfirmationPage);
    const confirmationText = confirmation.textContent ?? "";
    expect(confirmationText).toContain("Order number");
    // The legacy document has no display store. The page must render honestly
    // instead of throwing on `order.store.name`.
    expect(confirmationText).toContain("Outlet details unavailable");
  });
});
