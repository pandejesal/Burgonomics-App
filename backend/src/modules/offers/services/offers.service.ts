import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { ConflictError, NotFoundError, ValidationError } from '@common/errors';
import { CacheService } from '@infra/cache/cache.service';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import {
  OFFER_REPOSITORY,
  type IOfferRepository,
} from '../repositories/interfaces/offer-repository.interface';
import type { ListOffersQueryDto, ValidateCouponDto } from '../dto';
import type { OfferUpsertInput } from '../validators/offer.validators';
import { OFFER_EVENTS, type OfferChangedEvent } from '../events/offer.events';
import type { OfferEntity } from '../entities/offer.entity';

const CACHE_KEY = (scope: string) => `catalog:offers:${scope}:v1`;
const CACHE_TTL = 120;

@Injectable()
export class OffersService {
  constructor(
    @Inject(OFFER_REPOSITORY) private readonly repo: IOfferRepository,
    private readonly cache: CacheService,
    private readonly bus: DomainEventBus,
  ) {}

  async list(q: ListOffersQueryDto): Promise<OfferEntity[]> {
    if (q.storeId || q.categoryId || q.productId) return this.repo.list(q);
    return this.cache.wrap(CACHE_KEY(q.scope ?? 'all'), CACHE_TTL, () => this.repo.list(q));
  }

  async get(id: string): Promise<OfferEntity> {
    const o = await this.repo.findById(id);
    if (!o) throw new NotFoundError('Offer not found');
    return o;
  }

  activeAt(when = new Date()) {
    return this.repo.activeAt(when);
  }

  /**
   * Coupon validation shell — the true engine (cart-total aware, user
   * usage-count aware) is implemented in the Cart/Checkout phase. This
   * method performs only the offer-level checks that can be decided
   * without a cart context.
   */
  async validateCoupon(input: ValidateCouponDto): Promise<OfferEntity> {
    const offer = await this.repo.findByCode(input.code);
    if (!offer) throw new NotFoundError('Coupon not found');
    if (!offer.isActive) throw new ConflictError('Coupon inactive');
    const now = new Date();
    if (offer.startsAt && offer.startsAt > now) throw new ValidationError('Coupon not yet active');
    if (offer.endsAt && offer.endsAt < now) throw new ValidationError('Coupon expired');
    if (input.storeId && offer.storeIds.length && !offer.storeIds.includes(input.storeId)) {
      throw new ValidationError('Coupon not valid for this store');
    }
    // cart-total, per-user usage and combo-eligibility checks belong to
    // the Cart/Checkout phase and will call back here + additional logic.
    return offer;
  }

  async upsertFromPetpooja(input: OfferUpsertInput, correlationId?: string): Promise<OfferEntity> {
    const prev = input.petpoojaId ? await this.repo.findByPetpoojaId(input.petpoojaId) : null;
    const offer = await this.repo.upsertFromPetpooja(input);
    await this.invalidateCache();
    this.bus.publish<OfferChangedEvent>(prev ? OFFER_EVENTS.UPDATED : OFFER_EVENTS.CREATED, {
      offerId: offer.id,
      petpoojaId: offer.petpoojaId ?? null,
      source: 'PETPOOJA_SYNC',
      correlationId,
    });
    return offer;
  }

  /** Future: loyalty and membership-tier resolution. */
  loyaltyOffersFor(_userId: string): Promise<OfferEntity[]> {
    throw new NotImplementedException('Loyalty offers not yet implemented');
  }

  async invalidateCache(): Promise<void> {
    await this.cache.del([
      CACHE_KEY('all'),
      CACHE_KEY('STORE'),
      CACHE_KEY('CATEGORY'),
      CACHE_KEY('PRODUCT'),
      CACHE_KEY('COMBO'),
      CACHE_KEY('CART'),
    ]);
  }
}
