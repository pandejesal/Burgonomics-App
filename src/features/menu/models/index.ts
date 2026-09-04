/**
 * Menu domain models.
 *
 * These shapes are the frontend's contract — the future PETPOOJA-backed
 * `MenuRepository` will map wire DTOs into these types before returning
 * to UI. UI components must degrade gracefully when optional fields
 * are missing (nutrition, ingredients, imageUrls, etc.).
 */
import type { Id, Money, Paginated } from "@/core/models";

/** Repository-driven badge (Bestseller, New, Chef's Special, Spicy…). */
export interface ProductBadge {
  id: string;
  label: string;
  tone?: "primary" | "success" | "warning" | "error" | "neutral";
}

export interface MenuCategoryModel {
  id: Id;
  name: string;
  slug?: string;
  order?: number;
  itemCount?: number;
  parentId?: Id | null; // future nested categories
  imageUrl?: string;
}

export interface Product {
  id: Id;
  categoryId: Id;
  /** Human category label from the canonical product doc (not a separate collection). */
  categoryName?: string;
  name: string;
  description?: string;
  price: Money;
  /** Optional strike-through original price (offers/discounts). */
  compareAtPrice?: Money;
  discountPercentage?: number;
  veg: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  fallbackImageUrl?: string;
  inStock: boolean;
  /** Whether the product exposes a customization picker. */
  customizable?: boolean;
  /** Preparation time in minutes, if returned. */
  prepTimeMinutes?: number;
  badges?: ProductBadge[];
  tags?: string[];
  /** Reason the product is unavailable (out of stock, store closed…). */
  unavailableReason?: string;
}

export interface CustomizationOption {
  id: Id;
  name: string;
  /** Price delta vs base — may be 0 or negative. */
  priceDelta: Money;
  isDefault?: boolean;
  outOfStock?: boolean;
}

export interface CustomizationGroup {
  id: Id;
  name: string;
  /** "single" (radio) or "multi" (checkbox). */
  selection: "single" | "multi";
  required?: boolean;
  minSelect?: number;
  maxSelect?: number;
  options: CustomizationOption[];
}

export interface NutritionFact {
  key: string;
  label: string;
  value: string;
}

export interface ProductDetails extends Product {
  ingredients?: string[];
  nutrition?: NutritionFact[];
  customizations?: CustomizationGroup[];
  /** Free-text special-instructions box. */
  allowSpecialInstructions?: boolean;
}

export type ProductPage = Paginated<Product>;

export interface SearchSuggestion {
  id: string;
  label: string;
  kind: "product" | "category" | "tag";
  targetId?: string;
}
