/**
 * Home feature domain models. Repositories map wire DTOs into these
 * shapes; UI code consumes these exclusively.
 */
import type { MenuCategory, MenuItem } from "@/features/menu/services/menuService";
import type { Offer } from "@/features/offers/models";

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  /** Tailwind gradient utility classes for the background. */
  gradient: string;
  /** Emoji / short label rendered as a decorative visual placeholder. */
  visual: string;
  /** Optional premium background or hero image. */
  imageUrl?: string;
  fallbackImageUrl?: string;
}

export interface Combo {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number;
  visual: string;
  gradient: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
}

export interface RecommendationItem extends MenuItem {
  reason?: string;
}

export interface QuickReorderItem {
  id: string;
  orderId: string;
  title: string;
  subtitle: string;
  total: number;
  placedAt: string;
}

export interface HomeBundle {
  banners: Banner[];
  categories: MenuCategory[];
  featuredOffers: Offer[];
  bestSellers: MenuItem[];
  popularCombos: Combo[];
  recommendations: RecommendationItem[];
  recentlyViewed: MenuItem[];
  quickReorder: QuickReorderItem[];
}
