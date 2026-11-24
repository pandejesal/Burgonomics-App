/**
 * Cash-on-delivery transport (owner decision 2026-11-20: COD is in launch).
 *
 * `POST /orders/createCashOrder` is the SERVER-side creator of a cash order:
 * it resolves the branch, prices every line from the catalogue, enforces the
 * branch's COD switch and ceiling, and stamps the server-only
 * `paymentChannel: "cash"` marker. The app never writes a cash order itself —
 * the amount a rider collects at the door has to be the server's number, not
 * the cart's.
 *
 * Failure policy mirrors `checkoutFees`: a typed server refusal keeps its code
 * and sentence (COD_UNAVAILABLE, COD_LIMIT_EXCEEDED, PRICE_CHANGED,
 * ITEM_UNAVAILABLE, DELIVERY_QUOTE_REQUIRED …), because those are decisions the
 * customer must see, not "try again" noise.
 */
import { fail, ok, type ApiResult } from "@/core/network/http";
import { httpClient } from "@/core/network/httpClient";
import { defaultFunctionsBase } from "@/core/config/functionsBase";
import { logger } from "@/core/logging/logger";

export const CREATE_CASH_ORDER_PATH = "/orders/createCashOrder";

export interface CashOrderLine {
  productId: string;
  quantity: number;
  customizations?: Array<Record<string, unknown>>;
  modifiers?: Array<Record<string, unknown>>;
  notes?: string;
}

export interface CashOrderRequest {
  orderId: string;
  storeId?: string;
  branchId?: string;
  orderType: "delivery" | "takeaway" | "dinein";
  items: CashOrderLine[];
  expectedTotalPaise: number;
  zeroDueOnly?: true;
  attemptId?: string;
  addressId?: string;
  deliveryQuoteId?: string;
  couponCode?: string;
  tipAmount?: number;
  notes?: string;
  fulfillmentInstructions?: string;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  whatsappOptIn?: boolean;
  estimatedAt?: string;
  store?: Record<string, unknown>;
  address?: Record<string, unknown>;
  deliveryAddress?: Record<string, unknown>;
  promo?: Record<string, unknown> | null;
}

export interface CashOrderReceipt {
  orderId: string;
  replayed: boolean;
  paymentMethod: "cod";
  paymentChannel: "cash";
  cashDuePaise: number;
  totals: Record<string, unknown>;
  status: { code: string; label: string; kind: string; terminal: boolean };
}

export function createCashOrderUrl(): string {
  return `${defaultFunctionsBase()}${CREATE_CASH_ORDER_PATH}`;
}

/**
 * Firebase ID token + App Check, exactly like every other authenticated route.
 *
 * DELIBERATELY NO `Content-Type`: this service posts through the shared
 * `httpClient`, which already supplies `content-type: application/json`. Adding a
 * capital-`C` copy here produced two distinct object keys, and Fetch joined them
 * into `application/json, application/json` — Cycle 10 staging, where
 * `express.json()` then skipped the body and every checkout lane got a
 * field-level 400. Auth headers stay lowercase for the same reason.
 */
async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const { auth, getAppCheckToken } = await import("@/core/config/firebase");
    const idToken = (await auth.currentUser?.getIdToken()) ?? null;
    if (idToken) headers.authorization = `Bearer ${idToken}`;
    const appCheckToken = await getAppCheckToken();
    if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;
  } catch (err) {
    logger.warn("cash_order.auth_unavailable", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return headers;
}

export interface CashOrderTransport {
  post(
    url: string,
    body: unknown,
    init?: { headers?: Record<string, string> },
  ): Promise<{ data: unknown }>;
}

const defaultTransport: CashOrderTransport = {
  post: (url, body, init) => httpClient.post(url, body, init),
};

function readRefusal(err: unknown): {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
} {
  const e = err as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
    response?: {
      status?: unknown;
      data?: { code?: unknown; error?: unknown; totals?: unknown };
    };
  };
  const bodyCode = e?.response?.data?.code;
  const code =
    typeof bodyCode === "string" && bodyCode.trim()
      ? bodyCode
      : typeof e?.code === "string" && e.code.trim()
        ? e.code
        : "";
  const bodyMessage = e?.response?.data?.error;
  const message =
    typeof bodyMessage === "string" && bodyMessage.trim()
      ? bodyMessage
      : typeof e?.message === "string" && e.message.trim()
        ? e.message
        : "";
  const status = Number(e?.response?.status ?? e?.status ?? 0) || 0;
  // M5: PRICE_CHANGED carries the SERVER's authoritative breakdown. Carry it
  // through so the screen can show the exact total for reconfirmation instead
  // of discarding it as a terminal message.
  const totals = e?.response?.data?.totals;
  return {
    code,
    message,
    status,
    ...(totals && typeof totals === "object" ? { details: { totals } } : {}),
  };
}

