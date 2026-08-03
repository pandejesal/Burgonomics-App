import type { OfferEntity } from '../../entities/offer.entity';
import type { ListOffersQueryDto } from '../../dto';
import type { OfferUpsertInput } from '../../validators/offer.validators';

export const OFFER_REPOSITORY = Symbol('OFFER_REPOSITORY');

export interface IOfferRepository {
  findById(id: string): Promise<OfferEntity | null>;
  findByCode(code: string): Promise<OfferEntity | null>;
  findByPetpoojaId(petpoojaId: string): Promise<OfferEntity | null>;
  list(q: ListOffersQueryDto): Promise<OfferEntity[]>;
  activeAt(when: Date): Promise<OfferEntity[]>;
  upsertFromPetpooja(input: OfferUpsertInput): Promise<OfferEntity>;
  deactivateByPetpoojaIdsNotIn(keep: string[]): Promise<number>;
}
