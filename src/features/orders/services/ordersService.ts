/**
 * OrdersService — order transport for the orders module (hybrid).
 *
 * Every function returns the same `ApiResult<T>` envelope. Bodies are NOT
 * mock-only: createOrder/cancelOrder persist to Firestore `orders` (with the
 * partner-query mirrors userId/customerId/createdAt/branchId), listOrders/
 * getOrder live-read the same collection, and createOrder pushes the KOT via
 * the Petpooja gateway. Do NOT "finish the migration" by ripping out the
 * Firestore sync — the partner app reads these docs directly.
 *
 * Backend map (live):
 *   Firestore `orders` (write + read)     → createOrder / listOrders /
 *                                            getOrder / cancelOrder
 *   Petpooja gateway push                  → createOrder (KOT, best-effort)
 *   In-memory ticking                      → getTracking demo progression
 *   POST   /v1/orders/:id/reorder          → reorder (placeholder: rebuilds
 *                                            cart via menu, backend to follow)
 *
 * Push / WebSocket surfaces will layer on top of `getTracking` without
 * changing the repository interface (see `OrderRepository.subscribe`).
 */
import { delay, ok, type ApiResult } from "@/core/network/http";
import { generateSecureId } from "@/shared/utils/cryptoUtils";
import type {
  CreateOrderInput,
  Order,
  OrderListQuery,
  OrderListResult,
  OrderStatusCode,
  OrderStatusMeta,
  OrderTimelineStep,
  OrderTrackingSnapshot,
} from "@/features/orders/models";
import type { Fulfillment } from "@/features/stores/models/Store";
import { advanceOrder } from "@/features/orders/utils/orderStatusEngine";

// -- Status catalog ---------------------------------------------------
//
// The catalog is the ONLY place status names live. UI components read
// from `OrderStatusMeta` so unknown backend codes render as a graceful
// "Update in progress" without a code change.

const STATUS_CATALOG: Record<string, Omit<OrderStatusMeta, "code">> = {
  PLACED: { label: "Order placed", kind: "upcoming", terminal: false },
  CONFIRMED: { label: "Order confirmed", kind: "upcoming", terminal: false },
  PREPARING: { label: "Preparing your order", kind: "in_progress", terminal: false },
  READY_FOR_PICKUP: { label: "Ready for pickup", kind: "in_progress", terminal: false },
  OUT_FOR_DELIVERY: { label: "Out for delivery", kind: "in_progress", terminal: false },
  DELIVERED: { label: "Delivered", kind: "completed", terminal: true },
  PICKED_UP: { label: "Picked up", kind: "completed", terminal: true },
  READY_TO_SERVE: { label: "Ready to serve", kind: "in_progress", terminal: false },
  COMPLETED: { label: "Completed", kind: "completed", terminal: true },
  CANCELLED: { label: "Cancelled", kind: "cancelled", terminal: true },
  FAILED: { label: "Failed", kind: "failed", terminal: true },
};

export function resolveStatus(code: OrderStatusCode): OrderStatusMeta {
  const known = STATUS_CATALOG[code as string];
  if (known) return { code, ...known };
  return { code, label: "Update in progress", kind: "unknown", terminal: false };
}

// -- Timeline recipes per fulfillment ---------------------------------

const TIMELINE_RECIPES: Record<
  Fulfillment,
  Array<{ code: OrderStatusCode; title: string; description?: string }>
> = {
  delivery: [
    { code: "PLACED", title: "Order confirmed", description: "We've received your order." },
    {
      code: "PREPARING",
      title: "Preparing",
      description: "Our chefs are cooking your order fresh.",
    },
    {
      code: "READY_FOR_PICKUP",
      title: "Ready for pickup",
      description: "Waiting for the delivery partner.",
    },
    {
      code: "OUT_FOR_DELIVERY",
      title: "Out for delivery",
      description: "On the way to your address.",
    },
    { code: "DELIVERED", title: "Delivered", description: "Enjoy your meal!" },
  ],
  takeaway: [
    { code: "PLACED", title: "Order confirmed", description: "We've received your order." },
    { code: "PREPARING", title: "Preparing", description: "Cooking your order fresh." },
    {
      code: "READY_FOR_PICKUP",
      title: "Ready for pickup",
      description: "Head to the counter with your pickup code.",
    },
    { code: "PICKED_UP", title: "Picked up", description: "Thanks for choosing Burgonomics." },
  ],
  dinein: [
    { code: "PLACED", title: "Order confirmed", description: "We've received your order." },
    { code: "PREPARING", title: "Preparing", description: "Your table is being served next." },
    {
      code: "READY_TO_SERVE",
      title: "Ready to serve",
      description: "Your order is on its way to the table.",
    },
    { code: "COMPLETED", title: "Completed", description: "Thanks for dining with us." },
  ],
};