/** Codes that a retry can never fix — the customer must change something. */
const TERMINAL_REFUSALS = new Set([
  "COD_UNAVAILABLE",
  "COD_LIMIT_EXCEEDED",
  "PRICE_CHANGED",
  "ITEM_UNAVAILABLE",
  "ITEM_PRICE_UNVERIFIED",
  "PRODUCT_UNSUPPORTED",
  "STORE_NOT_LINKED",
  // F2 (staging 2026-11-21, Test 9): the outlet is closed. The server refuses
  // the cash order, and a retry cannot fix a closed shop.
  "STORE_CLOSED",
  "DELIVERY_QUOTE_REQUIRED",
  "DELIVERY_QUOTE_EXPIRED",
  "DELIVERY_QUOTE_UNSUPPORTED",
  "IDEMPOTENCY_CONFLICT",
  "ORDER_NOT_OWNED",
  "BRANCH_REQUIRED",
  "INVALID_INPUT",
]);

export async function createCashOrderOnServer(
  request: CashOrderRequest,
  deps: { transport?: CashOrderTransport } = {},
): Promise<ApiResult<CashOrderReceipt>> {
  const transport = deps.transport ?? defaultTransport;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return fail("OFFLINE", "You're offline — the order was not placed. Reconnect and retry.", true);
  }
  try {
    const res = await transport.post(createCashOrderUrl(), request, {
      headers: await buildHeaders(),
    });
    const raw = (res.data ?? {}) as Record<string, unknown>;
    const orderId = typeof raw.orderId === "string" ? raw.orderId : "";
    const cashDuePaise = raw.cashDuePaise;
    // M5: a fully-discounted order legitimately has cashDuePaise === 0. The
    // server accepts it with no collection due; only a NEGATIVE or non-integer
    // amount is an invalid response. Rejecting zero here used to orphan a real
    // written order that the kitchen had already received.
    if (
      !orderId ||
      typeof cashDuePaise !== "number" ||
      !Number.isSafeInteger(cashDuePaise) ||
      cashDuePaise < 0
    ) {
      logger.warn("cash_order.invalid_response", { orderId });
      return fail(
        "CASH_ORDER_INVALID",
        "The order could not be confirmed — please retry. Nothing was charged.",
        true,
      );
    }
    return ok({
      orderId,
      replayed: raw.replayed === true,
      paymentMethod: "cod",
      paymentChannel: "cash",
      cashDuePaise,
      totals: (raw.totals as Record<string, unknown>) ?? {},
      status: (raw.status as CashOrderReceipt["status"]) ?? {
        code: "PLACED",
        label: "Order placed",
        kind: "upcoming",
        terminal: false,
      },
    });
  } catch (err) {
    const { code, message, status, details } = readRefusal(err);
    logger.warn("cash_order.create_failed", { code, status });
    if (code && TERMINAL_REFUSALS.has(code)) {
      return fail(
        code,
        message || "Cash on delivery is not available for this order.",
        false,
        details,
      );
    }
    // Unknown transport failure: the server is idempotent on `orderId`, so a
    // retry is safe and cannot create a second order.
    return fail(
      code || "CASH_ORDER_FAILED",
      message || "We couldn't place your order. Please try again.",
      true,
    );
  }
}

export const cashOrderService = { create: createCashOrderOnServer };
