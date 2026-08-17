# Burgonomics — Consumer Scroll Audit

**Date:** 2026-08-16 · **Scope:** consumer routes only (admin excluded) · **Status:** read-only audit — no code changed

Baseline: stores list, address entry, and checkout were already compacted in `0148a4f` (compact store rows + full-screen address + 3-step wizard). This report covers everything else a demo guest touches.

---

## Verdicts at a glance

| #   | Surface                             | Severity | Vertical cost                                          | Action                   |
| --- | ----------------------------------- | -------- | ------------------------------------------------------ | ------------------------ |
| 1   | Home hero block                     | **HIGH** | ~300px of chrome before any content                    | Shrink                   |
| 2   | Home category grid                  | **HIGH** | ~450px (5 rows × 3 cols, 13 cats)                      | Horizontalize            |
| 3   | Offers page                         | **HIGH** | 3–4 screens when many offers (9 stacked type-sections) | Filter chips             |
| 4   | Menu default view                   | **MED**  | List rows ≈ 2× taller than grid                        | Default to grid          |
| 5   | Cart                                | LOW      | Acceptable (sticky total bar)                          | Verify CartItemRow notes |
| 6   | Product detail                      | OK       | Sticky Add-to-cart bar already pinned                  | —                        |
| 7   | Menu screen                         | OK       | Sticky category tabs + infinite scroll already         | —                        |
| 8   | Search                              | OK       | Sticky form + chip results                             | —                        |
| 9   | Orders list                         | OK       | Bucket tabs + paginated cards                          | —                        |
| 10  | Profile                             | OK       | Compact menu lists                                     | —                        |
| 11  | Login / OTP                         | OK       | Single-screen `100dvh` layout, no scroll               | —                        |
| 12  | Order detail / confirmation / track | OK       | Standard info layout (not deep-audited, low risk)      | —                        |
| 13  | Terms / Privacy / About / Support   | OK       | Long documents by nature                               | —                        |

---

## HIGH findings

### 1. Home hero — ~45% of the first screen is chrome before any content

`src/routes/home.tsx:168-218` + `src/features/home/components/StoreHeaderCard.tsx:34-78`

The green hero stacks: StoreHeaderCard (icon + 4 text rows ≈ 110px), fulfillment chip + ETA row (~36px), `headlineLarge` greeting (~56px), subtitle (~20px), search pill `h-12` (48px), `pb-8` bottom padding (32px). Total ≈ **290–320px of a ~667px screen**.

**Recommended fixes (all tiny, in `home.tsx`/`StoreHeaderCard`):**

- Drop the greeting `headlineLarge` — the top bar already shows "BURGONOMICS" (home.tsx:200-202).
- Inline the ETA into the fulfillment chip row (one line instead of two).
- `pb-8` → `pb-6`; search pill `h-12` → `h-11`.
- Net saving ≈ 120–150px ≈ a fifth of a screen, before touching anything else.

### 2. Home category grid — 13 categories × 3 columns = ~5 rows ≈ 450px

`src/features/home/components/CategoryGrid.tsx:26` (rendered at `home.tsx:273`)

`grid-cols-3` with `h-14 w-14` circles + 2-line labels ≈ 90px per row. With the seeded 13 categories this is the single tallest content block on the app's landing screen.

**Recommended fixes (pick one):**

- **A (best):** convert to a horizontal scroll-snap carousel of circles (like Zomato/Swiggy category chips) — zero vertical cost, one finger swipe. `CategoryGrid.tsx` is a self-contained component; the change is contained.
- B: `grid-cols-4` with `h-12 w-12` circles and `gap-2` — cuts it to 4 rows and narrows each.
- C: chip wrap (text-only pills, 2 rows max).

Combined with finding 1, home goes from ~2.2 screens of vertical chrome to ~1.2 screens.

### 3. Offers page — up to 9 stacked type-sections

`src/routes/offers.tsx:60-101` (SECTION_ORDER) + `:304-323` (render)

Every offer type that has items gets its own titled vertical section (`Combo offers`, `Delivery offers`, `Takeaway offers`, `Dine-in offers`, `Store-specific`, `First-order rewards`, `Festival specials`, `Limited time`, `Other`). With 10–20 live offers the page runs 3–4 screens, and a user hunting for one type must scroll past every other section. Applied-offer banner + coupon entry also occupy the top.

**Recommended fix:** sticky horizontal filter chips (All / Combo / Delivery / Takeaway / Dine-in / Store / First-order / Festival / Limited) that filter a single list (the `sections` memo at `offers.tsx:194-206` already does the grouping — reuse it behind one active filter). Coupon entry stays at top; make it collapse when empty.

---

## MEDIUM finding

### 4. Menu defaults to tall list rows

`src/features/menu/state/menuStore.ts:46` (`viewMode: "list"` default)

List rows use an `h-24` image + full description block ≈ 110px per item (`MenuProductCard.tsx:137-139`, row layout). Grid mode is `aspect-square` images, 2 per row ≈ 120px per item (`:139`). For a ~40-item menu: list ≈ **4400px** of scroll vs grid ≈ **2400px** — nearly half the scrolling for the same content. The toggle exists and is sticky (`menu.index.tsx:191-216`), so the user can switch back.

**Recommended fix:** default `viewMode` to `"grid"` (one-line change). Consider persisting the user's last choice.

---

## LOW / verified-fine notes

- **Cart (`cart.tsx`):** sticky grand-total bar pinned above the tab bar (`:158-174`), compact store/fulfillment cards, OrderSummary is a single ~150px card. The "act without scrolling" property is satisfied. Only residual: `CartItemRow` renders an expandable per-item notes editor — confirm it collapses to one line by default during the fix pass.
- **Product detail (`menu.product.$productId.tsx:200-221`):** Add-to-cart bar is already `fixed` with live total — customizing a 30-option burger never requires scrolling to act.
- **Menu (`menu.index.tsx:181-218`):** category tabs are sticky under the top bar; infinite scroll sentinel at `:74-88`; grid/list toggle present.
- **Search (`search.tsx:112-181`):** sticky form + kind chips; idle state is compact chips; results reuse `MenuProductCard` with highlight.
- **Orders (`orders.index.tsx`):** bucket tabs + search/sort + paginated cards ("Load more") — list is content-driven.
- **Profile (`profile.index.tsx`):** three compact `ProfileMenuList`s; no oversized blocks.
- **Login/OTP (`auth.login.tsx:95`):** `min-h-[100dvh]` justify-between — logo top, button pinned bottom; keyboard-aware, no scroll.
- **Static pages** (terms/privacy/about/support): documents; scrolling expected. No action.

---

## Cleanup footnote (not scroll)

`src/routes/payment.tsx` is registered as `/payment` in `routeTree.gen.ts:17` but **no in-app link targets it** (grep for `to="/payment"` matches only itself). Dead legacy surface — candidate for route removal in a future cleanup pass.

---

## Suggested execution order (when approved)

1. Home hero compaction (finding 1) + category carousel/chips (finding 2) — one commit, biggest win.
2. Offers filter chips (finding 3) — one commit.
3. Menu default grid + persist choice (finding 4) — one-liner.
4. Verify `CartItemRow` notes collapse during the same pass.

Each is a small, single-surface change; no shared-state or data-model impact.
