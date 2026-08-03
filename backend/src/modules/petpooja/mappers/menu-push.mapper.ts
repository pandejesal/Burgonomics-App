import type { CategoryUpsertInput } from '@modules/categories/validators/category.validators';
import type { ProductUpsertInput } from '@modules/products/validators/product.validators';
import type {
  ModifierGroupUpsertInput,
  ModifierOptionUpsertInput,
} from '@modules/modifiers/validators/modifier.validators';
import type { OfferUpsertInput } from '@modules/offers/validators/offer.validators';
import type { PushMenuWebhook } from '../dto/petpooja.dto';

/**
 * Translates a PETPOOJA push_menu envelope (or the equivalent
 * mapped_restaurant_menus response) into canonical upsert inputs for
 * the catalog services. Every string field is treated as opaque; only
 * numeric coercion happens here.
 *
 * PETPOOJA field naming (per the integration guide) is snake_case:
 *   categoryid, categoryname, categoryrank, category_image_url, ...
 *   itemid, itemname, itemcategoryid, price, item_tax, ...
 *   addongroupid, addongroup_name, addongroupitems[].addonitemid ...
 *   discountid, discountname, discountvalue, discounttype ...
 */
export interface MappedMenuEnvelope {
  restaurantPetpoojaId?: string;
  restaurantName?: string;
  categories: CategoryUpsertInput[];
  products: ProductUpsertInput[];
  modifierGroups: ModifierGroupUpsertInput[];
  offers: OfferUpsertInput[];
}

const str = (v: unknown, fallback = ''): string =>
  v === null || v === undefined ? fallback : String(v);
const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: unknown, fallback = true): boolean => {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return fallback;
};
const int = (v: unknown, fallback = 0): number => Math.trunc(num(v, fallback));

export function mapMenuEnvelope(payload: PushMenuWebhook): MappedMenuEnvelope {
  const restaurant = (payload.restaurants ?? [])[0] as Record<string, unknown> | undefined;

  return {
    restaurantPetpoojaId: restaurant
      ? str(restaurant.restaurantid ?? restaurant.res_id ?? restaurant.restID)
      : undefined,
    restaurantName: restaurant ? str(restaurant.restaurantname ?? restaurant.res_name) : undefined,
    categories: (payload.categories ?? []).map(mapCategory),
    products: (payload.items ?? []).map((it) => mapProduct(it, payload.addongroups ?? [])),
    modifierGroups: (payload.addongroups ?? []).map((g) =>
      mapModifierGroup(g, payload.addongroupitems ?? []),
    ),
    offers: (payload.discounts ?? []).map(mapOffer),
  };
}

function mapCategory(c: Record<string, unknown>): CategoryUpsertInput {
  return {
    petpoojaId: str(c.categoryid ?? c.category_id),
    name: str(c.categoryname ?? c.name, 'Category'),
    description: (c.category_description as string | undefined) ?? null,
    imageUrl: (c.category_image_url as string | undefined) ?? null,
    bannerUrl: null,
    displayOrder: int(c.categoryrank ?? c.display_order, 0),
    isVisible: bool(c.active ?? c.is_active, true),
    isAvailable: bool(c.is_available, true),
    parentPetpoojaId: (c.parent_category_id as string | undefined) ?? null,
    translations: null,
  };
}