function buildTimeline(
  fulfillment: Fulfillment,
  currentCode: OrderStatusCode,
  timestamps: Partial<Record<OrderStatusCode, string>>,
): OrderTimelineStep[] {
  const recipe = TIMELINE_RECIPES[fulfillment];
  const currentIdx = recipe.findIndex((s) => s.code === currentCode);
  return recipe.map((step, idx) => {
    const isCurrent = idx === currentIdx;
    const isCompleted = currentIdx >= 0 ? idx < currentIdx : false;
    return {
      code: step.code,
      title: step.title,
      description: step.description,
      timestamp: timestamps[step.code],
      state: isCompleted ? "completed" : isCurrent ? "current" : "future",
    };
  });
}

// -- In-memory store --------------------------------------------------
//
// Mock persistence. Real backend replaces this whole layer.

/**
 * Ownership gate for single-order reads. Logged-out callers keep legacy
 * behavior (rules decide); signed-in callers never see another user's order.
 * Exported for tests — deleting or weakening this check must break the suite.
 */
export function isOrderVisibleTo(
  data: Record<string, any>,
  myUid: string | null | undefined
): boolean {
  const ownerId = data.userId ?? data.customerId;
  if (ownerId && myUid && ownerId !== myUid) return false;
  return true;
}

const orders = new Map<string, Order>();
/** Progression timestamps per order — used to synthesise the timeline. */
const progression = new Map<string, Partial<Record<OrderStatusCode, string>>>();
/** Uids whose Firestore history was already merged into `orders` this session. */
const historyFetchedFor = new Set<string>();

function nextStatusCode(
  fulfillment: Fulfillment,
  current: OrderStatusCode,
): OrderStatusCode | null {
  const recipe = TIMELINE_RECIPES[fulfillment];
  const idx = recipe.findIndex((s) => s.code === current);
  if (idx < 0 || idx >= recipe.length - 1) return null;
  return recipe[idx + 1].code;
}

/**
 * Advance the status of the mock order based on elapsed time — one step
 * every ~30s. Deterministic so re-opening the app after a while shows
 * realistic progress. Delegates pure status progression to advanceOrder.
 */
function tickOrder(order: Order): Order {
  const times = progression.get(order.id) ?? {};
  const result = advanceOrder(order, Date.now(), times as Record<string, string>, 30);
  if (!result.advanced) {
    return order;
  }
  progression.set(order.id, result.timestamps as Partial<Record<OrderStatusCode, string>>);
  orders.set(order.id, result.order as Order);
  return result.order as Order;
}

function shortCode(id: string): string {
  return `BG-${id.slice(-6).toUpperCase()}`;
}

// -- Public service ---------------------------------------------------

