import { fail, ok, type ApiResult } from "@/core/network/http";
import { db } from "@/core/config/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import type { AppliedOffer, Offer, OfferBundle } from "@/features/offers/models";
import type { Fulfillment } from "@/features/stores/models/Store";

import { SAMPLE_OFFERS } from "../data/sampleOffers";

const REFRESH_INTERVAL_SECONDS = 300;

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

async function fetchOffersFromFirebase(): Promise<Offer[]> {
  try {
    const snap = await getDocs(collection(db, "petpooja_offers"));
    const offers: Offer[] = [];
    snap.forEach((docSnap) => {
      offers.push(docSnap.data() as Offer);
    });
    if (offers.length > 0) return offers;
  } catch (error) {
    console.error("Failed to fetch offers from Firebase:", error);
  }
  return SAMPLE_OFFERS;
}

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
  const { applicableFulfillments, applicableStoreIds } = offer.eligibility || {};
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
    const allOffers = await fetchOffersFromFirebase();
    const offers = allOffers
      .filter((o) => matchesContext(o, input))
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    return ok({
      offers,
      fetchedAt: new Date().toISOString(),
      refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
    });
  },

  async get(offerId: string): Promise<ApiResult<Offer>> {
    try {
      const snap = await getDoc(doc(db, "petpooja_offers", offerId));
      if (!snap.exists()) return fail("OFFER_NOT_FOUND", "Offer no longer available.");
      return ok(snap.data() as Offer);
    } catch (e) {
      return fail("OFFER_ERROR", "Failed to fetch offer details.");
    }
  },

  async validateCoupon(
    code: string,
    input: Omit<ApplyOfferInput, "code" | "offerId">,
  ): Promise<ApiResult<Offer>> {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return fail("INVALID_CODE", "Enter a coupon code.");

    const allOffers = await fetchOffersFromFirebase();
    const offer = allOffers.find((o) => (o.code ?? "").toUpperCase() === trimmed);

    if (!offer) {
      return fail("COUPON_NOT_FOUND", `"${trimmed}" isn't a valid coupon.`, false);
    }
    if (offer.status !== "active") {
      return fail("COUPON_INACTIVE", "This coupon is no longer active.", false);
    }
    if (offer.eligibility?.minOrderValue && input.subtotal < offer.eligibility.minOrderValue) {
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
    let offer: Offer | undefined;
    const allOffers = await fetchOffersFromFirebase();

    if (input.offerId) {
      offer = allOffers.find((o) => o.id === input.offerId);
    } else if (input.code) {
      const trimmed = input.code.trim().toUpperCase();
      offer = allOffers.find((o) => (o.code ?? "").toUpperCase() === trimmed);
    }

    if (!offer) return fail("OFFER_NOT_FOUND", "Offer not found.");
    if (offer.eligibility?.minOrderValue && input.subtotal < offer.eligibility.minOrderValue) {
      return fail(
        "MIN_ORDER_NOT_MET",
        `Minimum order of ₹${offer.eligibility.minOrderValue} required.`,
      );
    }
    if (!matchesContext(offer, input)) {
      return fail("OFFER_INELIGIBLE", "This offer isn't available right now.");
    }

    const discountAmount = mockComputeDiscount(offer, input.subtotal);
    return ok({
      offerId: offer.id,
      code: offer.code ?? offer.id,
      title: offer.title,
      discount: discountAmount,
      savingsLabel:
        discountAmount > 0 ? `You saved ₹${discountAmount}` : (offer.discount?.label ?? ""),
      type: offer.type,
    });
  },

  async remove(_offerId: string): Promise<ApiResult<null>> {
    return ok(null);
  },
};

export { REFRESH_INTERVAL_SECONDS };
