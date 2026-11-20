import { fail, ok, type ApiResult } from "@/core/network/http";
import { appConfig } from "@/core/config/env";
import { secureStorage, SECURE_KEYS } from "@/core/storage/secureStorage";
import type { AppliedOffer, Offer, OfferBundle } from "@/features/offers/models";
import type { Fulfillment } from "@/features/stores/models/Store";

/**
 * The coupon authority's client. NOTHING here computes a discount.
 *
 * Audit 2026-11-20 §1.6: this file used to read the `petpooja_offers`
 * collection (which no backend code ever wrote), fall back to hardcoded sample
 * offers, and preview a discount with local arithmetic — while the server that
 * charged the order read a DIFFERENT collection (`coupons`). A customer could be
 * shown "You saved ₹150" and then be charged full price. Both client-side
 * sources are gone: the app asks the server for the code's value and shows what
 * the server says.
 *
 *   GET  /coupons/available  → the offers screen's list
 *   POST /coupons/quote      → validate a code against the real cart
 */

const REFRESH_INTERVAL_SECONDS = 300;

export interface ListOffersInput {
  storeId?: string;
  fulfillment?: Fulfillment;
}

export interface CouponLine {
  productId: string;
  quantity: number;
  price?: number;
  customizations?: unknown[];
}

export interface ApplyOfferInput {
  offerId?: string;
  code?: string;
  storeId?: string;
  fulfillment?: Fulfillment;
  /** Legacy field, kept for callers. The server prices the cart itself. */
  subtotal?: number;
  /** The cart lines, so the SERVER can price the basket. */
  lines?: CouponLine[];
}

/** The server's answer for one code. Never a client-computed number. */
export interface CouponQuoteResult {
  valid: boolean;
  code: string;
  title: string;
  discount: number;
  subtotal: number;
  totalAfterDiscount: number;
  message: string;
  reason: string;
}

interface AvailableCouponDto {
  code: string;
  title: string;
  discountType: "percent" | "flat";
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  validToMs: number | null;
}

function apiBase(): string {
  const configured = appConfig.integrations.paymentsApiBaseUrl;
  if (configured) {
    // The coupon routes live on the same API host, not under /payments.
    return configured.replace(/\/payments\/?$/, "").replace(/\/$/, "");
  }
  return "https://asia-south1-burgonomics-7faa8.cloudfunctions.net/api";
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const token = await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN);
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const { getAppCheckToken } = await import("@/core/config/firebase");
    const appCheckToken = await getAppCheckToken();
    if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;
  } catch {
    // Attestation is advisory until enforcement is on; the call still proceeds.
  }
  return headers;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; payload: any }> {
  const base = apiBase();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: await authHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text().catch(() => "");
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  return { status: res.status, payload };
}

function mapCoupon(dto: AvailableCouponDto): Offer {
  const label =
    dto.discountType === "percent"
      ? `${dto.value}% off${dto.maxDiscount ? ` up to ₹${dto.maxDiscount}` : ""}`
      : `₹${dto.value} off`;
  return {
    id: dto.code,
    type: "coupon",
    title: dto.title || dto.code,
    description:
      dto.minOrder > 0
        ? `Use code ${dto.code}. Minimum order ₹${dto.minOrder}.`
        : `Use code ${dto.code}.`,
    code: dto.code,
    automatic: false,
    discount: {
      mode: dto.discountType,
      label,
      value: dto.value,
      ...(dto.maxDiscount ? { maxDiscount: dto.maxDiscount } : {}),
    },
    eligibility: {
      ...(dto.minOrder > 0 ? { minOrderValue: dto.minOrder } : {}),
    },
    ...(dto.validToMs ? { expiresAt: new Date(dto.validToMs).toISOString() } : {}),
    status: "active",
    priority: 50,
  };
}

