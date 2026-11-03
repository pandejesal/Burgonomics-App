import { z } from "zod";
import { defaultFunctionsBase } from "@/core/config/functionsBase";
import { fail, ok, type ApiResult } from "@/core/network/http";
import { httpClient } from "@/core/network/httpClient";
import { buildCheckoutFeesHeaders } from "@/features/checkout/services/deliveryQuoteService";

const deliveryCodeResponse = z.object({
  orderId: z.string(),
  deliveryOtp: z.string().regex(/^[1-9][0-9]{3}$/),
  version: z.literal(2),
});
type DeliveryCode = z.infer<typeof deliveryCodeResponse>;

/** Read-only owner endpoint. Never cache, persist, log, or fall back to payment responses. */
export async function retrieveDeliveryCode(
  orderId: string,
  accountUid: string,
  signal?: AbortSignal,
): Promise<ApiResult<DeliveryCode>> {
  const { auth } = await import("@/core/config/firebase");
  const current = () => !!accountUid && auth.currentUser?.uid === accountUid && !signal?.aborted;
  const changed = () => fail("AUTH_CHANGED", "Delivery code unavailable for this session.");
  if (!current()) return changed();
  try {
    const headers = await buildCheckoutFeesHeaders();
    if (!current()) return changed();
    const response = await httpClient.post<unknown>(
      `${defaultFunctionsBase()}/orders/deliveryOtp`,
      { orderId },
      {
        headers: { ...headers, "Cache-Control": "no-store" },
        signal,
        retry: { attempts: 1, backoffMs: 0 },
      },
    );
    if (!current()) return changed();
    const parsed = deliveryCodeResponse.safeParse(response.data);
    if (!parsed.success || parsed.data.orderId !== orderId) {
      return fail("INVALID_DELIVERY_CODE_RESPONSE", "We couldn't confirm the delivery code.", true);
    }
    return ok(parsed.data);
  } catch (error) {
    if (!current()) return changed();
    const transport = error as { status?: number; code?: string; response?: { data?: { code?: string; error?: { code?: string } } } } | null;
    const code = transport?.response?.data?.error?.code ?? transport?.response?.data?.code ?? transport?.code;
    if (code === "LEGACY_OTP_UNAVAILABLE") {
      return fail(code, "The delivery code for this older order can't be reopened.");
    }
    const status = transport?.status;
    return fail(
      "DELIVERY_CODE_UNAVAILABLE",
      "We couldn't load the delivery code.",
      status === undefined || status >= 500,
    );
  }
}