export const ordersService = {
  async createOrder(input: CreateOrderInput): Promise<ApiResult<Order>> {
    // Demo-only simulated failure paths — see DebugPanel > Errors.
    const { shouldSimulate, useDemoStore } = await import("@/features/demo/state/demoStore");
    if (shouldSimulate("stock_unavailable")) {
      return {
        success: false,
        error: {
          code: "STOCK_UNAVAILABLE",
          message: "One or more items are out of stock (simulated).",
          retryable: false,
        },
      };
    }
    if (shouldSimulate("order_rejected")) {
      return {
        success: false,
        error: {
          code: "ORDER_REJECTED",
          message: "Store rejected the order (simulated).",
          retryable: false,
        },
      };
    }
    const petpoojaDown = shouldSimulate("petpooja_down");
    const canFallback = useDemoStore.getState().petpoojaSimulateSuccess;
    if (petpoojaDown && !canFallback) {
      return {
        success: false,
        error: {
          code: "PETPOOJA_UNAVAILABLE",
          message: "PETPOOJA is currently unavailable (simulated).",
          retryable: true,
        },
      };
    }
    const id = input.confirmedOrderId ?? `ord_${Date.now()}_${generateSecureId(6)}`;
    const nowIso = new Date().toISOString();
    const status = resolveStatus("PLACED");
    const etaMs = input.fulfillment === "delivery" ? 35 * 60_000 : 20 * 60_000;
    const order: Order = {
      id,
      shortCode: shortCode(id),
      status,
      fulfillment: input.fulfillment,
      store: input.store,
      address: input.address,
      items: input.items,
      totals: input.totals,
      promo: input.promo ?? null,
      notes: input.notes,
      fulfillmentInstructions: input.fulfillmentInstructions,
      tableNumber: input.tableNumber,
      payment: input.payment,
      petpoojaStatus: "Pending",
      placedAt: nowIso,
      estimatedAt: new Date(Date.now() + etaMs).toISOString(),
    };

    try {
      const { petpoojaGateway } = await import("@/core/integrations/petpooja");
      const pushResult = await petpoojaGateway.pushOrder(id, order);

      // Record PETPOOJA acknowledgement KOT id.
      const demoStore = useDemoStore.getState();
      demoStore.recordPetpoojaOrder(pushResult.kotNumber || `KOT-${id.slice(-6).toUpperCase()}`);
    } catch (err) {
      // Petpooja POS push issue shouldn't block customer order placement.
      console.warn("ordersService: Petpooja push failed silently:", err);
    }

    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "orders", id), {
          ...order,
          userId: user.uid,
          petpoojaStatus: "Pending",
          // Query-compatible mirrors for the Partner app (additive only —
          // customer readers ignore unknown fields):
          // - Partner useCustomer queries where('customerId','==',…)
          // - Partner lists/analytics order/filter by 'createdAt'
          customerId: user.uid,
          createdAt: nowIso,
          updatedAt: nowIso,
          // Partner branch scoping + server KOT restID resolution read this.
          // Set by ops as stores/{id}.partnerBranchId when outlets are linked.
          branchId: input.store.partnerBranchId ?? null,
        });
      }
    } catch (err) {
      console.warn("ordersService: Firestore sync failed:", err);
    }

    orders.set(id, order);
    progression.set(id, { PLACED: nowIso });
    return ok(order);
  },

  async listOrders(query: OrderListQuery = {}): Promise<ApiResult<OrderListResult>> {
    let all: Order[] = [];

    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { collection, getDocs, query: fsQuery, where } = await import("firebase/firestore");
      const user = auth.currentUser;

      // Session cache: the old code re-downloaded the user's ENTIRE order
      // history on every bucket/sort/search change (each tap = N reads).
      // The in-memory map below is the cache — one fetch per uid per session;
      // createOrder/cancelOrder mutate the same map, so it stays coherent.
      // (Cross-device orders appear on next reload — documented tradeoff.)
      if (user && !historyFetchedFor.has(user.uid)) {
        const ordersRef = collection(db, "orders");
        const q = fsQuery(ordersRef, where("userId", "==", user.uid));
        const snapshot = await Promise.race([
          getDocs(q),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Firestore timeout")), 1500),
          ),
        ]);

        const fsOrders: Order[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as any;
          // Ensure we don't accidentally leak userId in the frontend Order model
          const { userId, ...orderData } = data;
          fsOrders.push(orderData as Order);
        });

        // Merge with memory map for the demo (to allow tickOrder progress)
        for (const order of fsOrders) {
          if (!orders.has(order.id)) {
            orders.set(order.id, order);
            progression.set(order.id, { PLACED: order.placedAt });
          }
        }
        historyFetchedFor.add(user.uid);
      }
    } catch (err) {
      console.warn("ordersService: Firestore read failed, falling back to memory:", err);
    }

    // Advance every order's status before returning.
    all = Array.from(orders.values()).map(tickOrder);

    let filtered = all;
    if (query.bucket) {
      filtered = filtered.filter((o) => {
        if (query.bucket === "ongoing")
          return o.status.kind === "upcoming" || o.status.kind === "in_progress";
        if (query.bucket === "cancelled")
          return o.status.kind === "cancelled" || o.status.kind === "failed";
        return o.status.kind === "completed";
      });
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.shortCode.toLowerCase().includes(q) ||
          o.store.name.toLowerCase().includes(q) ||
          o.items.some((it) => it.name.toLowerCase().includes(q)),
      );
    }

    const sort = query.sort ?? "recent";
    filtered.sort((a, b) => {
      if (sort === "recent") return +new Date(b.placedAt) - +new Date(a.placedAt);
      if (sort === "oldest") return +new Date(a.placedAt) - +new Date(b.placedAt);
      if (sort === "amount_high") return b.totals.grandTotal - a.totals.grandTotal;
      return a.totals.grandTotal - b.totals.grandTotal;
    });

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return ok({
      items,
      page,
      pageSize,
      total: filtered.length,
      hasMore: start + items.length < filtered.length,
    });
  },

  async getOrder(id: string): Promise<ApiResult<Order | null>> {
    // If not in memory, try fetching from Firestore
    if (!orders.has(id)) {
      try {
        const { auth, db } = await import("@/core/config/firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const snap = await getDoc(doc(db, "orders", id));
        if (snap.exists()) {
          const data = snap.data() as Record<string, any>;
          // Ownership check: never load or cache another user's order fetched
          // by raw id (order ids are guessable). Mismatch reads as not-found.
          const myUid = auth.currentUser?.uid;
          if (!isOrderVisibleTo(data, myUid)) return ok(null);
          const { userId, ...orderData } = data;
          orders.set(id, orderData as Order);
          progression.set(id, { PLACED: orderData.placedAt });
        }
      } catch (err) {
        // ignore
      }
    }
    const existing = orders.get(id);
    if (!existing) return ok(null);
    return ok(tickOrder(existing));
  },

  async getTracking(id: string): Promise<ApiResult<OrderTrackingSnapshot | null>> {
    if (!orders.has(id)) {
      await this.getOrder(id); // load to memory if exists in FS
    }
    const existing = orders.get(id);
    if (!existing) return ok(null);
    const order = tickOrder(existing);
    const times = progression.get(id) ?? {};
    const steps = buildTimeline(order.fulfillment, order.status.code, times);
    const etaMinutes = order.estimatedAt
      ? Math.max(0, Math.round((+new Date(order.estimatedAt) - Date.now()) / 60_000))
      : undefined;
    return ok({
      orderId: id,
      status: order.status,
      steps,
      etaMinutes: order.status.terminal ? 0 : etaMinutes,
      deliveryPartner: order.deliveryPartner,
      tableNumber: order.tableNumber,
      refreshedAt: new Date().toISOString(),
    });
  },

  async cancelOrder(id: string): Promise<ApiResult<Order | null>> {
    await delay(200);
    const existing = orders.get(id);
    if (!existing) return ok(null);
    if (existing.status.terminal) return ok(existing);
    const cancelled: Order = {
      ...existing,
      status: resolveStatus("CANCELLED"),
      completedAt: new Date().toISOString(),
    };
    orders.set(id, cancelled);
    // Persist so cancellation reaches Partner/functions — memory-only
    // cancels were invisible everywhere else.
    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(
        doc(db, "orders", id),
        {
          status: cancelled.status,
          completedAt: cancelled.completedAt,
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("ordersService: cancel persist failed (kept in memory):", err);
    }
    return ok(cancelled);
  },

  /** Placeholder — real reorder will re-create a cart on the backend. */
  async reorder(id: string): Promise<ApiResult<{ items: Order["items"]; storeId: string } | null>> {
    await delay(150);
    const existing = orders.get(id);
    if (!existing) return ok(null);
    return ok({ items: existing.items, storeId: existing.store.id });
  },

  // -- Utilities --------------------------------------------------------
  _debug: {
    resolveStatus,
    nextStatusCode,
    catalog: STATUS_CATALOG,
  },
};
