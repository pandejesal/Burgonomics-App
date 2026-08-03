/**
 * Favorites domain — repository-driven wishlist across products,
 * combos and categories. UI never hardcodes catalog data.
 */
export type FavoriteKind = "product" | "combo" | "category";

export interface Favorite {
  id: string;
  kind: FavoriteKind;
  refId: string;
  name: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  priceLabel?: string;
  addedAt: number;
}