export const offersService = {
  async list(input: ListOffersInput = {}): Promise<ApiResult<OfferBundle>> {
    try {
      const query = input.storeId ? `?storeId=${encodeURIComponent(input.storeId)}` : "";
      const { status, payload } = await request<{ coupons: AvailableCouponDto[] }>(
        "GET",
        `/coupons/available${query}`,
      );
      if (status !== 200) {
        return fail(
          "OFFERS_UNAVAILABLE",
          payload?.error || "Could not load offers. Please try again.",
          true,
        );
      }
      const coupons: AvailableCouponDto[] = Array.isArray(payload?.coupons) ? payload.coupons : [];
      return ok({
        offers: coupons.map(mapCoupon),
        fetchedAt: new Date().toISOString(),
        refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
      });
    } catch (error) {
      console.error("[offers] list failed:", error);
      return fail("OFFERS_UNAVAILABLE", "Could not load offers. Please try again.", true);
    }
  },

  async get(offerId: string): Promise<ApiResult<Offer>> {
    const listed = await this.list();
    if (!listed.success) return listed;
    const found = listed.data.offers.find((o) => o.id === offerId || o.code === offerId);
    if (!found) return fail("OFFER_NOT_FOUND", "Offer no longer available.");
    return ok(found);
  },

  /**
   * The ONE validation path. `lines` are the cart's product ids and quantities;
   * the server prices them from the catalogue and answers with the discount.
   */
  async quote(input: {
    code: string;
    lines?: CouponLine[];
    storeId?: string;
    branchId?: string;
  }): Promise<ApiResult<CouponQuoteResult>> {
    const code = input.code.trim().toUpperCase();
    if (!code) return fail("INVALID_CODE", "Enter a coupon code.", false);
    if (!input.lines || input.lines.length === 0) {
      return fail("CART_EMPTY", "Add something to your cart first.", false);
    }
    try {
      const { status, payload } = await request<any>("POST", "/coupons/quote", {
        code,
        items: input.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          ...(typeof line.price === "number" ? { price: line.price } : {}),
        })),
        ...(input.storeId ? { storeId: input.storeId } : {}),
        ...(input.branchId ? { branchId: input.branchId } : {}),
      });
      if (status === 200 && payload?.valid) {
        return ok({
          valid: true,
          code: payload.code ?? code,
          title: payload.title ?? code,
          discount: Number(payload.discount) || 0,
          subtotal: Number(payload.subtotal) || 0,
          totalAfterDiscount: Number(payload.totalAfterDiscount) || 0,
          message: payload.message ?? "Coupon applied.",
          reason: payload.reason ?? "OK",
        });
      }
      // A refused coupon is a normal answer, not an outage: carry the server's
      // own wording so the customer sees the real reason (expired, minimum,
      // already used, wrong store).
      //
      // `code` here is the COUPON code the customer typed, so `reason` must win:
      // reading `code` first made every refusal look like an unknown error to
      // callers that match on curated reason codes.
      return fail(
        payload?.reason || payload?.code || "COUPON_REJECTED",
        payload?.error || payload?.message || "This coupon can't be used right now.",
        status >= 500,
      );
    } catch (error) {
      console.error("[offers] quote failed:", error);
      return fail(
        "COUPON_CHECK_UNAVAILABLE",
        "We couldn't check that coupon just now — please try again.",
        true,
      );
    }
  },

  async validateCoupon(
    code: string,
    input: Omit<ApplyOfferInput, "code" | "offerId">,
  ): Promise<ApiResult<Offer>> {
    const quoted = await this.quote({
      code,
      lines: input.lines,
      storeId: input.storeId,
    });
    if (!quoted.success) return quoted;
    const listed = await this.list({ storeId: input.storeId });
    const offer = listed.success
      ? listed.data.offers.find((o) => o.code === quoted.data.code)
      : undefined;
    if (offer) return ok(offer);
    // A code that quotes but is not in the browsable list (e.g. issued to this
    // customer only) is still valid — synthesise the display shape from the
    // server's answer rather than pretending it does not exist.
    return ok({
      id: quoted.data.code,
      type: "coupon",
      title: quoted.data.title,
      description: quoted.data.message,
      code: quoted.data.code,
      automatic: false,
      discount: { mode: "other", label: quoted.data.message },
      eligibility: {},
      status: "active",
    });
  },

  async apply(input: ApplyOfferInput): Promise<ApiResult<AppliedOffer>> {
    const code = (input.code ?? input.offerId ?? "").trim().toUpperCase();
    if (!code) return fail("INVALID_CODE", "Enter a coupon code.", false);
    const quoted = await this.quote({
      code,
      lines: input.lines,
      storeId: input.storeId,
    });
    if (!quoted.success) return quoted;
    return ok({
      offerId: quoted.data.code,
      code: quoted.data.code,
      title: quoted.data.title,
      discount: quoted.data.discount,
      savingsLabel: `You saved ₹${quoted.data.discount}`,
      type: "coupon",
    });
  },

  /** Removing a coupon is local: nothing was held on the server until payment. */
  async remove(_offerId: string): Promise<ApiResult<null>> {
    return ok(null);
  },
};

export { REFRESH_INTERVAL_SECONDS };
