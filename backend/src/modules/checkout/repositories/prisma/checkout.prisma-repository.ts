import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { CheckoutMapper } from '../../mappers/checkout.mapper';
import type {
  CheckoutSessionEntity,
  CheckoutSessionStatus,
} from '../../entities/checkout-session.entity';
import type {
  ICheckoutRepository,
  UpsertSessionInput,
} from '../interfaces/checkout-repository.interface';

@Injectable()
export class CheckoutPrismaRepository implements ICheckoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertByCart(input: UpsertSessionInput): Promise<CheckoutSessionEntity> {
    const row = await this.prisma.checkoutSession.upsert({
      where: { cartId: input.cartId },
      create: {
        cartId: input.cartId,
        userId: input.userId,
        storeId: input.storeId,
        fulfillment: input.fulfillment,
        addressId: input.addressId ?? null,
        tableNumber: input.tableNumber ?? null,
        couponCode: input.couponCode ?? null,
        prepEtaMinutes: input.prepEtaMinutes ?? null,
        pricingSnapshot: input.pricingSnapshot,
        taxSnapshot: input.taxSnapshot,
        expiresAt: input.expiresAt,
      },
      update: {
        storeId: input.storeId,
        fulfillment: input.fulfillment,
        addressId: input.addressId ?? null,
        tableNumber: input.tableNumber ?? null,
        couponCode: input.couponCode ?? null,
        prepEtaMinutes: input.prepEtaMinutes ?? null,
        pricingSnapshot: input.pricingSnapshot,
        taxSnapshot: input.taxSnapshot,
        expiresAt: input.expiresAt,
      },
    });
    return CheckoutMapper.toEntity(row);
  }

  async findById(id: string): Promise<CheckoutSessionEntity | null> {
    const row = await this.prisma.checkoutSession.findUnique({ where: { id } });
    return row ? CheckoutMapper.toEntity(row) : null;
  }

  async findByCart(cartId: string): Promise<CheckoutSessionEntity | null> {
    const row = await this.prisma.checkoutSession.findUnique({ where: { cartId } });
    return row ? CheckoutMapper.toEntity(row) : null;
  }

  async updateStatus(
    id: string,
    status: CheckoutSessionStatus,
    patch: Partial<{ validatedAt: Date; lockedAt: Date; convertedAt: Date; orderId: string }> = {},
  ): Promise<CheckoutSessionEntity> {
    const row = await this.prisma.checkoutSession.update({
      where: { id },
      data: { status, ...patch },
    });
    return CheckoutMapper.toEntity(row);
  }
}
