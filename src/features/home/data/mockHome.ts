/**
 * Home fixtures for BURGONOMICS.
 * Populated dynamically using authentic Burgonomics QSR food photography.
 */
import type { MenuCategory, MenuItem } from "@/features/menu/services/menuService";
import type { Offer } from "@/features/offers/models";
import type { Banner, Combo, QuickReorderItem, RecommendationItem } from "@/features/home/models";

import { SAMPLE_CATEGORIES, SAMPLE_PRODUCTS } from "@/features/menu/data/petpoojaSampleData";
import { SAMPLE_OFFERS } from "@/features/offers/data/sampleOffers";

// 1. Promotional banners in the brand design language (Vibrant orange, lime green, deep green)
export const MOCK_BANNERS: Banner[] = [
  {
    id: "ban_damn_good",
    title: "THE HOUSE OF DAMN GOOD BURGERS",
    subtitle: "100% Pure Veg, freshly prepared, and absolutely mouth-watering!",
    ctaLabel: "Browse Burgers",
    ctaHref: "/menu/product/prd_hero",
    gradient: "bg-gradient-to-br from-[#0E4825] via-[#155A30] to-[#0A331A] text-white",
    visual: "",
    imageUrl: "/images/menu/banners/hero-burger-banner.jpg",
    fallbackImageUrl: "/images/menu/classic-burgers/hero-burger.jpg",
  },
  {
    id: "ban_big_bang_meal",
    title: "BIG BANG COMBO FEAST",
    subtitle: "Giant 5-inch burger + Golden Fries + Chilled Beverage at irresistible prices.",
    ctaLabel: "Order Combo",
    ctaHref: "/menu/product/prd_combo_big_bang_meal",
    gradient: "bg-gradient-to-br from-[#CC5200] via-[#B34700] to-[#9A3412] text-white",
    visual: "",
    imageUrl: "/images/menu/banners/big-bang-meal-banner.jpg",
    fallbackImageUrl: "/images/menu/combos/big-bang-meal.jpg",
  },
  {
    id: "ban_sizzling_burger",
    title: "IT'S FULL-ON BURGONOMICS!",
    subtitle: "Try our Veg Sizzling Burger cooked and served on a piping hot sizzling plate.",
    ctaLabel: "Order Sizzling",
    ctaHref: "/menu/product/prd_veg_sizzling",
    gradient: "bg-gradient-to-br from-[#0E4825] via-[#1B5934] to-[#CC5200] text-white",
    visual: "",
    imageUrl: "/images/menu/sizzling-burgers/veg-sizzling-burger.jpg",
    fallbackImageUrl: "/images/menu/sizzling-burgers/cheese-supreme-burger.jpg",
  },
  {
    id: "ban_fries",
    title: "ZINDAGI HO YA FRIES...",
    subtitle: "...bas crispy honi chahiye! Grab our seasoned Peri Peri golden fries.",
    ctaLabel: "Order Fries",
    ctaHref: "/menu/product/prd_peri_peri_fries",
    gradient: "bg-gradient-to-br from-[#CC5200] via-[#B34700] to-[#9A3412] text-white",
    visual: "",
    imageUrl: "/images/menu/banners/peri-peri-fries-banner.jpg",
    fallbackImageUrl: "/images/menu/fries/peri-peri-fries.jpg",
  },
  {
    id: "ban_myob",
    title: "MAKE YOUR OWN BURGER",
    subtitle: "Custom-craft your dream burger with gourmet patties, molten cheeses & sauces!",
    ctaLabel: "Customize Now",
    ctaHref: "/menu/product/prd_hero",
    gradient: "bg-gradient-to-br from-[#0E4825] via-[#155A30] to-[#0A331A] text-white",
    visual: "",
    imageUrl: "/images/menu/banners/myob-banner.png",
    fallbackImageUrl: "/images/menu/banners/myob.png",
  },
];

// 2. Categories mapped from our main Burgonomics category catalog
export const MOCK_CATEGORIES: MenuCategory[] = SAMPLE_CATEGORIES.map((c) => ({
  ...c,
  // Count items under this category
  itemCount: SAMPLE_PRODUCTS.filter((p) => p.categoryId === c.id).length,
}));

// 3. Featured offers
export const MOCK_FEATURED_OFFERS: Offer[] = SAMPLE_OFFERS;

// 4. Bestsellers - pulling popular items
export const MOCK_BEST_SELLERS: MenuItem[] = SAMPLE_PRODUCTS.filter((p) =>
  p.tags?.includes("popular") || p.badges?.some((b) => b.id === "bestseller"),
).slice(0, 8);

// 5. Mapped Combos from authentic meals data
export const MOCK_COMBOS: Combo[] = SAMPLE_PRODUCTS.filter(
  (p) => p.categoryId === "cat_combos",
).map((p) => {
  let originalPrice = p.price + 38;
  if (p.id === "prd_combo_classic_meal") originalPrice = 179;
  if (p.id === "prd_combo_big_bang_meal") originalPrice = 289;
  if (p.id === "prd_combo_cheese_burst") originalPrice = 259;

  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    price: p.price,
    originalPrice,
    visual: "",
    imageUrl: p.imageUrl,
    fallbackImageUrl: p.fallbackImageUrl,
    gradient: p.id.includes("big_bang") || p.id.includes("red_hot")
      ? "linear-gradient(135deg, #cc5200 0%, #b34700 100%)"
      : "linear-gradient(135deg, #0e4825 0%, #175e33 100%)",
  };
});

// 6. Recommended products
export const MOCK_RECOMMENDATIONS: RecommendationItem[] = SAMPLE_PRODUCTS.filter(
  (p) => p.tags?.includes("featured") || p.badges?.some((b) => b.id === "new"),
).map((p) => ({
  ...p,
  reason: p.badges?.some((b) => b.id === "new")
    ? "New on the Burgonomics menu"
    : "Highly rated by fellow vegetarians",
}));

// 7. Recently viewed items
export const MOCK_RECENTLY_VIEWED: MenuItem[] = SAMPLE_PRODUCTS.filter(
  (p) => p.id === "prd_hero" || p.id === "prd_salted_fries" || p.id === "prd_classic_cold_coffee",
);

// 8. Quick reorder items (simulated from user's history)
export const MOCK_QUICK_REORDER: QuickReorderItem[] = [
  {
    id: "re_01",
    orderId: "ORD-9821A",
    title: "Hero Burger + Peri Fries",
    subtitle: "2 items • Saved on last week's order",
    total: 198,
    placedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "re_02",
    orderId: "ORD-7612B",
    title: "Veg Sizzling Burger + Cold COCO",
    subtitle: "2 items • Saved from weekend dinner",
    total: 388,
    placedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];
