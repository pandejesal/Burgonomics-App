import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@common/errors';
import { DomainEventBus } from '@infra/events/domain-event-bus';
import { CartService } from '@modules/cart/services/cart.service';
import { PricingEngineService } from '@modules/pricing/services/pricing-engine.service';
import type { PricingSnapshotDto } from '@modules/pricing/dto/pricing.dto';
import { CheckoutValidatorService } from './checkout-validator.service';
import {
  CHECKOUT_REPOSITORY,
  type ICheckoutRepository,
} from '../repositories/interfaces/checkout-repository.interface';
import { CHECKOUT_EVENTS, type CheckoutSessionEvent } from '../events/checkout.events';
import type { CheckoutSessionEntity } from '../entities/checkout-session.entity';
import type { StartCheckoutInput } from '../validators/checkout.validators';
import type { CheckoutIssueDto } from '../dto';
import type { FulfillmentType } from '@modules/cart/entities/cart.entity';

const SESSION_TTL_MINUTES = 15;

export interface StartCheckoutResult {
  session: CheckoutSessionEntity;
  pricing: PricingSnapshotDto;
  issues: CheckoutIssueDto[];
}

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(CHECKOUT_REPOSITORY) private readonly repo: ICheckoutRepository,
    private readonly cart: CartService,
    private readonly pricing: PricingEngineService,
    private readonly validator: CheckoutValidatorService,
    private readonly bus: DomainEventBus,
  ) {}

  async start(userId: string, input: StartCheckoutInput): Promise<StartCheckoutResult> {
    const cart = await this.cart.getById(input.cartId);
    if (cart.userId && cart.userId !== userId) {
      throw new ValidationError('Cart does not belong to the authenticated user');
    }
    if (input.fulfillment || input.addressId || input.tableNumber) {
      await this.cart.updateMeta(cart.id, {
        fulfillment: (input.fulfillment as FulfillmentType | undefined) ?? undefined,
        addressId: input.addressId,
        tableNumber: input.tableNumber,
      });
    }
    const refreshed = await this.cart.getById(cart.id);
    if (!refreshed.storeId) throw new ValidationError('Store must be selected before checkout');

    const validation = await this.validator.validate({
      cart: refreshed,
      userId,
      couponCode: input.couponCode ?? null,
    });

    const totals = this.pricing.priceCart({
      items: refreshed.items,
      fulfillment: refreshed.fulfillment,
      currency: refreshed.currency,
      couponDiscount: validation.couponDiscount,
    });

    const pricingSnapshot: PricingSnapshotDto = {
      ...totals,
      calculatedAt: new Date().toISOString(),
    };

    const session = await this.repo.upsertByCart({
      cartId: refreshed.id,
      userId,
      storeId: refreshed.storeId,
      fulfillment: refreshed.fulfillment,
      addressId: refreshed.addressId ?? null,
      tableNumber: refreshed.tableNumber ?? null,
      couponCode: input.couponCode ?? null,
      prepEtaMinutes: validation.prepEtaMinutes,
      pricingSnapshot: pricingSnapshot as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + SESSION_TTL_MINUTES * 60_000),
    });

    const status = validation.valid ? 'VALIDATED' : 'DRAFT';
    const patched = await this.repo.updateStatus(session.id, status, {
      validatedAt: validation.valid ? new Date() : undefined,
    });

    this.bus.publish<CheckoutSessionEvent>(
      validation.valid ? CHECKOUT_EVENTS.VALIDATED : CHECKOUT_EVENTS.STARTED,
      { sessionId: patched.id, cartId: patched.cartId, userId, storeId: patched.storeId },
    );

    return { session: patched, pricing: pricingSnapshot, issues: validation.issues };
  }

  async get(id: string, userId: string): Promise<CheckoutSessionEntity> {
    const s = await this.repo.findById(id);
    if (!s) throw new NotFoundError('Checkout session not found');
    if (s.userId !== userId) throw new ValidationError('Not your checkout session');
    return s;
  }

  async lock(id: string, userId: string): Promise<CheckoutSessionEntity> {
    const s = await this.get(id, userId);
    if (s.status !== 'VALIDATED') throw new ValidationError('Session must be validated first');
    return this.repo.updateStatus(s.id, 'LOCKED', { lockedAt: new Date() });
  }

  async markConverted(id: string, orderId: string): Promise<void> {
    await this.repo.updateStatus(id, 'CONVERTED', { convertedAt: new Date(), orderId });
    this.bus.publish(CHECKOUT_EVENTS.CONVERTED, { sessionId: id, orderId });
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await this.repo.updateStatus(id, 'FAILED');
    this.bus.publish(CHECKOUT_EVENTS.FAILED, { sessionId: id, reason });
  }
}
