/**
 * Home fixtures for BURGONOMICS.
 * Populated dynamically using the new PDF-based menu data for full fidelity.
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
    ctaHref: "/menu",
    gradient: "from-[#0e4825] to-[#175e33]",
    visual: "🍔",
    imageUrl: "/damn-good-burger.png",
    fallbackImageUrl:
      "https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=350&h=350&q=80",
  },
  {
    id: "ban_fries",
    title: "ZINDAGI HO YA FRIES...",
    subtitle: "...bas crispy honi chahiye! Grab our seasoned Peri Peri golden fries.",
    ctaLabel: "Order Fries",
    ctaHref: "/menu",
    gradient: "from-[#ff6600] to-[#ff802b]",
    visual: "🍟",
    imageUrl: "/fries-benefits.png",
    fallbackImageUrl:
      "https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=350&h=350&q=80",
  },
  {
    id: "ban_sizzling_burger",
    title: "IT'S FULL-ON BURGONOMICS!",
    subtitle: "Try our Veg Sizzling Burger cooked and served on a sizzling hot plate.",
    ctaLabel: "Order Sizzling Burgers",
    ctaHref: "/menu",
    gradient: "from-[#0c5129] to-[#ff6600]",
    visual: "🔥",
    imageUrl: "/drooling-burger.png",
    fallbackImageUrl:
      "https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=350&h=350&q=80",
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
  p.tags?.includes("popular"),
).slice(0, 8);

// 5. Mapped Combos from Page 6 of the PDF
export const MOCK_COMBOS: Combo[] = SAMPLE_PRODUCTS.filter(
  (p) => p.categoryId === "cat_combos",
).map((p) => {
  // Extract combo details or use placeholder mappings
  let originalPrice = p.price + 38;
  if (p.id === "prd_combo_classic_meal") originalPrice = 179;
  if (p.id === "prd_combo_big_bang_meal") originalPrice = 289;

  return {
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    price: p.price,
    originalPrice,
    visual: "🍱",
    imageUrl: p.imageUrl,
    fallbackImageUrl: p.fallbackImageUrl,
    gradient: p.id.includes("big_bang")
      ? "linear-gradient(135deg, #ff802b 0%, #ff6600 100%)"
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
