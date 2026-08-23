# BURGONOMICS — La Pino'z-Inspired UI Specification

**Version:** 1.0  
**Date:** 2026-08-22  
**Target:** `antigravity` implementation agent  
**Scope:** Home screen only (Menu/Cart/Profile/Store remain as-is for now)  
**Reference App:** La Pino'z Pizza (screenshots uploaded — light grey canvas, white cards, green header, mint/offers, franchise banner)

---

## 1. Design Language Summary

| Aspect            | Decision                                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Approach**      | **Inspired, not pixel-perfect** — borrow La Pino'z layout, card style, Explore Menu grid, BestSellers cards, Franchise+Awards banner, header, bottom nav; keep BURGONOMICS content/flows                                     |
| **Palette**       | **BURGONOMICS 60-30-10** only — do NOT use La Pino'z greens. Light: White `#FFFFFF`/`#F5F5F5` 60%, Green `#0E4825` 30%, Orange `#FF6600` 10%. Dark: Black `#0A0A0A` 60%, Dark Green `#0E4825` 30%, Dark Orange `#CC5200` 10% |
| **Canvas**        | Light: `#F5F5F5` (grey 100) base, white cards. Dark: `#0A0A0A` base, `#1A1A1A` cards (same layout, dark surfaces)                                                                                                            |
| **Typography**    | Montserrat for UI, Lilita One/MonstroSolid for display — keep existing `type-` utilities                                                                                                                                     |
| **Corner radius** | Pill `9999px`, card `24px` (`--radius-xlarge`), image `20px` (`--radius-large`)                                                                                                                                              |
| **Shadows**       | Keep `--shadow-low/medium/high` — La Pino'z cards have subtle `shadow-low`                                                                                                                                                   |

---

## 2. Color Token Updates (`src/styles.css`)

### Light Mode (`:root`)

```css
--background: #f5f5f5; /* 60% light grey canvas */
--surface: #ffffff; /* white cards */
--surface-elevated: #ffffff;
--bg-secondary: #f5f5f5;
--primary: #0e4825; /* 30% brand green */
--primary-foreground: #ffffff;
--primary-text: #0e4825; /* green text on white */
--accent: #ff6600; /* 10% orange */
--accent-foreground: #ffffff;
--text-primary: #16281d;
--text-secondary: #586b60;
--border: #e5ede7;
--divider: #e5ede7;
--input: #f8f9f8;
--ring: #ff6600;
```

### Dark Mode (`.dark`)

```css
--background: #0a0a0a; /* 60% true black */
--surface: #1a1a1a; /* dark cards */
--surface-elevated: #1e1e1e;
--bg-secondary: #141414;
--primary: #0e4825; /* 30% dark green */
--primary-foreground: #ffffff;
--primary-text: #4ade80; /* WCAG AAA on black */
--accent: #cc5200; /* dark orange for dark bg */
--accent-foreground: #ffffff;
--text-primary: #f3f5f4;
--text-secondary: #a0a0a0;
--border: #262626;
--divider: #262626;
--input: #141414;
--ring: #cc5200;
```

> **Note:** Do NOT introduce La Pino'z greens (`#165B31`, `#1A5C3A`, mint `#A8E6CF`). Use only BURGONOMICS tokens above.

---

## 3. Home Screen — Section-by-Section Spec

### 3.1 Header (Replace current `src/routes/home.tsx` header + `src/shared/layouts/AppShell.tsx` top bar)

**Visual:** Full-width green header (`#0E4825`), `rounded-b-3xl` (bottom corners only), safe-area top padding.

**Structure:**

```
+--------------------------------------------------+
| 🍔  BURGONOMICS          📍 Prahlad Nagar  ▼     |  ← Top bar: brand + store location + Change link
| 👤  Profile (orange "2" badge)                  |  ← Profile avatar with notification count
+--------------------------------------------------+
| 🔍 Search your favorite items...            🎤  |  ← White pill search, magnifier left, NO MIC ICON
+--------------------------------------------------+
```

**Implementation:**

- `src/routes/home.tsx`: Replace header section (lines 164-206) with La Pino'z-style header component
- `src/shared/layouts/AppShell.tsx`: Add green header wrapper with `rounded-b-3xl`
- `StoreHeaderCard.tsx` → replace with La Pino'z style: green bg, rounded bottom, store name/area, Change link, profile + badge
- Search: `rounded-full bg-white px-4 py-2.5` with `Search` icon left, placeholder "Search your favorite items", **NO mic icon**

**Dark mode:** Header stays `#0E4825`, text white, search `bg-surface` (`#1A1A1A`) with `text-primary`.

---

### 3.2 Banner Carousel (Mix: green hero + current for others)

