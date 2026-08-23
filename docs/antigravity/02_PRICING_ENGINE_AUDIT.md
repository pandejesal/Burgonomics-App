# PROMPT 02 — Pricing Engine Audit (Days 2–3)

**Commit:** `fix(backend): strict pricing + priceResolver coverage`  
**Audit:** BND-3, BND-5 · **Risk:** Client vs server total mismatch (₹29 vs ₹40 delivery, ₹5 packing drift)

## Context

Single source of truth is `src/shared/pricing/pricingEngine.ts:49` (`calculateOrderTotals`). Legacy code still calls `calculateTotals()` without `pricingConfig` or uses hardcoded `getCurrentStoreFallbackPricing()`. This prompt enforces strict mode everywhere and backfills missing resolver.

## Files to Touch (only)

- `src/shared/pricing/pricingEngine.ts` — read-only reference (do not change API)
- `src/shared/pricing/priceResolver.ts` — **create** if missing: `resolvePricingConfig(db|firestoreLite) → Promise<PricingConfig>` alias over `netlify/functions/lib/server-price.ts:resolveStorePricingConfig` for client-side fallback (cache 60s, same fallback chain)
- `src/features/cart/services/cartService.ts` — ensure every `calculateTotals` path passes `pricingConfig`
- `src/features/menu/services/itemAvailabilityService.ts` or `src/features/cart/**` where price is computed
- `src/utils/priceResolver.ts` — delete legacy shim if it still exists (consolidate to shared path)
- Tests: `src/shared/pricing/__tests__/pricingEngine.test.ts` — add if missing

## Do Not Touch

- `netlify/functions/payments.ts` (already authoritative), `src/styles.css`, `firestore.rules`

## Tasks

1. Audit every `calculateTotals` / `calculateOrderTotals` call-site (`grep -rn calculateTotals src/`). Any call without `pricingConfig` → wire through `resolvePricingConfig` or fail closed with `PRICING_CONFIG_UNAVAILABLE`.
2. Enforce strict mode: if `stores/{storeId}.pricing` missing and `app_settings/pricing` missing → throw `new Error("PRICING_CONFIG_UNAVAILABLE")`; surface as `ApiResult.error.code = "PRICING_CONFIG_UNAVAILABLE"` to UI (`BND-5` "soft" mode forbidden).
3. Delete `getCurrentStoreFallbackPricing()` hardcodes (5% GST / 40 / free>499 must come only from Firestore doc). Keep constants only inside `pricingEngine.ts` defaults for tests.
4. Add unit tests covering:
   - delivery fee 40 vs free>499 boundary
   - GST 5% correctness
   - strict-mode throw when config absent
   - cart with/without promo

## Acceptance

- [ ] Zero call-sites invoke pricing without `pricingConfig` (`grep` clean)
- [ ] Missing config → `PRICING_CONFIG_UNAVAILABLE` error (not silent fallback to 0 or hardcoded)
- [ ] No file contains `getCurrentStoreFallbackPricing` or inline `deliveryFee: 29`
- [ ] New tests pass: `npx vitest run src/shared/pricing`
- [ ] `npx tsc --noEmit` 0 errors, `npm run build` passes

## Verification

```bash
grep -rn "calculateTotals" src/ --include="*.ts" | grep -v "pricingConfig"  # expect 0
npx vitest run src/shared/pricing
npx tsc --noEmit
npm run build
```
