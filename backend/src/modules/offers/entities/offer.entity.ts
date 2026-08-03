export type OfferTypeValue = 'PROMOTIONAL' | 'COUPON' | 'COMBO' | 'LOYALTY' | 'MEMBERSHIP';
export type OfferScopeValue = 'STORE' | 'CATEGORY' | 'PRODUCT' | 'COMBO' | 'CART';
export type DiscountKindValue = 'PERCENTAGE' | 'FLAT' | 'FREE_ITEM' | 'BOGO';

export class OfferEntity {
  id!: string;
  petpoojaId?: string | null;
  code?: string | null;
  title!: string;
  description?: string | null;
  type!: OfferTypeValue;
  scope!: OfferScopeValue;
  discountKind!: DiscountKindValue;
  discountValue!: string;
  maxDiscount?: string | null;
  minOrderValue?: string | null;
  storeIds!: string[];
  categoryIds!: string[];
  productIds!: string[];
  comboProductIds!: string[];
  requiresLogin!: boolean;
  requiresCoupon!: boolean;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  bannerUrl?: string | null;
  displayOrder!: number;
  isActive!: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt!: Date;
  updatedAt!: Date;
}
