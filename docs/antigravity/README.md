# Antigravity — Backend Week 1

**Start here.** This folder is the only contract between Muse Spark (planner) and Antigravity (coder). No other instructions are needed.

## Read Order (updated 2026-08-23 — GRILL_DECISIONS locked)

1. `GRILL_DECISIONS_2026-08-23.md` — 17 authoritative decisions (supersedes DEFERRED)
2. `00_BACKEND_WEEK_PLAN.md` — re-sequenced backlog (now GRILL 14 order)
3. `07_ADMIN_PORTAL_EXTRACTION.md` → `07a` → `07b` → `08_CRM_RULES_FINAL_SPEC.md` (P0) → `01_PAYMENTS_HARDENING.md` → `02`+`09§Pricing` → `04`+`09§Petpooja` → `05` → `09§Porter/FCM (week 2)` → `06_SMOKE_AND_HANDOFF.md`
4. `09_BACKEND_FINAL_SPEC.md` — single source for Petpooja truth + Porter prod + FCM only
5. Append each result to `HANDOFF_LOG.md` (see `GRILL_2026-08-23` locked entry)

## Constraints

- **Backend only** next 7 days. Do not edit `src/styles.css`, `src/routes/**`, `src/features/**/components`, `android/app/src`.
- One prompt = one commit. Do not batch prompts.
- Every commit must pass `npx tsc --noEmit` + `npm run build` + `npm run lint` before push.
- Petpooja is **LIVE TRUTH for final app** — implement behind `PETPOOJA_ENABLED` toggle (default `false` until creds land); pricing fallback with `PRICING_FALLBACK` banner is allowed per `09 §1–2`.
- Permanent DON'T WANTs: No second POS/KOT, No in-app wallet, No Redis, No custom WebSockets (Firestore + FCM only) — see `GRILL_DECISIONS_2026-08-23.md` 16.

## Quick Links

- `implementation_plan.md` (repo root) — Status Matrix + Phase 2
- `docs/audit-report.md` — Domains A/B findings
- `src/shared/pricing/pricingEngine.ts` — canonical pricing engine
- `netlify/functions/payments.ts` — authoritative payment verification
- `firestore.rules` — security source of truth
