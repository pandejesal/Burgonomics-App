# Burgonomics Backend — Week 1 Focus Plan (Antigravity Handoff)

**Owner:** Antigravity (coding) · **Author:** Muse Spark (planning only)  
**Scope:** 7 days · **Stack:** Netlify Functions (`netlify/functions/`), Firestore Rules (`firestore.rules`), Shared Pricing Engine (`src/shared/pricing/pricingEngine.ts`), Firebase Admin SDK  
**Production:** https://burgonomics.netlify.app · **Reference:** `implementation_plan.md`, `docs/audit-report.md` §Domain A/B

> **Instruction for Antigravity:** Do not touch UI (`src/routes`, `src/styles.css`, `src/features/*/components`). Backend + rules + server pricing only. One prompt per commit, verify with `npx tsc --noEmit` + `npm run build` + `npm run lint` before opening PR.

---

## Week Goal (Updated 2026-08-23 per GRILL_DECISIONS_2026-08-23.md)

Stabilize backend for **final app** (not demo). Petpooja is live pricing truth + CRM is Firestore (no Petpooja CRM endpoints).  
Pricing: item MRP from Petpooja API `https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1`; Firestore `stores/{storeId}.pricing` / `app_settings/pricing` remain fallback only — do not throw strict `PRICING_CONFIG_UNAVAILABLE` when Petpooja is OFF, show `PRICING_FALLBACK` banner.  
Week 1 P0 is **CRM + Rules** (branch/brand/customer hierarchy, live analytics queries 2–4s acceptable) → **Payments** (Razorpay+COD+auto-refund) → remainder. Porter + FCM are week 2.

## Already DONE — Do Not Re-work

- `src/features/cart/services/cartService.ts:49` — delegates to `calculateOrderTotals()` with required `pricingConfig`
- `netlify/functions/lib/server-price.ts:60` — `resolveStorePricingConfig(db, storeId)` with 60s cache, fallback chain `stores` → `admin_stores` → `app_settings/pricing`
- `netlify/functions/payments.ts:80` — `timingSafeEqual` HMAC, blocking amount verification, idempotent webhook
- `firestore.rules:21,45,65` — pending-only order create, public-read/admin-write for `stores`/`app_settings`
- `firebase.json` — `functions` block removed; `.env.example` — Netlify envs documented

Read these files before editing. Do not duplicate logic.

## Week 1 Backlog (in order — do not parallelize prompts) — Re-sequenced 2026-08-23 (GRILL: CRM→Payments)

| Day | Prompt file                                                         | Commit subject                                                                            | Audit IDs    | Grill                                                   |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------- |
| 0   | `07_ADMIN_PORTAL_EXTRACTION.md` + `07a`/`07b`                       | `chore(delivery): remove admin portal (→ partner)` / `feat(partner): intake admin portal` | ARCH         | Keep all 44 pages, Firestore-emulated system tabs       |
| 1–2 | `03_FIRESTORE_RULES_VERIFICATION.md` + `08_CRM_RULES_FINAL_SPEC.md` | `fix(security): CRM hierarchy + rules — branch/brand/customer`                            | SEC-2, SEC-4 | **P0 now** — loyalty shared global, sales branch-scoped |
| 2–4 | `01_PAYMENTS_HARDENING.md`                                          | `fix(backend): Razorpay+COD+auto-refund idempotency`                                      | BND-6, BND-9 | Auto any cancel + payment failure                       |
| 4–5 | `02_PRICING_ENGINE_AUDIT.md` → `09_BACKEND_FINAL_SPEC.md §Pricing`  | `fix(backend): Petpooja-truth pricing`                                                    | BND-3, BND-5 | Petpooja MRP truth, not Firestore strict                |
| 5–5 | `04_PETPOOJA_BRIDGE_DEFERRED_PREP.md` → `09 §Petpooja`              | `chore(backend): Petpooja live bridge (enabled when creds land)`                          | BND-4        | Final app — `PETPOOJA_ENABLED` toggle                   |
| 5–6 | `05_WEBHOOK_RECONCILIATION.md`                                      | `fix(backend): payment discrepancy + audit trail`                                         | SEC-7        | paymentAudits for smoke gate                            |
| 6+  | `09_BACKEND_FINAL_SPEC.md §Porter/FCM`                              | `feat(backend): Porter + FCM`                                                             | —            | **Week 2** — deferred                                   |
| 7   | `06_SMOKE_AND_HANDOFF.md` + grill done gate                         | `chore(backend): smoke + role test`                                                       | OPS-2..5     | branch/brand role smoke                                 |

> **New P0:** `07a` then `07b` then `03+08` (CRM) then `01` (Payments) — prior order 01→02→03 is superseded by Grill 14.  
> **Permanent DON'T WANTs:** No second POS (no KOT duplication), No in-app wallet — enforced by `08`/`09`.

## Daily Ceremony

1. Read assigned `PROMPT_*.md` (contains scope, files, acceptance, verification)
2. Implement **only** that prompt
3. Run: `npx tsc --noEmit` (must be 0 errors), `npm run lint`, `npm run build`, `npx vitest run` (if prompt adds tests)
4. Do not commit `.env`, `.swarm/`, `dist`, `*.keystore`

## Open Items Requiring User (out of Antigravity scope)

- Firebase service-account key → Netlify `FIREBASE_SERVICE_ACCOUNT` env + local `GOOGLE_APPLICATION_CREDENTIALS`
- Razorpay test keys + webhook secret → Netlify envs (`RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`)
- **Petpooja creds** (app_key / app_secret / access_token / rest_id) → Netlify `PETPOOJA_*` — blocks live pricing truth, use `?dryRun=1` + Firestore fallback until land
- **Porter API key** (40 cities, ₹40–80) → Netlify `PORTER_API_KEY` — week 2
- **FCM** — Firebase project already has FCM capability; add `VITE_FCM_VAPID_KEY` for web + `google-services.json` for Capacitor
- Release keystore (Play Store only, not demo)

## Permanent DON'T WANTs (do not build)

- No own KOT/kitchen — Petpooja is the only POS
- No in-app wallet — Razorpay wallets only (no balance ledger duality)

## Hand-off Format

Each prompt completion must append a 6-line summary to `docs/antigravity/HANDOFF_LOG.md`:

```
## PROMPT_0X — verdict: PASS/FAIL
- files_touched:
- key_decisions:
- risks:
- verification: npx tsc --noEmit / npm run build / vitest
```

## References

- `GRILL_DECISIONS_2026-08-23.md` — authoritative grill ledger (this plan defers to it)
- `08_CRM_RULES_FINAL_SPEC.md` — CRM hierarchy + live analytics
- `09_BACKEND_FINAL_SPEC.md` — Petpooja truth + Porter + FCM + DON'T WANTs
- `implementation_plan.md` — Status Matrix + Phases
- `docs/audit-report.md:22-33` — Domain A, `36-45` — Domain B
- `netlify/functions/payments.ts` — authoritative payments
- `src/shared/pricing/pricingEngine.ts` — canonical engine (single source of truth)
