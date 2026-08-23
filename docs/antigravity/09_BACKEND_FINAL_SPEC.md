# 09 — Backend Final App Spec: Petpooja Truth + Porter + FCM (Grill Authoritative)

**Status:** Authoritative for all backend decisions post-2026-08-23 · Supersedes `implementation_plan.md:15` (DEFERRED) and `02`/`04` strict pricing  
**Executor:** Antigravity · **Owner commitment:** Petpooja creds this week (final app)

## 1. Pricing — Petpooja is Truth

- **Source of truth for item MRP:** `https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1` (menu fetch) — hourly sync caches to `branches/{branchId}/menu/{itemId}` + `products` with `petpoojaItemId`, `lastPetpoojaSync`.
- **Authoritative price at checkout:** `netlify/functions/payments.ts` → `lib/server-price.ts:resolveStorePricingConfig` now does:
  1. Try Petpooja price (if `PETPOOJA_ENABLED=true` and creds present) → MRP × store markup (from `branches/pricingOverrides` if exists)
  2. Fallback to Firestore `branches/{id}.pricing` → `app_settings/pricing` with `PRICING_FALLBACK` flag
  3. Never trust client `pricing` — always recompute `totals` server-side
- **Fallback UI:** Client `src/shared/pricing/pricingEngine.ts` shows banner `Using cached pricing — Petpooja sync pending` when `pricingSnapshot.source !== "petpooja"`.
- **GST/packing/delivery:** 5% GST + ₹5 packing / ₹29 delivery (legacy docs) remain, but Petpooja `item.price` already includes base — document delta in PR. Free delivery >₹499 still applies (server computes).

## 2. Petpooja Bridge — Live for Final App

- Auth: `app_key` / `app_secret` / `access_token` / `rest_id` per branch (`branches/{id}.petpooja.restId`).
- Enable toggle: `PETPOOJA_ENABLED` Netlify env (`false` until creds land). All calls behind:
  ```ts
  if (!process.env.PETPOOJA_ENABLED) return { skipped: true, reason: "PETPOOJA_DISABLED" };
  ```
- Endpoints:
  - Menu: `qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/get_menu` (hourly `functions/sync-petpooja.ts` — reuse existing dormant)
  - Order: `47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/push_order` (called after Firestore `pending` → `confirmed` payment)
  - Status: `.../order_status` polled every 30s from Firestore, pushed to client via `onSnapshot`
- **Write order:** `payments.ts` → verify amount → Firestore `orders/{id}.payment.status="paid"` → async `push_order` to Petpooja with idempotencyKey `orderId`; Petpooja callback updates `orders/{id}.petpoojaOrderId` + `status.kind="sent_to_kitchen"`. Never KOT-duplicate.
- **Outage tolerance:** Firestore status `pending_petpooja_retry` with backoff (1m, 5m, 30m) — operator can still see order even if Petpooja down. This satisfies Grill 6 (Firestore-first).
- **DRY:** Do not create `kitchen_orders` — `orders` is the single collection.

## 3. Porter — Production Delivery

- **Decision:** Porter for production (Grill 11). Not simulation.
- **Scope:** Only `fulfillment.mode == "delivery"` triggers Porter. Takeaway/Dine-in skip.
- **Env:** `PORTER_API_KEY` + `PORTER_CUSTOMER_ID` + `PORTER_CITY` per branch.
- **Flow:** After `payment.status="paid"` + `branchId` resolved → `functions/create-porter-order.ts` (new) → `api.porter.in/v1/orders` with pickup `branch.address` → delivery `customer address` → store `porterOrderId` on `orders/{id}.porter`. Webhook `functions/porter-webhook.ts` (new) verifies HMAC and updates `orders/{id}.deliveryStatus`.
- **Flagging:** `features.porterEnabled` per branch (`branches/{id}.features.porterEnabled`). Initially false everywhere — enables gradual city launch without blocking week 1 CRM/Payments.
- **Cost:** ₹40–80 per bike order — admin `ReconciliationPage` must show `porterCost` vs `deliveryFee` margin.
- **Fallback:** If Porter fails, `orders.deliveryStatus="porter_failed"` and branch owner manually fulfills (manual fallback UI in partner).

## 4. FCM — Firebase Only

