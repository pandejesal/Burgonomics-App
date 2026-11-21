/**
 * F8 — a server-created cash order must show the real money in every Customer
 * surface. The HTTP and Firestore boundaries are fakes; the cash transport,
 * orders service, hydration and the rendered components are the real code.
 *
 * Two documents are exercised:
 *   - legacy: only the backend names (`foodSubtotal`, `gst`, `items[].price`)
 *     that staging stored before F8 — the three-field hydration fallback must
 *     make these readable without backfilling the database;
 *   - canonical: the complete Client-readable shape the fixed server writes.
 *
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => {
  const f: any = {
    orderId: "qa_cash_fields_order",
    uid: "qa_cash_fields_uid",
    canonical: false,
    currentUser: null as null | { uid: string; getIdToken: () => Promise<string> },
    placedAt: "",
    docs: new Map<string, Record<string, any>>(),
    httpPost: vi.fn(),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    onSnapshot: vi.fn(() => () => {}),
    cancelOrder: vi.fn(async () => ({ success: true, data: null })),
    navigate: vi.fn(),
  };
  f.currentUser = { uid: f.uid, getIdToken: async () => "test-id-token" };
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

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    collection: (_db: unknown, path: string) => ({ path, kind: "collection" }),
    doc: (_db: unknown, path: string, id: string) => ({ path: `${path}/${id}`, id }),
    query: (ref: unknown, ...constraints: unknown[]) => ({ ...(ref as object), constraints }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    getDocs: (q: unknown) => fixture.getDocs(q),
    getDoc: (ref: unknown) => fixture.getDoc(ref),
    onSnapshot: (...args: unknown[]) => fixture.onSnapshot(...args),
  };
});

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

// Keep the real OrderPriceSummary, FulfillmentPanel, InvoiceDownloadButton,
// OrderHistoryCard etc.; only replace the live tracking subscription and the
// celebratory animation, which are outside this money contract.
vi.mock("@/features/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/orders")>();
  return {
    ...actual,
    useOrderTracking: () => ({
      snapshot: null,
      status: "idle",
      error: null,
      refresh: async () => {},
    }),
    OrderSuccessCelebration: () => null,
    EstimatedDeliveryCountdown: () => null,
  };
});

vi.mock("@/features/checkout", async () => {
  const { ReviewItemsList } = await import("@/features/checkout/components/ReviewItemsList");
  return { ReviewItemsList };
});

vi.mock("@/features/orders/hooks/useReorderItems", () => ({
  useReorderItems: () => ({
    reorder: vi.fn(),
    pendingConfirmation: null,
    isReordering: false,
    outOfStockModal: { isOpen: false },
    confirmReorderRemaining: vi.fn(),
    confirmPendingReorder: vi.fn(),
    cancelPendingReorder: vi.fn(),
    dismissOutOfStockModal: vi.fn(),
  }),
}));

vi.mock("@/features/orders/components/ReorderDialogs", () => ({
  ReorderDialogs: () => null,
}));
vi.mock("@/features/payments/components/PaymentRecoveryPanel", () => ({
  PaymentRecoveryPanel: () => null,
}));
vi.mock("@/features/payments/utils/paymentRecovery", () => ({
  recoveryReasonForOrderMarker: (reason: unknown) => reason,
}));

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

import { formatINR } from "@/core/utils/format";
import { createCashOrderOnServer } from "@/features/payments/services/cashOrderService";
import { ordersService } from "@/features/orders/services/ordersService";
import { useOrdersStore } from "@/features/orders/state/ordersStore";
import { OrderHistoryCard } from "@/features/orders/components/OrderHistoryCard";
import { InvoiceDownloadButton } from "@/features/orders/components/InvoiceDownloadButton";
import { Route as DetailRoute } from "@/routes/orders.$orderId.index";
import { Route as ConfirmationRoute } from "@/routes/order-confirmation.$orderId";
import { Route as TrackRoute } from "@/routes/orders.$orderId.track";

const DetailPage = (DetailRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;
const ConfirmationPage = (
  ConfirmationRoute as unknown as { options: { component: React.ComponentType } }
).options.component;
const TrackPage = (TrackRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(Page: React.ComponentType) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Page />));
  // The route loads order + tracking through promises and a store upsert;
  // flush several microtask turns rather than assuming one render is enough.
  for (let i = 0; i < 8; i += 1) await act(async () => {});
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
  fixture.canonical = false;
  fixture.placedAt = new Date(Date.now() - 1000).toISOString();
  fixture.docs.clear();
  useOrdersStore.setState({ byId: {}, ids: [], activeOrderId: null } as never);

  // The fake HTTP boundary writes the document the SERVER creates. `legacy`
  // is the pre-F8 staging shape; `canonical` is the fixed writer's shape.
  fixture.httpPost.mockImplementation(async (_url: string, body: any) => {
    const request = body as { orderId: string; orderType: string; expectedTotalPaise: number };
    const timestamp = { toDate: () => new Date(fixture.placedAt) };
    const item: Record<string, unknown> = {
      lineId: "l1",
      id: "p1",
      productId: "p1",
      storeId: "s1",
      name: "Hero Burger",
      price: 109,
      quantity: 1,
      availability: "available",
      modifiers: [],
    };
    if (fixture.canonical) item.unitPrice = 109;

    const backendTotals: Record<string, unknown> = {
      foodSubtotal: 109,
      packagingFee: 0,
      deliveryFee: 0,
      gst: 5.19,
      cgst: 2.59,
      sgst: 2.6,
      discount: 0,
      loyaltyDiscount: 0,
      grandTotal: 109,
      pricingDegraded: false,
      packagingUsedFallback: false,
      split: {
        courierFeePaise: 0,
        branchTransferPaise: 10900,
        totalAmountPaise: 10900,
      },
    };
    const totals = fixture.canonical
      ? {
          ...backendTotals,
          subtotal: 109,
          itemDiscount: 0,
          promoDiscount: 0,
          taxes: 5.19,
          gstRate: 0.05,
          packingFee: 0,
          currency: "INR",
        }
      : backendTotals;

    fixture.docs.set(`orders/${request.orderId}`, {
      customerId: fixture.uid,
      userId: fixture.uid,
      branchId: "branch_a",
      storeId: "s1",
      orderId: request.orderId,
      shortCode: `BG-${request.orderId.slice(-6).toUpperCase()}`,
      store: {
        id: "s1",
        name: "Surat Adajan",
        address: "1 Main Road",
        phone: "+919876543210",
        partnerBranchId: "branch_a",
      },
      orderType: request.orderType,
      fulfillment: request.orderType,
      fulfillmentType: request.orderType,
      status: { code: "PLACED", label: "Order placed", kind: "upcoming", terminal: false },
      paymentMethod: "cod",
      paymentStatus: "pending",
      payment: { method: "cod", label: "Pay at Store", status: "pending" },
      paymentChannel: "cash",
      cashDuePaise: request.expectedTotalPaise,
      items: [item],
      totals,
      pricing: totals,
      promo: null,
      whatsappOptIn: true,
      placedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
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
});

afterEach(async () => {
  await unmount();
});

function expectRealMoney(text: string): void {
  expect(text).not.toContain("NaN");
  expect(text).not.toContain(formatINR(0));
  expect(text).toContain(formatINR(109));
}

describe("F8 — cash money renders in real Customer components", () => {
  it.each(["legacy", "canonical"] as const)(
    "renders a %s server cash order in the list card, detail, confirmation and receipt",
    async (shape) => {
      fixture.canonical = shape === "canonical";
      expect((await createServerCashOrder()).success).toBe(true);
      const fetched = await ordersService.getOrder(fixture.orderId);
      expect(fetched.success).toBe(true);
      if (!fetched.success || !fetched.data) throw new Error("order was not hydrated");

      const order = fetched.data;
      expect(order.items[0].unitPrice).toBe(109);
      expect(order.totals.subtotal).toBe(109);
      expect(order.totals.taxes).toBe(5.19);
      expect(order.totals.packingFee).toBe(0);
      expect(
        (order.totals.subtotal ?? 0) -
          (order.totals.itemDiscount ?? 0) -
          (order.totals.promoDiscount ?? 0) +
          (order.totals.packingFee ?? 0) +
          (order.totals.deliveryFee ?? 0),
      ).toBeCloseTo(order.totals.grandTotal, 2);

      const card = document.createElement("div");
      document.body.append(card);
      const cardRoot = createRoot(card);
      await act(async () => cardRoot.render(<OrderHistoryCard order={order} />));
      expectRealMoney(card.textContent ?? "");
      expect(card.textContent).toContain("1x Hero Burger");
      await act(async () => cardRoot.unmount());
      card.remove();

      const detail = await mount(DetailPage);
      await vi.waitFor(() => {
        expect(detail.textContent ?? "").toContain(formatINR(109));
      });
      const detailText = detail.textContent ?? "";
      expectRealMoney(detailText);
      expect(detailText).toContain("Subtotal");
      expect(detailText).toContain("Incl. GST (5%)");
      expect(detailText).toContain(formatINR(5.19));
      expect(detailText).toContain("Grand total");
      await unmount();

      const confirmation = await mount(ConfirmationPage);
      const confirmationText = confirmation.textContent ?? "";
      expectRealMoney(confirmationText);
      expect(confirmationText).toContain("Price breakdown");
      expect(confirmationText).toContain(formatINR(5.19));
      await unmount();

      const written: string[] = [];
      const open = vi.spyOn(window, "open").mockReturnValue({
        document: {
          open: vi.fn(),
          write: (html: string) => written.push(html),
          close: vi.fn(),
        },
      } as unknown as Window);
      vi.spyOn(window, "print").mockImplementation(() => {});
      const invoice = document.createElement("div");
      document.body.append(invoice);
      const invoiceRoot = createRoot(invoice);
      await act(async () => invoiceRoot.render(<InvoiceDownloadButton order={order} />));
      const button = invoice.querySelector("button");
      expect(button).toBeTruthy();
      await act(async () => button!.click());
      const html = written.join("");
      expect(html).toContain("Hero Burger");
      expect(html).toContain(formatINR(109));
      expect(html).toContain(formatINR(5.19));
      expect(html).not.toContain("NaN");
      expect(html).not.toContain(`${formatINR(0)}</span>`);
      await act(async () => invoiceRoot.unmount());
      invoice.remove();
      open.mockRestore();
      vi.restoreAllMocks();

      const track = await mount(TrackPage);
      const receiptButton = Array.from(track.querySelectorAll("button")).find((button) =>
        (button.textContent ?? "").includes("View Order Receipt"),
      );
      expect(receiptButton).toBeTruthy();
      await act(async () => receiptButton!.click());
      const trackText = track.textContent ?? "";
      expect(trackText).not.toContain("NaN");
      expect(trackText).toContain(formatINR(109));
      expect(trackText).toContain(formatINR(5.19));
      await unmount();
    },
  );
});
