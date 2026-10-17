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
 *   Firestore `orders` (read-only observe)→ finalizePaidOrder /
 *                                            markPaymentFailed (server-truth
 *                                            observation; never writes —
 *                                            paid/failed state is
 *                                            server-owned via verify/webhook)
 *   Petpooja gateway push                  → createOrder (KOT, best-effort)
 *   In-memory ticking                      → DEV-only status progression
 *                                            (compiled OUT of production:
 *                                            release builds never move an
 *                                            order's status on-device)
 *   POST   /v1/orders/:id/reorder          → reorder (placeholder: rebuilds
 *                                            cart via menu, backend to follow)
 *
 * Push / WebSocket surfaces will layer on top of `getTracking` without
 * changing the repository interface (see `OrderRepository.subscribe`).
 */
import { delay, fail, ok, type ApiResult } from "@/core/network/http";
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
  const normalizedKey = (code as string)?.toUpperCase();
  const known = STATUS_CATALOG[normalizedKey];
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

function normalizeCodeForFulfillment(
  fulfillment: Fulfillment,
  code: OrderStatusCode,
): OrderStatusCode {
  if (fulfillment === "dinein") {
    if (code === "READY_FOR_PICKUP") return "READY_TO_SERVE";
    if (code === "DELIVERED" || code === "PICKED_UP") return "COMPLETED";
  }
  if (fulfillment === "takeaway") {
    if (code === "READY_TO_SERVE") return "READY_FOR_PICKUP";
    if (code === "DELIVERED" || code === "COMPLETED") return "PICKED_UP";
  }
  if (fulfillment === "delivery") {
    if (code === "READY_TO_SERVE") return "READY_FOR_PICKUP";
    if (code === "PICKED_UP" || code === "COMPLETED") return "DELIVERED";
  }
  return code;
}

function buildTimeline(
  fulfillment: Fulfillment,
  currentCode: OrderStatusCode,
  timestamps: Partial<Record<OrderStatusCode, string>>,
): OrderTimelineStep[] {
  const recipe = TIMELINE_RECIPES[fulfillment];
  const normalizedCode = normalizeCodeForFulfillment(fulfillment, currentCode);
  const currentIdx = recipe.findIndex((s) => s.code === normalizedCode);
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
/**
 * Uids whose Firestore history was already merged into `orders` for the
 * active cache scope. Cleared with the rest of the cache on account change.
 */
const historyFetchedFor = new Set<string>();

/**
 * The last order whose Firestore write FAILED, keyed by checkout fingerprint.
 * A persistence failure is surfaced as `PERSIST_FAILED` (never `ok`), so the
 * customer retries the SAME checkout — the retry must re-create the SAME
 * `orders/{id}` document instead of minting a second one for one payment.
 * Cleared on the first successful persist AND on account change — the
 * retry-id must never be reused by a different customer (see syncCacheScope).
 */
let failedPersist: { fingerprint: string; id: string } | null = null;

// -- Auth-scoped session cache ---------------------------------------
//
// `orders`, `progression`, `historyFetchedFor` and `failedPersist` are a
// PER-ACCOUNT session cache. Serving them across an account change (logout
// + login, or a stale auth restore without a page reload) would leak one
// customer's orders, timeline clock and retry id into another's screens.
// Every public entry re-anchors the cache to the CURRENT auth UID through
// `syncCacheScope`; a scope change drops all cached state so the next read
// refetches server truth for the new account. Guests keep the legacy
// logged-out behavior on their own "guest" scope. Late in-flight results
// (a fetch that resolved after the account changed) compare their captured
// uid against `auth.currentUser` before touching the cache — a mismatch is
// discarded, never merged.

/** Active cache scope; null until the first entry observes auth state. */
let cacheScope: string | null = null;

function scopeKeyFor(user: { uid: string } | null | undefined): string {
  return user ? `uid:${user.uid}` : "guest";
}

/**
 * Re-anchor the module caches to the current auth UID. Clears orders,
 * progression, the history marker and any failed-persist retry id when the
 * account changed; no-op otherwise. Call once at the top of every public
 * entry, passing the `currentUser` from that entry's own firebase import.
 */
function syncCacheScope(user: { uid: string } | null | undefined): void {
  const key = scopeKeyFor(user);
  if (cacheScope === key) return;
  orders.clear();
  progression.clear();
  historyFetchedFor.clear();
  failedPersist = null;
  cacheScope = key;
}

/** Stable identity of one checkout — used to reuse the order id on retry. */
function checkoutFingerprint(input: CreateOrderInput): string {
  return JSON.stringify([
    input.store?.id ?? null,
    input.fulfillment ?? null,
    input.payment?.method ?? null,
    input.totals?.grandTotal ?? null,
    input.notes ?? null,
    (input.items ?? []).map((l) => [l.productId, l.quantity, l.unitPrice]),
  ]);
}

/**
 * Lifecycle rank for the "cannot downgrade" gate in `markPaymentFailed`.
 * PLACED is the only pre-confirmation state a failed payment may be
 * observed against; CONFIRMED and everything the kitchen/partner writes
 * after it are paid-path states the server owns. (Terminal/settled-off
 * codes are refused earlier via the status catalog.)
 */
const CONFIRMATION_RANK: Record<string, number> = {
  PLACED: 0,
  CONFIRMED: 1,
  PREPARING: 2,
  READY_FOR_PICKUP: 2,
  READY_TO_SERVE: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  PICKED_UP: 4,
  COMPLETED: 4,
};

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
 * Client-side status progression — DEV ONLY.
 *
 * Advances a status one step every ~30s so local work without a KDS bump
 * still shows movement. ZERO-MOCK policy: production builds must never
 * fabricate order status on-device. Real statuses are written by the
 * server (`functions` orderStatus bump, dispatch webhooks) and the Partner
 * KDS, and arrive through `refreshOrder` / `onSnapshot`. The guard is a
 * compile-time constant, so release bundles drop the whole branch.
 */
const CLIENT_STATUS_TICK_ENABLED: boolean = import.meta.env.DEV === true;

function tickOrder(order: Order): Order {
  if (!CLIENT_STATUS_TICK_ENABLED) return order;
  const times = progression.get(order.id) ?? {};
  const result = advanceOrder(order, Date.now(), times as Record<string, string>, 30);
  if (!result.advanced) {
    return order;
  }
  // Loop: never auto-complete by timer alone. A tick that lands on a
  // terminal state (DELIVERED/COMPLETED) with no real backend event fakes
  // handover — the customer stops expecting food that never arrived, and
  // the closed ticket removes recourse. Real completions arrive via
  // partner/server writes (KDS bump, verifyDeliveryOtp). Hold pre-terminal.
  if (result.order.status?.terminal && !order.status?.terminal) {
    return order;
  }
  progression.set(order.id, result.timestamps as Partial<Record<OrderStatusCode, string>>);
  orders.set(order.id, result.order as Order);
  return result.order as Order;
}

function shortCode(id: string): string {
  return `BG-${id.slice(-6).toUpperCase()}`;
}

/** Unwrap ISO strings and Firestore serverTimestamps; anything else → null. */
function asIso(value: unknown): string | null {
  if (typeof value === "string" && !Number.isNaN(+new Date(value))) return value;
  const ts = value as { toDate?: () => Date } | null;
  if (ts && typeof ts.toDate === "function") {
    const d = ts.toDate();
    if (!Number.isNaN(+d)) return d.toISOString();
  }
  return null;
}

/**
 * Record the timeline clock for an order hydrated from Firestore.
 *
 * Replaces the timestamps the DEV ticker used to synthesise: `PLACED` comes
 * from the document, and the current step's time from the server's own status
 * write (`updatedAt`). Missing/odd server values simply leave the step's
 * timestamp blank — the UI omits it rather than showing an invented time.
 */
function seedProgression(id: string, order: Order, server?: Record<string, unknown>): void {
  const times = { ...(progression.get(id) ?? {}) };
  const placedAt = times.PLACED ?? order.placedAt;
  if (!times.PLACED && typeof placedAt === "string") times.PLACED = placedAt;

  const code = order.status?.code;
  const changedAt = asIso(server?.statusChangedAt ?? server?.updatedAt);
  const placedMs = placedAt ? +new Date(placedAt) : 0;
  if (
    code &&
    code !== "PLACED" &&
    changedAt &&
    (!placedMs || +new Date(changedAt) >= placedMs)
  ) {
    times[code] = changedAt;
  }
  progression.set(id, times);
}

// -- Public service ---------------------------------------------------

export const ordersService = {
  async createOrder(input: CreateOrderInput): Promise<ApiResult<Order>> {
    // Fail-closed for guests: a memory-only order is invisible to Partner
    // (no Firestore doc, no KOT). Checkout/payment screens force login via
    // the auth sheet; this is the backstop for stale sessions and direct
    // calls. Guest checkout is NOT supported (product decision 2026-09-23).
    const { auth: gateAuth } = await import("@/core/config/firebase");
    if (!gateAuth.currentUser) {
      return {
        success: false,
        error: {
          code: "MISSING_AUTH",
          message: "Please sign in to place your order.",
          retryable: false,
        },
      };
    }
    // Pin the placing account (R03): the doc's ownership fields, the cache
    // writes and the failed-persist retry id all belong to THIS uid — not
    // to whichever account is current when a later await resumes.
    const uid = gateAuth.currentUser.uid;
    syncCacheScope(gateAuth.currentUser);
    const fingerprint = checkoutFingerprint(input);
    // Reuse the id of a checkout whose Firestore write already failed, so a
    // retry re-creates the SAME document instead of a duplicate order.
    const id =
      input.confirmedOrderId ??
      (failedPersist && failedPersist.fingerprint === fingerprint
        ? failedPersist.id
        : `ord_${Date.now()}_${generateSecureId(6)}`);
    const nowIso = new Date().toISOString();
    const status = resolveStatus("PLACED");
    const etaMinutes = input.fulfillment === "delivery"
      ? input.store.etaMinutes
      : input.store.pickupEtaMinutes;
    const estimatedAt = typeof etaMinutes === "number" && Number.isFinite(etaMinutes) && etaMinutes > 0
      ? new Date(Date.now() + etaMinutes * 60_000).toISOString()
      : undefined;
    const order: Order = {
      id,
      shortCode: shortCode(id),
      status,
      fulfillment: input.fulfillment,
      store: input.store,
      address: input.address,
      deliveryAddress: input.deliveryAddress ?? input.address,
      items: input.items,
      totals: input.totals,
      promo: input.promo ?? null,
      tipAmount: input.tipAmount ?? 0,
      loyaltyPointsRedeemed: input.loyaltyPointsRedeemed ?? 0,
      notes: input.notes,
      fulfillmentInstructions: input.fulfillmentInstructions,
      tableNumber: input.tableNumber,
      whatsappOptIn: input.whatsappOptIn ?? true,
      payment: input.payment,
      petpoojaStatus: "Pending",
      placedAt: nowIso,
      ...(estimatedAt ? { estimatedAt } : {}),
    };

    // Petpooja KOT push (best-effort): failures must surface on the order
    // record + logs, never fail silently in console only (FR-003, FR-014).
    let petpoojaStatus: Order["petpoojaStatus"] = "Pending";
    let petpoojaError: string | null = null;
    try {
      const { petpoojaGateway } = await import("@/core/integrations/petpooja");
      await petpoojaGateway.pushOrder(id, order);
    } catch (err) {
      petpoojaStatus = "Failed";
      petpoojaError = err instanceof Error ? err.message : String(err);
      const { logger } = await import("@/core/logging/logger");
      logger.warn("ordersService.petpooja_push_failed", {
        id,
        message: petpoojaError,
      });
    }
    order.petpoojaStatus = petpoojaStatus;

    // Firestore write: a failure here is FATAL for this attempt — the order
    // exists nowhere Partner/KDS/POS can see it, so returning ok() told the
    // customer "order placed" (and cleared their cart) for an order that was
    // never sent. It must surface as PERSIST_FAILED instead.
    let persistError: string | null = null;
    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) {
        persistError = "Your session ended before the order could be saved.";
      } else if (user.uid !== uid) {
        // The account changed between the gate and the write: minting the
        // doc under the NEW uid would attribute one customer's order (and
        // its payment context) to another. Skip the write entirely — the
        // AUTH_CHANGED failure below surfaces it (no doc was written, so
        // the retry creates no duplicate).
        persistError = "Your session changed before the order could be saved.";
      } else {
        await setDoc(doc(db, "orders", id), {
          ...order,
          deliveryAddress: input.deliveryAddress ?? input.address,
          // firestore.rules requires BOTH ownership fields to equal the
          // caller's uid — customerId alone is no longer sufficient.
          userId: uid,
          petpoojaStatus,
          ...(petpoojaError ? { petpoojaError } : {}),
          // Query-compatible mirrors for the Partner app (additive only —
          // customer readers ignore unknown fields):
          // - Partner useCustomer queries where('customerId','==',…)
          // - Partner lists/analytics order/filter by 'createdAt'
          customerId: uid,
          createdAt: nowIso,
          updatedAt: nowIso,
          // Partner branch scoping + server KOT restID resolution read this.
          // Set by ops as stores/{id}.partnerBranchId when outlets are linked.
          branchId: input.store.partnerBranchId ?? null,
          branchCoordinates:
            typeof input.store.lat === "number" && typeof input.store.lng === "number"
              ? { lat: input.store.lat, lng: input.store.lng }
              : undefined,
        });
      }
    } catch (err) {
      persistError = err instanceof Error ? err.message : String(err);
      const { logger } = await import("@/core/logging/logger");
      logger.warn("ordersService.firestore_sync_failed", {
        id,
        message: persistError,
      });
    }

    // The record stays in memory on failure: the retry must find the same
    // order (same id) and the customer keeps their context — but only while
    // the placing account is still signed in. An order that outlives its
    // session must never sit in the next account's cache (R03).
    const { auth: scopeAuth } = await import("@/core/config/firebase");
    const scopeStillOurs = (scopeAuth.currentUser?.uid ?? null) === uid;
    if (scopeStillOurs) {
      orders.set(id, order);
      progression.set(id, { PLACED: nowIso });
    }

    // Auth changed by the time the post-write yield resolved (R19
    // F-R19-3): never hand ok() to the new session — its repository would
    // upsert this order into the wrong account's UI store. Answers the same
    // way as the sibling mutations (setWhatsappOptIn / markPaymentFailed /
    // cancelOrder), whether or not the Firestore write landed under the
    // original uid.
    if (!scopeStillOurs) {
      return fail(
        "AUTH_CHANGED",
        "Your session changed before the order could be confirmed. " +
          "Please check your order history before trying again.",
        true,
      );
    }

    if (persistError) {
      failedPersist = { fingerprint, id };
      return fail(
        "PERSIST_FAILED",
        "We couldn't save your order, so the kitchen never received it. " +
          "Please try again — no duplicate order will be created.",
        true,
      );
    }
    failedPersist = null;
    return ok(order);
  },

  /**
   * R24 — paid-order finalization from SERVER TRUTH (read-only).
   *
   * After backend verify confirms that the pending `orders/{id}` doc
   * exists, the old post-payment path re-ran `createOrder` → a FULL
   * `setDoc` over the SAME id. On an existing document that is an UPDATE:
   * `firestore.rules` lets a customer change only `status/completedAt/
   * updatedAt` (cancel) or `whatsappOptIn/updatedAt`, so the write is
   * denied (PERSIST_FAILED on a captured payment) — and wherever a rule
   * would allow it, the client-built payload would clobber server-owned
   * `payment` / `paymentStatus` / `status` / `totals` with client-minted
   * values.
   *
   * This method therefore NEVER writes. It:
   *  1. pins ONE authenticated uid at entry and re-checks it after the
   *     read (R03 scope guard);
   *  2. reads `orders/{confirmedOrderId}` FRESH from the server — not the
   *     session cache (`getOrder` serves memory first) and not a silent
   *     `refreshOrder` (void, swallows failures): neither can PROVE
   *     payment;
   *  3. requires the doc's identity fields to be bound to that uid (the
   *     same customerId/userId binding `firestore.rules` enforces);
   *  4. requires a SERVER-written paid marker (`paymentStatus` /
   *     `payment.status == "completed"` — literals only the server's
   *     finishVerifiedPayment / webhook writes; the client's display enum
   *     has no "completed", and a nested "paid" is a client-written
   *     field that is FLAGGED, never trusted);
   *  5. binds `expectedTransactionId` to the server's own
   *     `payment.razorpayPaymentId` / `payment.transactionId` when the
   *     caller supplies one — a missing or mismatching server value is
   *     flagged, never papered over with the client's payment id;
   *  6. hydrates the canonical order into the per-account cache from the
   *     SERVER document only.
   *
   * Every failure is honest (MISSING_AUTH, MISSING_CONTEXT, NOT_FOUND,
   * NOT_OWNER, AUTH_CHANGED, ORDER_TERMINAL, PAYMENT_NOT_CONFIRMED,
   * TRANSACTION_MISMATCH, SERVER_DOC_SHAPE_INVALID, SERVER_READ_FAILED):
   * no branch mints an order id, writes a doc, or falls back to a
   * client-supplied paid field.
   */
  async finalizePaidOrder(input: {
    confirmedOrderId: string;
    expectedTransactionId?: string;
  }): Promise<ApiResult<Order>> {
    const id = typeof input.confirmedOrderId === "string" ? input.confirmedOrderId.trim() : "";
    if (!id) {
      return fail(
        "MISSING_CONTEXT",
        "A confirmed order id is required to finalize this payment.",
        false,
      );
    }

    const { auth, db } = await import("@/core/config/firebase");
    const startedUser = auth.currentUser;
    // Fail closed for guests: a paid proof must be bound to a signed-in
    // owner (guest checkout is not supported — product decision 2026-09-23).
    if (!startedUser) {
      return fail("MISSING_AUTH", "Please sign in to finish your order.", false);
    }
    const startedUid = startedUser.uid;
    // Drop any other account's caches BEFORE reading (R03).
    syncCacheScope(startedUser);

    // Fresh server read — the ONLY paid proof this method accepts.
    let data: Record<string, any>;
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const snap = await getDoc(doc(db, "orders", id));
      if (!snap.exists()) {
        return fail(
          "NOT_FOUND",
          "We couldn't find this order on the server. Please check your order history.",
          false,
        );
      }
      data = snap.data() as Record<string, any>;
    } catch (err) {
      // A read failure is NOT paid proof. Never fall back to the session
      // cache and never mint an order here — the caller surfaces the
      // honest "payment received, sync pending" state instead.
      const { logger } = await import("@/core/logging/logger");
      logger.warn("ordersService.finalize_server_read_failed", {
        id,
        message: err instanceof Error ? err.message : String(err),
      });
      return fail(
        "SERVER_READ_FAILED",
        "We couldn't confirm your order with the server yet. Please wait a moment and try again — do not pay again.",
        true,
      );
    }

    // Scope/async guard (R03): this read belongs to the session that asked
    // for it. A uid switch mid-flight must never hydrate the NEW
    // account's cache with this document.
    if ((auth.currentUser?.uid ?? null) !== startedUid) {
      syncCacheScope(auth.currentUser);
      return fail(
        "AUTH_CHANGED",
        "Your session changed before the payment could be confirmed. Please check your order history.",
        true,
      );
    }

    // Owner binding: every identity field the doc carries must equal the
    // caller's uid (the same binding firestore.rules applies on create).
    // No identity fields at all → shape flag; a foreign uid → NOT_OWNER.
    const ownerFields = [data.customerId, data.userId].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (ownerFields.length === 0) {
      return fail(
        "SERVER_DOC_SHAPE_INVALID",
        "The server's order record is missing its owner — payment cannot be confirmed.",
        false,
      );
    }
    if (ownerFields.some((o) => o !== startedUid)) {
      return fail(
        "NOT_OWNER",
        "This order belongs to a different account. Please check your order history.",
        false,
      );
    }

    // Status shape + terminal gate. Terminal / cancelled / refunded orders
    // are already settled — finalize honestly instead of minting a paid
    // order for them.
    const statusCodeRaw = typeof data.status === "string" ? data.status : data?.status?.code;
    const statusCode = typeof statusCodeRaw === "string" ? statusCodeRaw.trim().toUpperCase() : "";
    if (!statusCode) {
      return fail(
        "SERVER_DOC_SHAPE_INVALID",
        "The server's order record has no readable status — payment cannot be confirmed.",
        false,
      );
    }
    const statusMeta = resolveStatus(statusCode as OrderStatusCode);
    const serverTerminalFlag = data?.status?.terminal === true || data.terminal === true;
    const settledOff =
      statusCode === "CANCELLED" || statusCode === "REFUNDED" || statusCode === "FAILED";
    if (statusMeta.terminal || serverTerminalFlag || settledOff) {
      const label = statusMeta.label.toLowerCase();
      return fail(
        "ORDER_TERMINAL",
        settledOff || statusMeta.kind === "cancelled" || statusMeta.kind === "failed"
          ? `This order was ${label} on the server — it cannot be finalized as a new paid order.`
          : `This order is already ${label} — there is nothing left to finalize.`,
        false,
      );
    }

    // Payment shape coherence. Inconsistent or client-written paid fields
    // are FLAGGED (SERVER_DOC_SHAPE_INVALID) — never trusted as proof.
    const paymentBlock = data.payment;
    const topStatus = data.paymentStatus;
    const paymentShapeOk =
      (topStatus === undefined || typeof topStatus === "string") &&
      (paymentBlock === undefined ||
        (typeof paymentBlock === "object" &&
          paymentBlock !== null &&
          !Array.isArray(paymentBlock))) &&
      (paymentBlock === undefined ||
        paymentBlock.status === undefined ||
        typeof paymentBlock.status === "string");
    if (!paymentShapeOk) {
      return fail(
        "SERVER_DOC_SHAPE_INVALID",
        "The server's order record has malformed payment details — payment cannot be confirmed.",
        false,
      );
    }
    const topNorm = typeof topStatus === "string" ? topStatus.trim().toLowerCase() : undefined;
    const nestedNorm =
      typeof paymentBlock?.status === "string"
        ? paymentBlock.status.trim().toLowerCase()
        : undefined;
    if (
      topNorm !== undefined &&
      nestedNorm !== undefined &&
      (topNorm === "completed") !== (nestedNorm === "completed")
    ) {
      return fail(
        "SERVER_DOC_SHAPE_INVALID",
        "The server's payment records disagree for this order — payment cannot be confirmed from the client.",
        false,
      );
    }
    const paidMarker = topNorm === "completed" || nestedNorm === "completed";
    if (!paidMarker) {
      // A nested "paid" is a CLIENT display literal the old full-setDoc
      // path wrote — flag it rather than trust a client paid field.
      if (nestedNorm === "paid" || topNorm === "paid") {
        return fail(
          "SERVER_DOC_SHAPE_INVALID",
          "This order's paid flag was not written by the server — payment cannot be confirmed.",
          false,
        );
      }
      return fail(
        "PAYMENT_NOT_CONFIRMED",
        "The server hasn't confirmed payment for this order yet. Please wait a moment and try again — do not pay again.",
        true,
      );
    }

    // Expected transaction binding (when the caller has one): the server's
    // own payment id must match. A paid doc with no server-side payment id
    // is a shape inconsistency — flag it instead of falling back to the
    // client-supplied transaction id.
    const expectedTx =
      typeof input.expectedTransactionId === "string" ? input.expectedTransactionId.trim() : "";
    let serverTx = "";
    if (paymentBlock) {
      const raw = paymentBlock.razorpayPaymentId ?? paymentBlock.transactionId;
      if (typeof raw === "string" && raw.trim()) serverTx = raw.trim();
    }
    if (expectedTx) {
      if (!serverTx) {
        return fail(
          "SERVER_DOC_SHAPE_INVALID",
          "The server's order record has no payment id to confirm against.",
          false,
        );
      }
      if (serverTx !== expectedTx) {
        return fail(
          "TRANSACTION_MISMATCH",
          "This order was confirmed against a different payment. Please contact support — do not pay again.",
          false,
        );
      }
    }

    // C02 — amount binding (fail-closed, server values only): when the doc
    // carries BOTH a valid server-stamped pricing total (rupees) and a
    // server-recorded captured amount (paise), they must agree. A mismatch
    // means this confirmation is for a different total — never finalize it
    // as this order's paid proof. Either side absent/unreadable → skip (the
    // backend already bound amount at confirm time; legacy docs predate one
    // side and are owned by the C03/server lane, not invented here).
    const pricingTotal = (data as Record<string, any>)?.pricing?.grandTotal;
    const capturedRaw =
      (paymentBlock as Record<string, any> | undefined)?.capturedAmountPaise ??
      (data as Record<string, any>)?.["payment.capturedAmountPaise"];
    const pricingValid =
      typeof pricingTotal === "number" && Number.isFinite(pricingTotal) && pricingTotal > 0;
    const capturedValid =
      typeof capturedRaw === "number" && Number.isFinite(capturedRaw) && capturedRaw > 0;
    if (
      pricingValid &&
      capturedValid &&
      Math.round(pricingTotal * 100) !== Math.round(capturedRaw)
    ) {
      return fail(
        "SERVER_DOC_SHAPE_INVALID",
        "The server's confirmed amount does not match this order's total — payment cannot be finalized here. Please contact support — do not pay again.",
        false,
      );
    }

    // Canonical render shape — flag a structurally broken doc rather than
    // hydrating a half-order into the UI.
    const placedAt = asIso(data.placedAt);
    const shapeOk =
      typeof data.fulfillment === "string" &&
      ["delivery", "takeaway", "dinein"].includes(data.fulfillment) &&
      typeof data.store === "object" &&
      data.store !== null &&
      Array.isArray(data.items) &&
      typeof data.totals === "object" &&
      data.totals !== null &&
      !!placedAt;
    if (!shapeOk) {
      return fail(
        "SERVER_DOC_SHAPE_INVALID",
        "The server's order record is missing required fields — payment cannot be confirmed.",
        false,
      );
    }

    // Hydrate from SERVER truth only: identity from the doc REF id (never
    // a client-supplied id), payment derived from the server's own markers
    // (no client-minted paidAt/transactionId), then commit to this
    // account's cache. No awaits between the scope check above and here.
    const { userId: _ownerLeak, id: _dataId, ...serverOrder } = data;
    const canonical: Order = {
      ...(serverOrder as Omit<
        Partial<Order>,
        | "fulfillment"
        | "store"
        | "items"
        | "totals"
        | "id"
        | "shortCode"
        | "status"
        | "payment"
        | "placedAt"
        | "estimatedAt"
        | "completedAt"
      >),
      id,
      shortCode:
        typeof data.shortCode === "string" && data.shortCode ? data.shortCode : shortCode(id),
      status: statusMeta,
      fulfillment: data.fulfillment as Order["fulfillment"],
      store: data.store as Order["store"],
      items: data.items as Order["items"],
      totals: data.totals as Order["totals"],
      placedAt,
      estimatedAt: asIso(data.estimatedAt) ?? undefined,
      completedAt: asIso(data.completedAt) ?? undefined,
      payment: {
        method:
          typeof paymentBlock?.method === "string" &&
          ["online", "cash", "upi", "card", "netbanking", "wallet", "cod"].includes(
            paymentBlock.method,
          )
            ? (paymentBlock.method as Order["payment"]["method"])
            : "unknown",
        label:
          typeof paymentBlock?.label === "string" && paymentBlock.label
            ? paymentBlock.label
            : "Payment",
        // Derived: this method only returns server-proven paid docs.
        status: "paid",
        transactionId: serverTx || undefined,
        // C02 — server-owned timestamp only: `verifiedAt` is written by the
        // server's finishVerifiedPayment/webhook confirm (serverTimestamp).
        // `paidAt` is a client-writable display field on legacy docs — never
        // trusted as paid proof. No verifiedAt → no paidAt (undefined).
        paidAt: asIso(paymentBlock?.verifiedAt) ?? undefined,
      },
    };
    orders.set(id, canonical);
    // Keep the timeline clock in step with the server's own timestamps.
    seedProgression(id, canonical, data);
    return ok(canonical);
  },

  async listOrders(query: OrderListQuery = {}): Promise<ApiResult<OrderListResult>> {
    let all: Order[] = [];

    try {
      const { auth, db } = await import("@/core/config/firebase");
      const { collection, getDocs, query: fsQuery, where } = await import("firebase/firestore");
      // Re-anchor the session cache to the CURRENT account before serving
      // or merging anything (R03): an account change without a reload used
      // to keep serving the previous account's orders from this map.
      syncCacheScope(auth.currentUser);
      const user = auth.currentUser;

      // Session cache: the old code re-downloaded the user's ENTIRE order
      // history on every bucket/sort/search change (each tap = N reads).
      // The in-memory map below is the cache — one fetch per uid per scope;
      // createOrder/cancelOrder mutate the same map, so it stays coherent.
      // (Cross-device orders appear on next reload — documented tradeoff.)
      if (user && !historyFetchedFor.has(user.uid)) {
        const startedUid = user.uid;
        const ordersRef = collection(db, "orders");
        const q = fsQuery(ordersRef, where("userId", "==", startedUid));
        const snapshot = await Promise.race([
          getDocs(q),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Firestore timeout")), 1500),
          ),
        ]);

        // Late result across an auth change (R03): this snapshot was
        // requested by a session that is gone. Drop it instead of seeding
        // the new account's cache, and re-anchor so this call serves the
        // current account's (fresh) scope.
        if (auth.currentUser?.uid !== startedUid) {
          syncCacheScope(auth.currentUser);
          const { logger } = await import("@/core/logging/logger");
          logger.warn("ordersService.history_discarded_stale_auth", {
            startedUid,
          });
        } else {
          const fsOrders: Array<{ order: Order; server: Record<string, any> }> = [];
          snapshot.forEach((doc) => {
            const data = doc.data() as any;
            // Ensure we don't accidentally leak userId in the frontend Order model
            const { userId, ...orderData } = data;
            fsOrders.push({ order: orderData as Order, server: data });
          });

          // Merge with the memory map (createOrder/cancelOrder writes land here
          // too) and re-anchor the timeline clock to the server's own timestamps.
          for (const { order, server } of fsOrders) {
            if (!orders.has(order.id)) {
              orders.set(order.id, order);
            }
            seedProgression(order.id, order, server);
          }
          historyFetchedFor.add(startedUid);
        }
      }
    } catch (err) {
      const { logger } = await import("@/core/logging/logger");
      logger.warn("ordersService.history_read_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // Advance every order's status before returning.
    all = Array.from(orders.values()).map(tickOrder);

    // Quarantine malformed docs (legacy/guest records missing shape): one bad
    // doc must never wipe the entire history list with a TypeError. Dropped
    // ids go to telemetry instead of the screen.
    const valid = all.filter((o) => {
      const okShape =
        o &&
        typeof o.id === "string" &&
        o.status &&
        typeof o.status.kind === "string" &&
        typeof o.placedAt === "string";
      if (!okShape) {
        void import("@/core/logging/logger").then(({ logger }) =>
          logger.warn("ordersService.quarantined_malformed_order", {
            id: (o as { id?: unknown })?.id ?? null,
          }),
        );
      }
      return okShape;
    });

    let filtered = valid;
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
          (o.shortCode ?? "").toLowerCase().includes(q) ||
          (o.store?.name ?? "").toLowerCase().includes(q) ||
          (o.items ?? []).some((it) => (it.name ?? "").toLowerCase().includes(q)),
      );
    }

    const sort = query.sort ?? "recent";
    filtered.sort((a, b) => {
      if (sort === "recent") return +new Date(b.placedAt) - +new Date(a.placedAt);
      if (sort === "oldest") return +new Date(a.placedAt) - +new Date(b.placedAt);
      if (sort === "amount_high")
        return (b.totals?.grandTotal ?? 0) - (a.totals?.grandTotal ?? 0);
      return (a.totals?.grandTotal ?? 0) - (b.totals?.grandTotal ?? 0);
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
    const { auth } = await import("@/core/config/firebase");
    // The memory map is a per-account cache — re-anchor before reading it
    // so a cached order can never be served to a different account (R03).
    syncCacheScope(auth.currentUser);
    const startedUid = auth.currentUser?.uid ?? null;
    // If not in memory, try fetching from Firestore
    if (!orders.has(id)) {
      try {
        const { db } = await import("@/core/config/firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const snap = await getDoc(doc(db, "orders", id));
        if (snap.exists()) {
          const data = snap.data() as Record<string, any>;
          const myUid = auth.currentUser?.uid;
          // Auth changed while the fetch was in flight (R03): this raw-id
          // result belongs to the session that asked for it. Drop it —
          // re-anchor the cache and read as not-found — rather than seeding
          // the new account's map.
          if ((myUid ?? null) !== startedUid) {
            syncCacheScope(auth.currentUser);
            return ok(null);
          }
          // Ownership check: never load or cache another user's order fetched
          // by raw id (order ids are guessable). Mismatch reads as not-found.
          if (!isOrderVisibleTo(data, myUid)) return ok(null);
          const { userId, ...orderData } = data;
          orders.set(id, orderData as Order);
          seedProgression(id, orderData as Order, data);
        }
      } catch (err: unknown) {
        // Permission/offline failures used to masquerade as not-found with
        // zero telemetry — the UI showed "Order not found" for denied reads.
        const { logger } = await import("@/core/logging/logger");
        logger.warn("orders.getOrder_failed", {
          id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const existing = orders.get(id);
    if (!existing) return ok(null);
    return ok(tickOrder(existing));
  },

  /**
   * Loop: unconditional server refresh for one order (tracking polls).
   * Same ownership/telemetry rules as getOrder; failures keep memory.
   */
  async refreshOrder(id: string): Promise<void> {
    const { auth } = await import("@/core/config/firebase");
    syncCacheScope(auth.currentUser);
    const startedUid = auth.currentUser?.uid ?? null;
    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, getDoc } = await import("firebase/firestore");
      const snap = await getDoc(doc(db, "orders", id));
      if (!snap.exists()) return;
      const data = snap.data() as Record<string, any>;
      const myUid = auth.currentUser?.uid;
      // Late result across an auth change (R03): never land a previous
      // session's fetch into the current account's cache — drop and
      // re-anchor instead.
      if ((myUid ?? null) !== startedUid) {
        syncCacheScope(auth.currentUser);
        return;
      }
      if (!isOrderVisibleTo(data, myUid)) return;
      const { userId, ...orderData } = data;
      orders.set(id, orderData as Order);
      // Server truth just landed: keep the timeline clock in step with it.
      seedProgression(id, orderData as Order, data);
    } catch (err) {
      // Best-effort: keep memory, but say so — a silent refresh failure
      // leaves tracking showing pre-terminal states forever.
      const { logger } = await import("@/core/logging/logger");
      logger.warn("ordersService.refresh_failed", {
        id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async getTracking(id: string): Promise<ApiResult<OrderTrackingSnapshot | null>> {
    // Loop: refresh from the server on every poll — memory holds pre-terminal
    // estimates (timer-completion was removed), so without this a delivered
    // order would show pre-terminal forever. Best-effort: failures keep memory.
    await this.refreshOrder(id);
    if (!orders.has(id)) {
      await this.getOrder(id); // load to memory if exists in FS
    }
    const existing = orders.get(id);
    if (!existing) return ok(null);
    const order = existing;
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

  /**
   * Persist the WhatsApp order-alert opt-in on the order document
   * (P0-3). Merge-writes only the consent flag so status/payment/totals
   * are untouched. Returns fail (no toast-worthy success) when the write
   * does not land — the caller must keep the prior toggle state.
   */
  async setWhatsappOptIn(id: string, optIn: boolean): Promise<ApiResult<Order>> {
    const { auth } = await import("@/core/config/firebase");
    // Per-account cache (R03): re-anchor before the read below.
    syncCacheScope(auth.currentUser);
    const startedUid = auth.currentUser?.uid ?? null;
    let existing = orders.get(id);
    if (!existing) {
      const loaded = await this.getOrder(id);
      if (!loaded.success) return loaded;
      if (!loaded.data) return fail("NOT_FOUND", "Order not found.");
      existing = loaded.data;
    }
    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(
        doc(db, "orders", id),
        { whatsappOptIn: optIn, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (err) {
      const { logger } = await import("@/core/logging/logger");
      logger.warn("ordersService.whatsapp_optin_persist_failed", {
        id,
        message: err instanceof Error ? err.message : String(err),
      });
      return fail(
        "WRITE_FAILED",
        "We couldn't save your WhatsApp preference. Please try again.",
        true,
      );
    }
    // The write landed, but if the account changed mid-flight the result
    // must not be committed into (or toasted to) the new session (R03).
    if ((auth.currentUser?.uid ?? null) !== startedUid) {
      syncCacheScope(auth.currentUser);
      return fail(
        "AUTH_CHANGED",
        "Your session changed before we could confirm that. Please try again.",
        true,
      );
    }
    const updated: Order = { ...existing, whatsappOptIn: optIn };
    orders.set(id, updated);
    return ok(updated);
  },

  /**
   * C02 — server-truth payment-failure observation (read-only, zero writes).
   *
   * The previous body read the order from the memory/`getOrder` cache and
   * merge-wrote `{payment, updatedAt}`. `firestore.rules` lets a customer
   * update ONLY `{status,completedAt,updatedAt}` (cancel) or
   * `{whatsappOptIn,updatedAt}` — a `{payment,…}` write matches neither lane
   * and is DENIED — yet the catch arm still flipped the LOCAL cache to
   * failed. Combined with an unproven failure signal, a captured order could
   * render locally as failed and invite re-pay (double-charge path).
   *
   * This method therefore NEVER writes. It:
   *  1. pins ONE authenticated uid at entry and re-checks it after the
   *     read (R03 scope guard — same pattern as `finalizePaidOrder`);
   *  2. reads `orders/{id}` FRESH from the server — never the session cache;
   *  3. requires the doc's identity fields to be bound to that uid;
   *  4. REFUSES any downgrade of paid-path state — server `completed` /
   *     `captured` markers (top-level or nested), a recorded
   *     `capturedAmountPaise`, an `awaiting_capture` park, a CONFIRMED or
   *     later status rank, or any terminal/settled state — with a typed
   *     refusal (`ORDER_ALREADY_PAID` / `ORDER_TERMINAL`), no write and no
   *     cache mutation;
   *  5. rehydrates the per-account cache ONLY when the server itself says
   *     failed (`paymentStatus` / `payment.status == "failed"`, the exact
   *     markers the server's `payment.failed` webhook writes) and returns
   *     that observation as ok — still with zero writes;
   *  6. answers a server-pending doc with an honest typed refusal
   *     (`PAYMENT_STILL_PENDING`, retryable) — the caller's sync-pending
   *     reconciliation branch (support CTA, no cart clear, "do not pay
   *     again") is the correct sink, not a client-minted failed state.
   *
   * No branch calls `setDoc`/`updateDoc`, mints state, trusts a client
   * value, or invents an OTP/ownership channel.
   */
  async markPaymentFailed(id: string): Promise<ApiResult<Order>> {
    const cleanId = typeof id === "string" ? id.trim() : "";
    if (!cleanId) {
      return fail("MISSING_CONTEXT", "An order id is required to check its payment state.", false);
    }
    const { auth, db } = await import("@/core/config/firebase");
    const startedUser = auth.currentUser;
    // Fail closed for guests: a failure observation must be bound to a
    // signed-in owner (guest checkout is not supported — product decision
    // 2026-09-23).
    if (!startedUser) {
      return fail("MISSING_AUTH", "Please sign in to check this order's payment.", false);
    }
    const startedUid = startedUser.uid;
    // Drop any other account's caches BEFORE reading (R03).
    syncCacheScope(startedUser);

    // Fresh server read — the ONLY payment proof this method accepts.
    let data: Record<string, any>;
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const snap = await getDoc(doc(db, "orders", cleanId));
      if (!snap.exists()) {
        return fail(
          "NOT_FOUND",
          "We couldn't find this order on the server. Please check your order history.",
          false,
        );
      }
      data = snap.data() as Record<string, any>;
    } catch (err) {
      // A read failure proves nothing. Never fall back to the session
      // cache and never mint a failed state — the caller surfaces the
      // honest "payment received, sync pending" state instead.
      const { logger } = await import("@/core/logging/logger");
      logger.warn("ordersService.mark_payment_failed_read_failed", {
        id: cleanId,
        message: err instanceof Error ? err.message : String(err),
      });
      return fail(
        "SERVER_READ_FAILED",
        "We couldn't check this order with the server yet. Please wait a moment and try again — do not pay again.",
        true,
      );
    }

    // Scope/async guard (R03): this read belongs to the session that asked
    // for it. A uid switch mid-flight must never hydrate the NEW
    // account's cache with this document.
    if ((auth.currentUser?.uid ?? null) !== startedUid) {
      syncCacheScope(auth.currentUser);
      return fail(
        "AUTH_CHANGED",
        "Your session changed while checking the failed payment. Please reopen the order.",
        true,
      );
    }

    // Owner binding: every identity field the doc carries must equal the
    // caller's uid (the same binding firestore.rules applies on create).
    // No identity fields at all → shape flag; a foreign uid → NOT_OWNER.
    const ownerFields = [data.customerId, data.userId].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (ownerFields.length === 0) {
      return fail(
        "SERVER_DOC_SHAPE_INVALID",
        "The server's order record is missing its owner — payment cannot be checked from the client.",
        false,
      );
    }
    if (ownerFields.some((o) => o !== startedUid)) {
      return fail(
        "NOT_OWNER",
        "This order belongs to a different account. Please check your order history.",
        false,
      );
    }

    // Paid-path downgrade guard: money moved (or is held for capture) → the
    // client must never observe "failed". No write, no cache mutation.
    const norm = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim() ? v.trim().toLowerCase() : undefined;
    const paymentBlock =
      data.payment !== null && typeof data.payment === "object" && !Array.isArray(data.payment)
        ? (data.payment as Record<string, any>)
        : undefined;
    const topNorm = norm(data.paymentStatus);
    const nestedNorm = paymentBlock ? norm(paymentBlock.status) : undefined;
    const dottedNorm = norm(data["payment.status"]);
    const isPaidMarker = (v: string | undefined): boolean => v === "completed" || v === "captured";
    const capturedRaw = paymentBlock?.capturedAmountPaise ?? data["payment.capturedAmountPaise"];
    const capturedMoneyMoved =
      typeof capturedRaw === "number" && Number.isFinite(capturedRaw) && capturedRaw > 0;
    if (
      isPaidMarker(topNorm) ||
      isPaidMarker(nestedNorm) ||
      isPaidMarker(dottedNorm) ||
      capturedMoneyMoved
    ) {
      return fail(
        "ORDER_ALREADY_PAID",
        "The server shows this order as paid — it cannot be marked failed. Please check your order history — do not pay again.",
        false,
      );
    }
    if (
      topNorm === "awaiting_capture" ||
      nestedNorm === "awaiting_capture" ||
      dottedNorm === "awaiting_capture"
    ) {
      return fail(
        "ORDER_ALREADY_PAID",
        "The server is still holding this payment for capture — it cannot be marked failed. Please wait a moment and check your order history — do not pay again.",
        false,
      );
    }

    // Status-rank / terminal guard (CONFIRMATION_RANK): PLACED is the only
    // pre-confirmation state a failed payment may be observed against.
    // CONFIRMED and everything the kitchen/partner writes after it are
    // paid-path states the server owns — refusing replaces the old rank
    // table's unused intent with an enforced gate.
    const statusCodeRaw = typeof data.status === "string" ? data.status : data?.status?.code;
    const statusCode = typeof statusCodeRaw === "string" ? statusCodeRaw.trim().toUpperCase() : "";
    if (!statusCode) {
      return fail(
        "SERVER_DOC_SHAPE_INVALID",
        "The server's order record has no readable status — payment cannot be checked from the client.",
        false,
      );
    }
    const statusMeta = resolveStatus(statusCode as OrderStatusCode);
    const serverTerminalFlag = data?.status?.terminal === true || data.terminal === true;
    const settledOff =
      statusCode === "CANCELLED" || statusCode === "REFUNDED" || statusCode === "FAILED";
    const rank = CONFIRMATION_RANK[statusCode];
    if (
      statusMeta.terminal ||
      serverTerminalFlag ||
      settledOff ||
      (rank !== undefined && rank >= 1)
    ) {
      const label = statusMeta.label.toLowerCase();
      return fail(
        "ORDER_TERMINAL",
        settledOff || statusMeta.kind === "cancelled" || statusMeta.kind === "failed"
          ? `This order was ${label} on the server — it cannot be marked failed.`
          : `This order is already ${label} on the server — it cannot be marked failed.`,
        false,
      );
    }

    // Fresh server failed → rehydrate the per-account cache from that
    // observation ONLY (zero writes). This mirrors the exact markers the
    // server's `payment.failed` webhook writes (`paymentStatus: "failed"` +
    // dotted `"payment.status": "failed"`).
    if (topNorm === "failed" || nestedNorm === "failed" || dottedNorm === "failed") {
      const existing = orders.get(cleanId);
      if (existing) {
        // No awaits since the scope check above — this commit belongs to
        // the pinned session.
        const updated: Order = {
          ...existing,
          payment: { ...existing.payment, status: "failed", paidAt: undefined },
        };
        orders.set(cleanId, updated);
        return ok(updated);
      }
      // No session-cache entry: hydrate a canonical failed record from the
      // server document itself rather than inventing one.
      const placedAt = asIso(data.placedAt);
      const shapeOk =
        typeof data.fulfillment === "string" &&
        ["delivery", "takeaway", "dinein"].includes(data.fulfillment) &&
        typeof data.store === "object" &&
        data.store !== null &&
        Array.isArray(data.items) &&
        typeof data.totals === "object" &&
        data.totals !== null &&
        !!placedAt;
      if (!shapeOk) {
        return fail(
          "SERVER_DOC_SHAPE_INVALID",
          "The server's order record is missing required fields — its failed state cannot be shown.",
          false,
        );
      }
      const { userId: _ownerLeak, id: _dataId, ...serverOrder } = data;
      const rehydrated: Order = {
        ...(serverOrder as Omit<
          Partial<Order>,
          | "fulfillment"
          | "store"
          | "items"
          | "totals"
          | "id"
          | "shortCode"
          | "status"
          | "payment"
          | "placedAt"
          | "estimatedAt"
          | "completedAt"
        >),
        id: cleanId,
        shortCode:
          typeof data.shortCode === "string" && data.shortCode
            ? data.shortCode
            : shortCode(cleanId),
        status: statusMeta,
        fulfillment: data.fulfillment as Order["fulfillment"],
        store: data.store as Order["store"],
        items: data.items as Order["items"],
        totals: data.totals as Order["totals"],
        placedAt,
        estimatedAt: asIso(data.estimatedAt) ?? undefined,
        completedAt: asIso(data.completedAt) ?? undefined,
        payment: {
          method:
            typeof paymentBlock?.method === "string" &&
            ["online", "cash", "upi", "card", "netbanking", "wallet", "cod"].includes(
              paymentBlock.method,
            )
              ? (paymentBlock.method as Order["payment"]["method"])
              : "unknown",
          label:
            typeof paymentBlock?.label === "string" && paymentBlock.label
              ? paymentBlock.label
              : "Payment",
          status: "failed",
          transactionId:
            typeof paymentBlock?.razorpayPaymentId === "string" &&
            paymentBlock.razorpayPaymentId.trim()
              ? paymentBlock.razorpayPaymentId.trim()
              : undefined,
          paidAt: undefined,
        },
      };
      orders.set(cleanId, rehydrated);
      seedProgression(cleanId, rehydrated, data);
      return ok(rehydrated);
    }

    // Server-pending → honest typed refusal. Nothing was marked failed,
    // nothing was written, the cache is untouched: the caller's
    // sync-pending reconciliation branch (support CTA, no cart clear,
    // "do not pay again") is the correct sink.
    return fail(
      "PAYMENT_STILL_PENDING",
      "The server still shows this order as awaiting payment — nothing was marked failed. Please wait a moment and check your order history — do not pay again.",
      true,
    );
  },

  async cancelOrder(id: string): Promise<ApiResult<Order | null>> {
    await delay(200);
    const { auth } = await import("@/core/config/firebase");
    // Per-account cache (R03): re-anchor before reading the order below.
    syncCacheScope(auth.currentUser);
    const startedUid = auth.currentUser?.uid ?? null;
    const existing = orders.get(id);
    if (!existing) return ok(null);
    if (existing.status.terminal) return ok(existing);
    const cancelled: Order = {
      ...existing,
      status: resolveStatus("CANCELLED"),
      completedAt: new Date().toISOString(),
    };
    // Persist BEFORE committing locally (R03): a memory-only cancel is
    // invisible to Partner/KDS, so the old commit-then-write order told the
    // customer "cancelled" — and the UI believed it — even when the server
    // write failed and the kitchen kept cooking. Only a landed write may
    // commit the cancelled record or return ok; a failed write returns an
    // honest failure with the order left untouched in cache.
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
      const { logger } = await import("@/core/logging/logger");
      logger.warn("ordersService.cancel_persist_failed", {
        id,
        message: err instanceof Error ? err.message : String(err),
      });
      return fail(
        "CANCEL_PERSIST_FAILED",
        "We couldn't cancel this order — the store wasn't notified. Please call the store.",
        true,
      );
    }
    // The write landed, but if the account changed mid-flight the cancelled
    // record belongs to the previous session: don't commit it into the new
    // account's cache or report success to the new session (R03).
    if ((auth.currentUser?.uid ?? null) !== startedUid) {
      syncCacheScope(auth.currentUser);
      return fail(
        "AUTH_CHANGED",
        "Your session changed while cancelling. Please check the order status again.",
        true,
      );
    }
    orders.set(id, cancelled);
    return ok(cancelled);
  },

  /** Placeholder — real reorder will re-create a cart on the backend. */
  async reorder(id: string): Promise<ApiResult<{ items: Order["items"]; storeId: string } | null>> {
    await delay(150);
    const { auth } = await import("@/core/config/firebase");
    // Per-account cache (R03): re-anchor before the read below.
    syncCacheScope(auth.currentUser);
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
