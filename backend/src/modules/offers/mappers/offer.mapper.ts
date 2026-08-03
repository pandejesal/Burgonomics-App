import type { Offer } from '@prisma/client';
import {
  OfferEntity,
  type DiscountKindValue,
  type OfferScopeValue,
  type OfferTypeValue,
} from '../entities/offer.entity';
import { OfferResponseDto } from '../dto';

export class OfferMapper {
  static toEntity(row: Offer): OfferEntity {
    const e = new OfferEntity();
    Object.assign(e, {
      ...row,
      type: row.type as OfferTypeValue,
      scope: row.scope as OfferScopeValue,
      discountKind: row.discountKind as DiscountKindValue,
      discountValue: row.discountValue.toString(),
      maxDiscount: row.maxDiscount?.toString() ?? null,
      minOrderValue: row.minOrderValue?.toString() ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    });
    return e;
  }

  static toResponse(e: OfferEntity): OfferResponseDto {
    return {
      id: e.id,
      code: e.code ?? null,
      title: e.title,
      description: e.description ?? null,
      type: e.type,
      scope: e.scope,
      discountKind: e.discountKind,
      discountValue: e.discountValue,
      maxDiscount: e.maxDiscount ?? null,
      minOrderValue: e.minOrderValue ?? null,
      storeIds: e.storeIds,
      categoryIds: e.categoryIds,
      productIds: e.productIds,
      comboProductIds: e.comboProductIds,
      requiresLogin: e.requiresLogin,
      requiresCoupon: e.requiresCoupon,
      startsAt: e.startsAt?.toISOString() ?? null,
      endsAt: e.endsAt?.toISOString() ?? null,
      bannerUrl: e.bannerUrl ?? null,
      displayOrder: e.displayOrder,
      isActive: e.isActive,
    };
  }
}