- **Decision:** FCM via Firebase only (Grill 12). Not in-app-only.
- **Web:** `VITE_FCM_VAPID_KEY` + service worker `public/firebase-messaging-sw.js`. Request permission on checkout success + profile.
- **Native:** `google-services.json` / `GoogleService-Info.plist` already in `android/` if Capacitor Push installed; else add `capacitor.config.ts` plugins `PushNotifications`.
- **Topics:** Subscribe on login:
  - `order_{orderId}` (per-order)
  - `branch_{branchId}` (branch owner dashboard)
  - `brand` (brand owner)
  - Unsubscribe on logout.
- **Triggers:** `functions/notify.ts` (new) on `orders` write (`status` change → FCM to `order_{id}` + `branch_{id}`) + `marketing/campaigns` publish → `brand` topic.
- **Best-effort:** In-app `notifications/{uid}` collection is source of truth; FCM is push mirror — if FCM down, in-app still shows.
- **Do not** build custom WebSocket server — Firestore `onSnapshot` is the realtime.

## 5. Analytics — Live CRM Queries (2–4s acceptable)

- **Decision:** No rollup jobs for v1. Dashboards query `orders` live; add 4 composite indexes (see `08`).
- **Dashboards needing indexes:** `AdminAnalyticsPage`, `MarketingDashboardPage`, `BranchDashboardPage`, `KpiSection`, `LiveOperationsSection`. All should show skeleton + progressive load, not blocking spinner.
- **Future rollup:** `analytics_daily` collection is reserved name — do not create `analytics/{...}` differently.

## 6. Everything Real — Scope Confirmation

Customer/delivery app: Menu (Petpooja) + Cart + Checkout (Razorpay/COD) + Coupons + Loyalty (global) + Offers + Notifications + Marketing + Order tracking + Profile/Addresses — all must have Firestore backing per Grill 10. Admin partner app: all 44 pages present after `07b`, but System tabs are Firestore-emulated (see `07_ADMIN_PORTAL_EXTRACTION.md`).

## 7. Permanent DON'T WANTs — Enforcement

| DON'T WANT                      | Enforcement                                                                  | File                  |
| ------------------------------- | ---------------------------------------------------------------------------- | --------------------- |
| No second POS / KOT duplication | Grep `kitchen_orders` must be 0; `petpoojaOrderId` field on `orders` only    | `09` checklist        |
| No in-app wallet                | Grep `walletBalance\|walletTxn` must be 0; loyaltyPoints is the only balance | `09` checklist        |
| No Redis infra                  | `package.json` must not add `ioredis\|bull`                                  | `07` System emulation |
| No custom WebSockets            | `package.json` must not add `ws\|socket.io\|ably`                            | FCM rule              |

## 8. Task Order for Antigravity

- **Before creds:** Implement `resolveStorePricingConfig` with Petpooja branch gated by `PETPOOJA_ENABLED` flag; ship Firestore fallback with clear banner + `?dryRun=1` tests. Do not block CRM/Payments on creds.
- **When creds land:** Flip `PETPOOJA_ENABLED=true` + run `sync-petpooja.ts` manual invoke, verify menu price parity (`tests/petpooja-price-parity.test.ts`), then remove banner.
- **Week 2:** Create `functions/create-porter-order.ts` + `porter-webhook.ts` + `functions/notify.ts` + `public/firebase-messaging-sw.js`.

## 9. Acceptance

- [ ] `payments.ts` computes totals server-side with Petpooja MRP when enabled, otherwise Firestore fallback with flag
- [ ] `PETPOOJA_ENABLED=false` path returns `PETPOOJA_DISABLED` with no throw for smoke gate
- [ ] No `kitchen_orders`, no `walletBalance`, no `ioredis`/`bull` in repo
- [ ] Porter flow gated by `branches/{id}.features.porterEnabled` false by default
- [ ] FCM topics documented in `docs/antigravity/FCM_TOPICS.md` (create)
- [ ] `npx tsc --noEmit` + `npm run build` green with all 08/09 specs

## 10. References

- `GRILL_DECISIONS_2026-08-23.md` — all 17 decisions
- `08_CRM_RULES_FINAL_SPEC.md` — CRM + rules matrix
- `07_ADMIN_PORTAL_EXTRACTION.md` — 44-page migration
- Petpooja APIs: Menu `qle1yy2ydc…/V1`, Orders `47pfzh5sf2…/V1`, docs `https://onlineorderingapisv210.docs.apiary.io/`
- Porter: `api.porter.in` ₹40–80 bike, 40 cities · Razorpay: `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`
