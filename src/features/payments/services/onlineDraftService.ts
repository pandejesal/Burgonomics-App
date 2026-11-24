import { fail, ok, type ApiResult } from "@/core/network/http";
import { httpClient } from "@/core/network/httpClient";
import { defaultFunctionsBase } from "@/core/config/functionsBase";
import { logger } from "@/core/logging/logger";

/** Server-created online draft. The client never writes an orders document. */
export const CREATE_ONLINE_DRAFT_PATH = "/orders/createOnlineDraft";

export interface OnlineDraftLine {
  productId: string;
  quantity: number;
  customizations?: Array<Record<string, unknown>>;
  modifiers?: Array<Record<string, unknown>>;
  notes?: string;
}
export interface OnlineDraftRequest {
  orderId: string;
  attemptId: string;
  storeId: string;
  branchId?: string;
  orderType: "delivery" | "takeaway" | "dinein";
  items: OnlineDraftLine[];
  deliveryQuoteId?: string;
  addressId?: string;
  couponCode?: string;
  tipAmount?: number;
  notes?: string;
  fulfillmentInstructions?: string;
  tableNumber?: string;
  whatsappOptIn?: boolean;
}
export interface OnlineDraftReceipt {
  orderId: string;
  /** Client-friendly alias; the server still owns the document. */
  id: string;
  attemptId: string;
  replayed: boolean;
  amountPaise: number;
  estimatedAt?: string;
  totals: Record<string, unknown>;
  status: { code: string; label: string; kind: string; terminal: boolean };
}

export function createOnlineDraftUrl(): string {
  return `${defaultFunctionsBase()}${CREATE_ONLINE_DRAFT_PATH}`;
}

async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { auth, getAppCheckToken } = await import("@/core/config/firebase");
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const appCheck = await getAppCheckToken();
    if (appCheck) headers["X-Firebase-AppCheck"] = appCheck;
  } catch (error) {
    logger.warn("online_draft.auth_unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return headers;
}

export interface OnlineDraftTransport {
  post(
    url: string,
    body: unknown,
    init?: { headers?: Record<string, string> },
  ): Promise<{ data: unknown }>;
}
const defaultTransport: OnlineDraftTransport = {
  post: (url, body, init) => httpClient.post(url, body, init),
};

export async function createOnlineDraftOnServer(
  request: OnlineDraftRequest,
  deps: { transport?: OnlineDraftTransport } = {},
): Promise<ApiResult<OnlineDraftReceipt>> {
  try {
    const response = await (deps.transport ?? defaultTransport).post(
      createOnlineDraftUrl(),
      request,
      {
        headers: await buildHeaders(),
      },
    );
    const raw = (response.data ?? {}) as Record<string, unknown>;
    if (
      typeof raw.orderId !== "string" ||
      !raw.orderId ||
      typeof raw.amountPaise !== "number" ||
      !Number.isSafeInteger(raw.amountPaise) ||
      raw.amountPaise < 0
    ) {
      return fail("ONLINE_DRAFT_INVALID", "The order could not be confirmed — please retry.", true);
    }
    return ok({
      orderId: raw.orderId,
      id: raw.orderId,
      attemptId: String(raw.attemptId ?? request.attemptId),
      replayed: raw.replayed === true,
      amountPaise: raw.amountPaise,
      ...(typeof raw.estimatedAt === "string" ? { estimatedAt: raw.estimatedAt } : {}),
      totals: (raw.totals as Record<string, unknown>) ?? {},
      status: (raw.status as OnlineDraftReceipt["status"]) ?? {
        code: "PLACED",
        label: "Order placed",
        kind: "upcoming",
        terminal: false,
      },
    });
  } catch (error: any) {
    const code = String(error?.response?.data?.code ?? error?.code ?? "ONLINE_DRAFT_FAILED");
    const message = String(
      error?.response?.data?.error ?? error?.message ?? "Could not create the checkout order.",
    );
    logger.warn("online_draft.create_failed", { code });
    const retryable = ![
      "INVALID_INPUT",
      "STORE_NOT_LINKED",
      "STORE_CLOSED",
      "ITEM_UNAVAILABLE",
      "IDEMPOTENCY_CONFLICT",
      "ORDER_NOT_OWNED",
      "COUPON_INVALID",
      "COUPON_EXHAUSTED",
    ].includes(code);
    const status = Number(error?.response?.status);
    const refused =
      [400, 409, 422].includes(status) &&
      !["IDEMPOTENCY_CONFLICT", "ORDER_DRAFT_INVALID"].includes(code);
    return fail(code, message, retryable, refused ? { draftRefused: true } : undefined);
  }
}

export async function retireOnlineDraftOnServer(
  orderId: string,
  attemptId: string,
): Promise<ApiResult<void>> {
  try {
    const { data } = await defaultTransport.post(
      createOnlineDraftUrl(),
      { operation: "retire", orderId, attemptId },
      { headers: await buildHeaders() },
    );
    const receipt = data as { retired?: unknown; orderId?: unknown; attemptId?: unknown } | null;
    if (
      receipt?.retired === true &&
      receipt.orderId === orderId &&
      receipt.attemptId === attemptId
    ) {
      return ok(undefined);
    }
  } catch (error: any) {
    if (error?.response?.data?.code === "DRAFT_PAYMENT_IN_PROGRESS") {
      return fail(
        "DRAFT_PAYMENT_IN_PROGRESS",
        "Finish your previous online payment before changing checkout.",
      );
    }
  }
  return fail(
    "DRAFT_RETIRE_UNCONFIRMED",
    "We couldn't resolve your previous checkout. Retry it before starting another.",
    true,
  );
}
