export class ProductImageEntity {
  id!: string;
  productId!: string;
  url!: string;
  altText?: string | null;
  displayOrder!: number;
  isPrimary!: boolean;
}

/**
 * INVARIANT — every product is PURE VEG. There is deliberately NO
 * `isVeg` / `dietary` field: the domain forbids representing anything
 * other than pure-veg products. Any attempt to add such a flag is a
 * violation of the frozen architecture.
 */
export class ProductEntity {
  readonly isPureVeg = true as const;

  id!: string;
  petpoojaId!: string;
  categoryId!: string;
  name!: string;
  description?: string | null;
  shortDescription?: string | null;
  basePrice!: string; // Decimal as string
  taxRate!: string;
  taxCode?: string | null;
  currency!: string;
  displayOrder!: number;
  isAvailable!: boolean;
  prepTimeMinutes?: number | null;

  // nutrition
  calories?: number | null;
  proteinG?: string | null;
  carbsG?: string | null;
  fatG?: string | null;
  fiberG?: string | null;
  servingSize?: string | null;
  allergens!: string[];

  tags!: string[];
  isPopular!: boolean;
  isRecommended!: boolean;
  isBestSeller!: boolean;
  isFeatured!: boolean;
  isSeasonal!: boolean;
  seasonalFrom?: Date | null;
  seasonalTo?: Date | null;

  translations?: Record<string, string> | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export class ProductStoreAvailabilityEntity {
  productId!: string;
  storeId!: string;
  isAvailable!: boolean;
  inStock!: boolean;
  priceOverride?: string | null;
  updatedAt!: Date;
}
