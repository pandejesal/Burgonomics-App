/**
 * OffersService — mock transport layer for offer discovery, coupon
 * validation, and application.
 *
 * Every method mirrors a future REST endpoint:
 *   GET  /v1/offers?storeId=&fulfillment=       → list
 *   GET  /v1/offers/:offerId                    → get
 *   POST /v1/offers/validate                    → validateCoupon
 *   POST /v1/cart/offers                        → apply
 *   DELETE /v1/cart/offers                      → remove
 *
 * All returned data is BACKEND-SHAPED — no discount calculation
 * happens here. Swap the mock bodies for real HTTP calls without any
 * UI or state change.
 */
import { delay, fail, ok, type ApiResult } from "@/core/network/http";
import type { AppliedOffer, Offer, OfferBundle } from "@/features/offers/models";
import type { Fulfillment } from "@/features/stores/models/Store";
import { SAMPLE_OFFERS } from "@/features/offers/data/sampleOffers";
import { useDemoStore, shouldSimulate } from "@/features/demo/state/demoStore";

/**
 * Refresh cadence promised by the backend (PETPOOJA sync every ~5m).
 * Consumers use this to expire the client cache.
 */
const REFRESH_INTERVAL_SECONDS = 300;

/**
 * Offer catalogue. In demo/simulation mode this returns the PETPOOJA-
 * shaped sample offers so the checkout flow can be exercised end to
 * end. In production the array is empty until the real
 * `GET /v1/offers` endpoint replaces this service.
 */
const catalogue = (): Offer[] => SAMPLE_OFFERS;

export interface ListOffersInput {
  storeId?: string;
  fulfillment?: Fulfillment;
}

export interface ApplyOfferInput {
  offerId?: string;
  code?: string;
  storeId?: string;
  fulfillment?: Fulfillment;
  subtotal: number;
}

/** Simple deterministic mock discount computation for placeholder demo. */
function mockComputeDiscount(offer: Offer, subtotal: number): number {
  const d = offer.discount;
  if (d.mode === "percent" && typeof d.value === "number") {
    const raw = Math.round((subtotal * d.value) / 100);
    return d.maxDiscount ? Math.min(raw, d.maxDiscount) : raw;
  }
  if (d.mode === "flat" && typeof d.value === "number") {
    return Math.min(d.value, subtotal);
  }
  return 0;
}

function matchesContext(offer: Offer, input: ListOffersInput): boolean {
  const { applicableFulfillments, applicableStoreIds } = offer.eligibility;
  if (
    applicableFulfillments &&
    input.fulfillment &&
    !applicableFulfillments.includes(input.fulfillment)
  ) {
    return false;
  }
  if (applicableStoreIds && input.storeId && !applicableStoreIds.includes(input.storeId)) {
    return false;
  }
  return true;
}

export const offersService = {
  async list(input: ListOffersInput = {}): Promise<ApiResult<OfferBundle>> {
    await delay(220);
    const offers = catalogue()
      .filter((o) => matchesContext(o, input))
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    return ok({
      offers,
      fetchedAt: new Date().toISOString(),
      refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
    });
  },

  async get(offerId: string): Promise<ApiResult<Offer>> {
    await delay(120);
    const offer = catalogue().find((o) => o.id === offerId);
    if (!offer) return fail("OFFER_NOT_FOUND", "Offer no longer available.");
    return ok(offer);
  },

  async validateCoupon(
    code: string,
    input: Omit<ApplyOfferInput, "code" | "offerId">,
  ): Promise<ApiResult<Offer>> {
    await delay(280);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return fail("INVALID_CODE", "Enter a coupon code.");
    if (shouldSimulate("coupon_invalid")) {
      return fail("COUPON_INVALID_SIM", "Simulated: this coupon is invalid.", false);
    }
    const offer = catalogue().find((o) => (o.code ?? "").toUpperCase() === trimmed);
    if (!offer) {
      return fail("COUPON_NOT_FOUND", `"${trimmed}" isn't a valid coupon.`, false);
    }
    if (offer.status !== "active") {
      return fail("COUPON_INACTIVE", "This coupon is no longer active.", false);
    }
    if (offer.eligibility.minOrderValue && input.subtotal < offer.eligibility.minOrderValue) {
      return fail(
        "MIN_ORDER_NOT_MET",
        `Add items worth ₹${offer.eligibility.minOrderValue - input.subtotal} more to unlock this offer.`,
        false,
      );
    }
    if (!matchesContext(offer, input)) {
      return fail(
        "OFFER_INELIGIBLE",
        "This coupon isn't available for the selected store or fulfillment.",
        false,
      );
    }
    return ok(offer);
  },

  async apply(input: ApplyOfferInput): Promise<ApiResult<AppliedOffer>> {
    await delay(260);
    let offer: Offer | undefined;
    if (input.offerId) {
      offer = catalogue().find((o) => o.id === input.offerId);
    } else if (input.code) {
      const trimmed = input.code.trim().toUpperCase();
      offer = catalogue().find((o) => (o.code ?? "").toUpperCase() === trimmed);
    }
    if (!offer) return fail("OFFER_NOT_FOUND", "Offer not found.");
    if (offer.eligibility.minOrderValue && input.subtotal < offer.eligibility.minOrderValue) {
      return fail(
        "MIN_ORDER_NOT_MET",
        `Minimum order of ₹${offer.eligibility.minOrderValue} required.`,
      );
    }
    if (!matchesContext(offer, input)) {
      return fail("OFFER_INELIGIBLE", "This offer isn't available right now.");
    }
    const discount = mockComputeDiscount(offer, input.subtotal);
    return ok({
      offerId: offer.id,
      code: offer.code ?? offer.id,
      title: offer.title,
      discount,
      savingsLabel: discount > 0 ? `You saved ₹${discount}` : offer.discount.label,
      type: offer.type,
    });
  },

  async remove(_offerId: string): Promise<ApiResult<null>> {
    await delay(120);
    return ok(null);
  },
};

export { REFRESH_INTERVAL_SECONDS };