function mapProduct(
  it: Record<string, unknown>,
  _allAddonGroups: Array<Record<string, unknown>>,
): ProductUpsertInput {
  const modifierGroupIds = ((it.item_addon as Array<Record<string, unknown>> | undefined) ?? [])
    .map((g) => str(g.addon_group_id ?? g.addongroupid))
    .filter(Boolean);

  const images: ProductUpsertInput['images'] = [];
  const imgUrl = it.item_image_url as string | undefined;
  if (imgUrl) {
    images.push({
      url: imgUrl,
      altText: str(it.itemname ?? it.name, ''),
      isPrimary: true,
      displayOrder: 0,
    });
  }

  return {
    petpoojaId: str(it.itemid ?? it.item_id),
    categoryPetpoojaId: str(it.item_categoryid ?? it.itemcategoryid),
    name: str(it.itemname ?? it.name, 'Item'),
    description: (it.itemdescription as string | undefined) ?? null,
    shortDescription: null,
    basePrice: str(it.price ?? it.itemprice ?? 0),
    taxRate: str(it.item_tax ?? it.tax_percentage ?? 0),
    taxCode: (it.tax_code as string | undefined) ?? null,
    currency: str(it.currency ?? 'INR', 'INR'),
    displayOrder: int(it.itemrank ?? it.display_order, 0),
    isAvailable: bool(it.active ?? it.in_stock ?? it.is_available, true),
    prepTimeMinutes: (it.minimumpreparationtime as number | undefined) ?? null,
    calories: (it.itemcalories as number | undefined) ?? null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    servingSize: (it.serving_size as string | undefined) ?? null,
    allergens: [],
    tags: [],
    isPopular: bool(it.is_popular, false),
    isRecommended: bool(it.is_recommended, false),
    isBestSeller: bool(it.is_best_seller, false),
    isFeatured: bool(it.is_featured, false),
    isSeasonal: false,
    seasonalFrom: null,
    seasonalTo: null,
    translations: null,
    images,
    modifierGroupPetpoojaIds: modifierGroupIds,
  };
}

function mapModifierGroup(
  g: Record<string, unknown>,
  allItems: Array<Record<string, unknown>>,
): ModifierGroupUpsertInput {
  const groupId = str(g.addongroupid ?? g.addon_group_id);
  const min = int(g.addongroup_selection_min ?? g.min_selection, 0);
  const max = int(g.addongroup_selection_max ?? g.max_selection, 1);
  const options: ModifierOptionUpsertInput[] = allItems
    .filter((it) => str(it.addongroup_id ?? it.addongroupid) === groupId)
    .map((it) => ({
      petpoojaId: str(it.addonitemid ?? it.addon_item_id),
      name: str(it.addonitem_name ?? it.addonitemname, 'Option'),
      price: str(it.addonitem_price ?? it.price ?? 0),
      displayOrder: int(it.addonitem_rank ?? 0, 0),
      isAvailable: bool(it.active ?? it.is_available, true),
      isDefault: bool(it.is_default, false),
      translations: null,
    }));
  return {
    petpoojaId: groupId,
    name: str(g.addongroup_name ?? g.name, 'Modifier Group'),
    description: null,
    minSelection: min,
    maxSelection: Math.max(min, max),
    isRequired: min > 0,
    allowMultiple: max > 1,
    displayOrder: int(g.addongroup_rank, 0),
    isAvailable: bool(g.active ?? g.is_available, true),
    translations: null,
    options,
  };
}

function mapOffer(d: Record<string, unknown>): OfferUpsertInput {
  const kindRaw = str(d.discounttype ?? d.discount_type, 'percentage').toLowerCase();
  const discountKind: OfferUpsertInput['discountKind'] =
    kindRaw === 'flat' || kindRaw === 'amount' ? 'FLAT' : 'PERCENTAGE';
  return {
    petpoojaId: str(d.discountid ?? d.discount_id),
    code: (d.discount_code as string | undefined) ?? null,
    title: str(d.discountname ?? d.name, 'Offer'),
    description: (d.discount_description as string | undefined) ?? null,
    type: 'PROMOTIONAL',
    scope: 'CART',
    discountKind,
    discountValue: str(d.discountvalue ?? d.discount_value ?? 0),
    maxDiscount: (d.discount_max as string | undefined) ?? null,
    minOrderValue: (d.discount_min_order as string | undefined) ?? null,
    storeIds: [],
    categoryIds: [],
    productIds: [],
    comboProductIds: [],
    requiresLogin: false,
    requiresCoupon: Boolean(d.discount_code),
    usageLimit: null,
    perUserLimit: null,
    startsAt: null,
    endsAt: null,
    bannerUrl: null,
    displayOrder: 0,
    isActive: bool(d.active ?? d.is_active, true),
    metadata: null,
  };
}