**3.2.1 Hero Banner (First slide only — La Pino'z FLAT 50% style)**

- Full-width dark green (`#0E4825`) card, `rounded-2xl`, radial gradient background (`radial-gradient(120% 80% at 50% 0%, #1B5934 0%, #0E4825 100%)`)
- Large white/yellow typography: **Headline** `text-3xl font-bold text-white` + **Subheadline** `text-lg text-yellow-200`
- Right side: Burger cutout image (`w-64` absolute right-bottom)
- Bottom: Black pill button `rounded-full bg-black text-white px-4 py-2` with promo code (e.g., `BURG50`)
- Auto-advance paused on hover/focus

**3.2.2 Remaining Banners** — keep current `BannerCarousel` style (white cards, gradient, CTA)

**Implementation:** `src/features/home/components/BannerCarousel.tsx` — first item conditional render green hero, others current.

---

### 3.3 Explore Menu — 3-Column Grid (Replace CategoryGrid)

**Visual:** 3-column grid on mobile, white cards (`bg-white` / dark `#1A1A1A`), `rounded-2xl`, subtle `shadow-low`, `p-3`

**Card Structure:**

```
+--------------------------+
|        (circular img)    |  ← 64px circle, object-cover, green border ring (2px #0E4825)
|                          |
|   Category Name          |  ← titleMedium bold, truncate 1 line
|   12 items               |  ← caption secondary
+--------------------------+
```

**Grid:** `grid grid-cols-3 gap-3 px-4` (mobile). Last card if odd count: dimmed overlay + "View all" label centered.

**Implementation:** `src/features/home/components/CategoryGrid.tsx` — replace horizontal rail (`ul.flex overflow-x-auto`) with `div className="grid grid-cols-3 gap-3 px-4 pb-4"`. Each `li` → `Article` card with circular image wrapper, `Text` components for name/count.

**Dark mode:** Card `bg-surface` (`#1A1A1A`), border `border-divider`, text `text-primary`.

---

### 3.4 Banner Carousel (current style) — keep for secondary promos

No changes — keep existing `BannerCarousel` for non-hero promos.

---

### 3.5 Featured Offers — Hybrid (Keep rail + add green FLAT 50% banner)

**3.5.1 Green FLAT 50% Banner (One banner, La Pino'z style)**

- Full-width dark green `#0E4825` `rounded-2xl`, `overflow-hidden`
- Left: Large white/yellow headline `FLAT 50% OFF` / `UPTO 50% OFF`
- Right: Burger cutout image (`w-56` absolute right)
- Bottom: Black pill `Use Code: BURG50` `rounded-full bg-black text-white px-4 py-2`
- Position: **Above** the horizontal rail

**3.5.2 Offer Rail — Keep current `HorizontalRail` + `OfferCard`**

- Keep current horizontal rail with `OfferCard` white cards
- Minor polish: add green border on hover/active

**Implementation:** `src/routes/home.tsx` section 265-284 — insert green banner before `<HorizontalRail ariaLabel="Featured offers">`

---

### 3.6 Bestsellers — Reskin to La Pino'z White Cards (Hybrid Light/Dark)

**Visual per card:**

```
+-------------------------------+
|  [image: rounded-2xl top]     |  ← Full-width image, h-48, object-cover, rounded-t-2xl
|                               |
|  🟢 Bestseller   🟢 Veg       |  ← Badges: light green pill "Bestseller" + veg dot
|                               |
|  Hero Burger                  |  ← h3 bold, truncate 1 line
|  Customisable                 |  ← grey caption "Customisable"
|                               |
|  ₹99          [Add +]          |  ← Price bold left, outlined green pill "Add +" right
+-------------------------------+
```

**Card Spec:** White card `bg-white` / dark `bg-surface` (`#1A1A1A`), `rounded-2xl`, `shadow-low`, `overflow-hidden`. Image `rounded-t-2xl`. Badges: `bg-primary/10 text-primary` for bestseller, veg dot `bg-veg`. Price `type-title-medium font-bold`. Add button: `border border-primary text-primary rounded-full px-3 py-1` (outlined pill).

**Grid:** `HorizontalRail` with `w-[200px]` items, `snap-start`, horizontal scroll.

**Implementation:** `src/features/home/components/HorizontalRail.tsx` (reuse) + new `ProductCard` variant or `BestSellerCard` component. `ProductCard.tsx` needs variant prop `variant="bestseller"` or new `BestSellerCard.tsx`.

**Dark mode:** Card `bg-surface` (`#1A1A1A`), image unchanged, text `text-primary`, badges `bg-primary/20 text-primary`.

---

### 3.6.1 Quick Reorder — Same BestSeller Card Style

Reuse same `BestSellerCard` for `QuickReorderRail` items.

---

### 3.7 Franchise + Awards Section (Replace current "Quick Reorder" area if authenticated)

**3.7.1 Awards & Media** (above Franchise)

- 3-column grid of award cards: trophy icon, "Times Food Awards 2024" style, or adapt to Burgonomics awards
- White cards, `rounded-xl`, `p-4`, trophy icon green, text center

**3.7.2 Franchise Banner** (La Pino'z "700+ Outlets" → "16 Outlets & Growing")

- Full-width dark green `#0E4825` `rounded-2xl p-6` with illustration right (store illustration SVG)
- Headline: `Enquire about Burgonomics Franchise` `text-2xl font-bold text-white`
- Subheadline: `16+ Outlets Across Gujarat • Premium Brand` `text-lg text-green-100`
- Pill button: `bg-white text-primary rounded-full px-6 py-3 font-bold` "Enquire Now"
- Illustration: custom Burgonomics store illustration (provide SVG or use placeholder)

**Implementation:** `src/routes/home.tsx` new section after Bestsellers, conditional on auth or always visible.

---

### 3.8 Best Sellers + Other Rails (Quick Reorder, Popular Combos, Recommended, Recently Viewed)

All horizontal rails (`HorizontalRail`) use the **same BestSeller card style** (white/dark cards, image top, badges, price + Add+ pill). Replace current `ProductCard` in rails with `BestSellerCard` variant.

---

### 3.9 Bottom Navigation — 4 Tabs (La Pino'z Style)

**Tabs:** `Home`, `Menu`, `Cart`, `Profile` (Offers merged into Profile)

**Visual:** White pill `fixed bottom-0 inset-x-0 mx-auto max-w-[480px] bg-white/95 backdrop-blur-lg rounded-t-2xl shadow-high py-2`

- Active: `text-primary` + green top indicator `absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full`
- Inactive: `text-text-secondary`
- Icons: La Pino'z style — Home (home), Menu (utensils), Cart (shopping-bag with count badge orange), Profile (user)

**Order:** `Home` | `Menu` | `Cart` | `Profile`

- `Profile` includes Offers link internally (or `/offers` accessible via Profile menu)

**Implementation:** `src/shared/navigation/BottomTabBar.tsx` — update `TABS` array to 4 items, style pill bar, green top indicator on active.

---

### 3.10 Footer / Promo Strip (No mic, no mint strip)

- **Search bar** in header: **NO mic icon** — just magnifier
- **No persistent mint promo strip** at bottom — remove "Lowest Prices Guaranteed" strip
- Keep current promo logic inside Offers/Menu

---

## 4. Component Implementation Mapping

| Section                   | File(s) to Edit                                                                                                          | New Component(s)                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Header                    | `src/routes/home.tsx` (164-206), `src/shared/layouts/AppShell.tsx`, `src/features/stores/components/StoreHeaderCard.tsx` | `LaPinozHeader.tsx` (new)                     |
| Search                    | `src/routes/home.tsx` search section                                                                                     | Update existing                               |
| Banner Hero               | `src/features/home/components/BannerCarousel.tsx`                                                                        | Conditional first slide                       |
| Explore Menu Grid         | `src/features/home/components/CategoryGrid.tsx`                                                                          | Replace rail with grid                        |
| Featured Offers Banner    | `src/routes/home.tsx` (before Featured rail)                                                                             | `FeaturedHeroBanner.tsx` (new)                |
| Offer Rail                | `src/features/home/components/HorizontalRail.tsx` + `OfferCard.tsx`                                                      | Keep                                          |
| BestSellers / All Rails   | `src/features/home/components/HorizontalRail.tsx`, `src/features/home/components/ProductCard.tsx`                        | `BestSellerCard.tsx` (new variant)            |
| Quick Reorder             | `src/features/home/components/QuickReorderRail.tsx`                                                                      | Reuse `BestSellerCard`                        |
| Franchise + Awards        | `src/routes/home.tsx` (new section)                                                                                      | `FranchiseBanner.tsx`, `AwardsGrid.tsx` (new) |
| BestSellers / Other Rails | `src/features/home/components/HorizontalRail.tsx` + `ProductCard.tsx`                                                    | Use `BestSellerCard`                          |
| Bottom Nav                | `src/shared/navigation/BottomTabBar.tsx`                                                                                 | Update `TABS` array + styles                  |
| Search Bar                | `src/routes/home.tsx` header                                                                                             | Remove mic icon                               |
| Promo Strip               | Remove                                                                                                                   | Delete mint strip component if exists         |

---

## 5. Dark Mode Behavior

| Element                            | Light                        | Dark                          |
| ---------------------------------- | ---------------------------- | ----------------------------- |
| Page background                    | `#F5F5F5`                    | `#0A0A0A`                     |
| Cards (Explore, BestSeller, Offer) | `bg-white`                   | `bg-surface` (`#1A1A1A`)      |
| Header                             | `bg-primary` `#0E4825`       | `bg-primary` `#0E4825` (same) |
| Search input                       | `bg-white`                   | `bg-surface` `#1A1A1A`        |
| Text primary                       | `#16281D`                    | `#F3F5F4`                     |
| Text secondary                     | `#586B60`                    | `#A0A0A0`                     |
| Green badges                       | `bg-primary/10 text-primary` | `bg-primary/20 text-primary`  |
| Orange accent                      | `#FF6600`                    | `#CC5200`                     |
| Borders/dividers                   | `#E5EDE7`                    | `#262626`                     |

---

## 6. Assets Needed

| Asset                  | Description                                        |
| ---------------------- | -------------------------------------------------- |
| Store illustration SVG | For Franchise banner (16 outlets illustration)     |
| Burger cutout images   | For Hero banner, FLAT 50% banner (transparent PNG) |
| Category icons         | Circular images for 3-col grid (one per category)  |
| BestSeller images      | High-res food photography per item                 |

---

## 6. Acceptance Criteria (Copy into PR Description)

- [ ] Header: Green rounded-bottom, store location + Change, profile + orange badge, pill search (no mic)
- [ ] Hero banner: Dark green radial, white/yellow text, burger cutout, black code pill — first carousel slide
- [ ] Explore Menu: 3-col grid, white/dark cards, circular images green border, 2-line labels, "View all" on last
- [ ] FLAT 50% banner: Green, burger cutout, black code pill — above Featured rail
- [ ] Featured rail: Current style, minor green hover border
- [ ] BestSellers/All rails: White/dark cards, image top rounded, badges (Bestseller/Veg), price + outlined Add+ pill
- [ ] Franchise banner: Green, 16 outlets, illustration, white "Enquire Now" pill
- [ ] Awards grid: 3-col, trophy icons
- [ ] Bottom nav: 4 tabs (Home/Menu/Cart/Profile), white pill, green top indicator active
- [ ] Search: Pill, magnifier only, no mic
- [ ] Dark mode: All cards `#1A1A1A`, text `#F3F5F4`, green header same
- [ ] `tsc --noEmit` 0 errors, `vitest` 32/32 pass, build succeeds

---

## 7. Out of Scope (Phase 2+)

- Menu screen reskin (product cards, CategoryTabs)
- Cart screen
- Profile/Orders screens
- Store discovery / Choose Store screen
- Admin screens

---

## 8. Implementation Prompt for antigravity

> **Implement La Pino'z-Inspired Home Screen — Visual Spec Above**
>
> **Scope:** `src/routes/home.tsx`, `src/features/home/components/*`, `src/shared/navigation/BottomTabBar.tsx`, `src/styles.css`, `src/shared/layouts/AppShell.tsx`, `src/features/stores/components/StoreHeaderCard.tsx`
>
> **Steps:**
>
> 1. Update `src/styles.css` tokens to exact 60-30-10 values (light + dark) per spec
> 2. Create `LaPinozHeader.tsx` + replace Home header + AppShell top bar
> 3. Update `BannerCarousel.tsx` — first slide green hero, rest current
> 4. Replace `CategoryGrid.tsx` horizontal rail → 3-col grid with circular images
> 5. Add `FeaturedHeroBanner.tsx` (green FLAT 50%) above `HorizontalRail` in Home
> 6. Create `BestSellerCard.tsx` — white/dark card, image top, badges, price + outlined Add+ pill
> 7. Replace `ProductCard` in all `HorizontalRail` instances with `BestSellerCard`
> 8. Create `FranchiseBanner.tsx` + `AwardsGrid.tsx` — insert in Home after BestSellers
> 9. Update `BottomTabBar.tsx` — 4 tabs (Home/Menu/Cart/Profile), green top indicator, white pill
> 10. Update search bar — remove mic icon
> 11. Remove mint promo strip if exists
> 12. Verify dark mode per token table
> 13. Run `npx tsc --noEmit` + `vitest` + `vite build` + `vite build --mode mobile` — all must pass
>
> **Do NOT touch:** Menu, Cart, Profile, Store, Admin screens. Focus: Home only.
>
> **Report:** Per-section PASS/FAIL with screenshots (light/dark 1080x2340), `tsc`/`vitest` output.

---

_End of Spec — Ready for antigravity implementation_
