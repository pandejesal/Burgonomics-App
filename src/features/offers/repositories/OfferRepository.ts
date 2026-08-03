/**
 * OfferRepository — the sole entry point UI components use to fetch,
 * validate, or apply an offer. Wraps the mock service today; tomorrow
 * it becomes a thin façade over the offers HTTP client.
 *
 * Contract mirrors the future REST surface — see `offersService`.
 */
import type { ApiResult } from "@/core/network/http";
import {
  offersService,
  type ApplyOfferInput,
  type ListOffersInput,
} from "@/features/offers/services/offersService";
import type { AppliedOffer, Offer, OfferBundle } from "@/features/offers/models";

export class OfferRepository {
  readonly name = "OfferRepository";

  constructor(private readonly service = offersService) {}

  list(input: ListOffersInput = {}): Promise<ApiResult<OfferBundle>> {
    return this.service.list(input);
  }

  get(offerId: string): Promise<ApiResult<Offer>> {
    return this.service.get(offerId);
  }

  validateCoupon(
    code: string,
    input: Omit<ApplyOfferInput, "code" | "offerId">,
  ): Promise<ApiResult<Offer>> {
    return this.service.validateCoupon(code, input);
  }

  apply(input: ApplyOfferInput): Promise<ApiResult<AppliedOffer>> {
    return this.service.apply(input);
  }

  remove(offerId: string): Promise<ApiResult<null>> {
    return this.service.remove(offerId);
  }
}

export const offerRepository = new OfferRepository();
