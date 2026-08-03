import type { CheckoutSession } from '@prisma/client';
import {
  CheckoutSessionEntity,
  type CheckoutSessionStatus,
} from '../entities/checkout-session.entity';
import type { FulfillmentType } from '@modules/cart/entities/cart.entity';
import type { CheckoutSessionResponseDto, CheckoutIssueDto } from '../dto';
import type { PricingSnapshotDto } from '@modules/pricing/dto/pricing.dto';

export class CheckoutMapper {
  static toEntity(row: CheckoutSession): CheckoutSessionEntity {
    const e = new CheckoutSessionEntity();
    Object.assign(e, {
      ...row,
      status: row.status as CheckoutSessionStatus,
      fulfillment: row.fulfillment as FulfillmentType,
      pricingSnapshot: (row.pricingSnapshot as Record<string, unknown> | null) ?? null,
      taxSnapshot: (row.taxSnapshot as Record<string, unknown> | null) ?? null,
    });
    return e;
  }

  static toResponse(
    e: CheckoutSessionEntity,
    pricing: PricingSnapshotDto | undefined,
    issues: CheckoutIssueDto[],
  ): CheckoutSessionResponseDto {
    return {
      id: e.id,
      cartId: e.cartId,
      status: e.status,
      storeId: e.storeId,
      fulfillment: e.fulfillment,
      addressId: e.addressId ?? null,
      tableNumber: e.tableNumber ?? null,
      couponCode: e.couponCode ?? null,
      prepEtaMinutes: e.prepEtaMinutes ?? null,
      pricing,
      issues,
      expiresAt: e.expiresAt,
    };
  }
}
