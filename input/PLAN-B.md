# PLAN-B — Complete Implementation Plan

Independent synthesis from 6 input reports (`input/REPORT-*.md`, ~90 findings).
Triage: 3 parallel lanes (T1 backend/rules/deploy, T2 app UX/a11y/perf, T3 batches+gates).
Repos: **R0** = root platform repo (this worktree: `functions/`, `firestore.rules`, `firebase.json`, scripts);
**R1** = core customer app (`burgonomics-foundation-core`, sibling checkout — absent here, gitignored);
**R2** = partner console (`burgonomics-partner`, sibling checkout — absent here, gitignored).
**B1–B11 verdict: ALL HOLD, zero regressed** (verified against `UI_SWEEP_STATE.md` iters 1–9). Nothing below re-fixes them.
D1–D8 dismissed harness artifacts are NOT re-litigated (see §5).

## 1. Deduplicated master issue list

Format: `[ID severity] [repo] file:line (reports) — description`. XF-overlaps merged to single IDs.

### Critical

- C1 [R1] `src/routes/cart.tsx:21,24`, `checkout.tsx:46-47,426,614`, `payment.tsx:53,665`, `menu.index.tsx:15,451`, `search.tsx:17,491`, `home.tsx:25`; barrels `src/features/cart/index.ts:6,9,13`, `src/features/checkout/index.ts:1-9` (core-flaws H1) — money-path routes import nonexistent components; menu→cart→checkout→pay broken.
- C2 [R0] `functions/src/index.ts:29`, `modules/payments/razorpay.webhook.ts:38-43,112-120` vs `modules/payments/webhookHandler.ts:42-74`; both `eventId = payload.id || Date.now()` (cross H1) — live Razorpay webhook check-then-act idempotency; hardened copy unwired; retries double-fire KOT + status flips.
- C3 [R0] `functions/src/config/env.ts:9-58,65-77`; bypasses in `razorpay.webhook.ts:20`, `webhookHandler.ts:20`, `porter.service.ts:323`, `petpooja/client.ts:39-41`, `core/middleware.ts:233-236` (cross H2) — fail-open mock on missing env accepts forged payment/porter/petpooja webhooks, mints `order_mock_*` payable orders.
- C4 [R0] `modules/porter/porter.service.ts:318-332,337,344,377-390,471`; `core/middleware.ts:232-271`; `modules/petpooja/client.ts:34-51` (cross H3) — blind `orderRef.set(merge)` forges DELIVERED/RIDER_CANCELLED; forged Petpooja sync overwrites `products` prices.
- C5 [R0] `firestore.rules:27-32,48-55,90-93,280-299,344-371,390-395,402-412` (cross H5) — `isAdmin()` over-broad + stale-claim trust; branch/support roles read all branches' chats + payment ledger.
- C6 [R1] `src/features/cart/state/cartStore.ts:228-259`; `cart.tsx:233`; `CartRepository.validateCart` never checks promo (core-flaws H8) — persisted `burg.cart.promo` tamper yields discount carried into checkout.
- C7 [R0+R1] `modules/auth/guestMigration.ts:156-185,230-248,262-273,343-364,367`; `index.ts:694-715`; client `QuickAuthSheet.tsx:85-91` localStorage flag → `earn(50)` (cross H10 + core-flaws M9 merged) — guessable `guestSessionId` relinks orders/tickets/cart to attacker UID; 50-coin mint per fresh account.
- C8 [R2] `src/pages/DeliveryQueuePage.tsx:66,74,94,97,111-112,124-125,128,132` (partner-flaws H4) — live queue renders `INITIAL_RICH_ORDERS` seed as real dispatch view (invented phones/totals/names, fake Maps `riderTrackingUrl`); stream errors discarded.
- C9 [R2] `src/pages/TicketDetailPage.tsx:101-144` + `useTicket.ts:189-191,219-221` (partner-flaws H2) — refund/ticket mutations swallow errors yet UI shows success; copy claims "Auto-invokes autoRefund Cloud Function" with no call and no `refundAmount` cap.
- C10 [R2] `src/pages/DashboardPage.tsx:113-115` + `BranchSwitcher.tsx:44-62` (partner-flaws H5) — Store Online/Pause toggle is no-op stub toasting false "now LIVE/PAUSED".
- C11 [R2] `src/features/orders/components/ManualOrderCreateModal.tsx:155-158` → `DashboardPage.tsx:58-62` (partner-flaws H6) — counter orders hardcode `paymentStatus:'completed'`, `petpoojaSyncStatus:'synced'`, `kotPrinted:true`; inflates revenue/AOV.

### High

- H1 [R1] `src/features/offers/services/offersService.ts:100-102` vs `:120-140` (core-flaws H9) — `apply` skips `status=="active"` check; inactive/expired coupons grant discount. Companion of C6.
- H2 [R1] `cart.tsx:102-103,246-249,445,449`; `OrderRepository.ts:125,168-180`; `PaymentRepository.ts:116-199` (core-flaws H3) — tip + coins shown in footer never reach order/payment payloads.
- H3 [R1] `src/shared/pricing/pricingEngine.ts:154-156`; `cart.tsx:243,250,352,357,442`; `BillBreakdown.tsx:42` (core-flaws H2) — two "To Pay" totals: ₹349–₹499 shows FREE while footer charges ₹40 delivery.
- H4 [R1] `src/routes/menu.product.$productId.tsx:125-143,226-254`; `pricingEngine.ts:79-106` (core-flaws M2, raised) — client-computed unitPrice (hardcoded combo +₹99/+₹149) trusted into cart before server reprice.
- H5 [R1] `menu.product.$productId.tsx:289-299`; `CartRepository.ts:109`; `cartStore.ts:60-67` (core-flaws H7) — quantity cap bypass on add path (9999× lines corrupt totals/payloads).
- H6 [R1] `src/core/storage/secureStorage.ts:51-74`; `auth.login.tsx:104-106` (core-flaws M8, raised) — auth tokens in plaintext localStorage framed "secure"; XSS exfiltration.
- H7 [R1] `cart/models/index.ts:83-86`; `pricingEngine.ts:10-24` vs `cartService.ts:79-90`, `CartRepository.validateCart`, `PaymentRepository.ts:63-109` (core-flaws M6) — min-order/closed-store codes exist but no preflight enforces them pre-gateway.
- H8 [R1] `loyaltyStore.ts:3-36`; `checkout.tsx:123-124,188,270-272,336-338`; `payment.tsx:225,356` (core-discovery §3 + core-flaws M1) — loyalty localStorage-only, vanishes checkout→payment, no `customers.loyaltyPoints` write.
- H9 [R1] `useCustomerTickets.ts:50-68,71-78,90-121`; `support.tsx:118-129,241`; `CreateTicketForm.tsx:221-229` (core-flaws H4+H5 merged) — tickets localStorage-only with fake SLA/escalation + seeded fake resolved `TKT-84920`. Near-neighbour of B1/B8, different signature — NEW, not regression.
- H10 [R0] `petpooja.scheduler.ts:13`; `menuSyncWebhook.ts:130-167`; `guestMigration.ts:231-234,239-242,262-273,367`; `item86ingSync.ts:142` (cross H6) — unbounded scans + batch overflow (hourly full `branches` scan, >500-SKU single-batch sync).
- H11 [R0] `index.ts:36,66,842` (missing `./modules/petpooja`, `./modules/notifications`, `./modules/auth` barrels); `routeTransfers.ts:5`, `razorpay.service.ts:12` (missing `./razorpayClient`) (cross H7) — dangling barrels break build/cold-start.
- H12 [R1+R0] `vite.config.ts:1-2`, `vite.mobile.config.ts:18-56`, `capacitor.config.ts:12-13`, `netlify.toml:1-4,86-89`; missing `src/server.ts`/`start.ts` (core-discovery §5/R1) — web-vs-mobile build conflation; Netlify + Capacitor share `dist/mobile`.
- H13 [R0] `firestore.rules:249-254,267-272` vs `tickets.service.ts:165-260` via `index.ts:451-479` (cross M3, raised) — ticket owner `allow update` without `affectedKeys` mask; customers flip `status/priority/assignedTo/resolution`.
- H14 [R0] `firestore.rules:125-133` (cross M4, raised) — cancel rule checks `status.code=='CANCELLED'` but `status` is a MAP; object poisoning with `{code:CANCELLED, kind:completed, terminal:true}`.
- H15 [R0] `firestore.rules:344-371,390-395,402-406` vs `index.ts:521-609` (cross M5, raised) — chat/notification/device-token direct-write bypass; inbox/push impersonation + push DoS.
- H16 [R0] `firestore.rules:143,157,173,179,185,191,196,204,209,214,230,398,428` (cross H9) — public-read surface scrapes promos, `razorpayAccountId`/`petpoojaStoreId`.
- H17 [R0+R2] `tickets/notificationDispatcher.ts:38-40,49,53,57,124`; `notifications/templates.ts:199-208` (cross H4) — escalation push interpolates free-text `subject` into body despite own guard; PII on lock screen, read aloud by screen readers.
- H18 [R0+R2] `notifications/templates.ts:66,189`; `fcm.service.ts:43,69-87`; `firestore.rules:90-93` (cross H8) — APNs badge hardcoded `1`, never cleared on inbox-read.
- H19 [R2] `DashboardPage`/`OrdersPage.tsx:120-122`/`TicketsPage.tsx:145-147`/`KDSPage.tsx:142-150`/`useKDSRealtimeStream.ts:187-193` (partner-discovery §6.2 + partner-flaws M5) — "Realtime/Live Stream/WEBSOCKET" badges over one-shot reads + 15s poll behind 30s staleTime.
- H20 [R2] `ChatPage.tsx:46-52` + `useChats.ts:56-79` + `chatService.ts:87-90,118-121` (partner-flaws M1) — chat send clears input pre-await, no try/catch (offline text loss); listener death maps to `callback([])`.
- H21 [R2] `useTicket.ts:147-192,199-228` + `TicketsPage.tsx:42-74` (partner-flaws M2) — escalate/resolve/reply fail silently; failed P0 escalations look done.
- H22 [R2] `OrdersPage.tsx:98-111` + `OrderTableList.tsx:189-203` (partner-flaws M3) — one-tap paid Porter booking, no confirm/fare; global `dispatchingId` drops taps on other orders during rush.
- H23 [R2] `useMenu.ts:198-202` + `useBranchMenu.ts:40-44` + `MenuPage.tsx:86-95` (partner-flaws M7) — POS `pushStock` failure `console.warn`s while UI toasts success; 86'd state diverges from POS.
- H24 [R2] `ManualOrderCreateModal.tsx:79-80,108,123,137` (partner-flaws M8) — empty cart silent-return, blank name masked 'Walk-in', `parseFloat||0` places ₹0/short/negative-tender orders, silent `'branch_surat_01'` fallback.
- H25 [R2] `KDSOrderCard.tsx:55-63,230-236` + `KDSPage.tsx:69,115-121` (partner-flaws M4) — KDS bump never gated on item checklist; `checkedItems` component-local, lost on refresh/second device.
- H26 [R2] `KDSPage.tsx:63,308,346,384` + `useKDSRealtimeStream.ts:152-168,182-185` (partner-flaws M6) — columns render "grill clear" while loading; `lastRefreshAt` set pre-invalidate; `recallLastOrder` unguarded.
- H27 [R2] `DashboardPage.tsx:19,44-45,94-100` (partner-flaws M5) — ignores `ordersError` (dead backend, green "Live"); device-local "today" vs Asia/Kolkata; `refreshAgeSec` measures manual-refresh age, not data age.
- H28 [R2] `src/stores/authStore.ts:151-154,226-243` (partner-flaws H8) — any transient error resolves to `null` → forced sign-out "Session expired" on valid session.
- H29 [R2] `AuthContext.tsx:93-95` + `ProtectedRoute.tsx:34-107` (partner-flaws M12) — session lock never arms (zero callers); if triggered, `unlockSession=fastSwitchPin` with empty roster always fails.
- H30 [R2] `src/pages/admin/AdminRoutes.tsx:57,92-94` (+ dup `src/admin/AdminRoutes.tsx`) (partner-flaws M13) — guard exact-matches `/admin/login`; blank-render on auth race; `admin` in effect deps re-bootstrap loop.
- H31 [R2] `src/utils/orderContract.ts:86-97,167-183` (partner-flaws M11) — unknown order status fail-opens to `'pending'` with fallbacks; corrupt docs surface as fresh KDS/delivery work.
- H32 [R2] `src/hooks/useTickets.ts:56-58,65` (partner-flaws H3) — empty scope falls back to hardcoded Surat/Ahmedabad branches (cross-outlet PII leak); `in`-query silently drops branches 11+.
- H33 [R0+R1+R2] `notifications/templates.ts:34,76,100,105,127-128,133,138`; `webhookHandler.ts:177` (cross M8) — dishonest notification copy: fabricated ETA, veg assumption, false COD "full refund initiated", unverified "No money was charged", all-caps+emoji KOT.
- H34 [R0+R1+R2] `fcmClient.ts:133-144`; `templates.ts:165-193`; `notificationDispatcher.ts:63-83,120-132` (cross M7) — pushes ship `notification+data+android` only; no `apns`/`webpush` → silent SLA on iOS/web.
- H35 [R0+R1+R2] `firebase.json:37-47,64-74`; `index.ts:99-104,130-137`; `tickets.service.ts:111-112` (cross M11) — no CSP despite stored-XSS vectors; `X-Frame-Options: DENY` breaks Razorpay modal/3DS + Capacitor.
- H36 [R0+R1+R2] `core/validation.ts:44,108,119-120`; `core/middleware.ts:171,175,179`; `porter.service.ts:150,538,654`; `tickets.service.ts:171,187,271`; `razorpay.service.ts:166` (cross M14) — jargon + raw ids/gateway text reach users.
- H37 [R2] `src/App.tsx:20,49` vs `ProtectedRoute.tsx:14-123` + `routePolicy.ts:8-31` (partner-flaws H1) — app mounts weak `components/ProtectedRoute`; strong default-deny guard is dead code; role limits not route-enforced.
- H38 [R2 native] `src/App.tsx:40` + `capacitor.config.ts:3-52` + `Info.plist:50-64` + `AndroidManifest.xml:1-41` + `index.html:1-13` (partner-discovery §6.4) — `BrowserRouter` on `file://`, iOS App-Bound-Domains 3-host allowlist, package/scheme mismatch, missing perms/`google-services.json`/KOT chime asset, no `viewport-fit=cover`.

### Medium

- M1 [R1] `AddressForm.tsx:180`; `addressService.ts:17-22` vs `:71-77` (core-flaws H11) — address save fail-open to `"0000000000"`.
- M2 [R1] `validators.ts:19-25`; `QuickAuthSheet.tsx:47-49` (core-flaws M12) — phone validator length-only; enforce `^[6-9]\d{9}$`.
- M3 [R1] `addressService.ts:17-22` vs `:71-77` (core-flaws M13) — update skips line1/city validation.
- M4 [R1] `profile.index.tsx:66-77`; `profileStore.ts:43-55`; `profile.edit.tsx:37-44` (core-flaws M7) — hardcoded "Burger Lover"/`Gold` identity shown as truth.
- M5 [R1] `checkoutStore.ts:28,54`; `OrderRepository.ts:177`; `DineInPanel.tsx:1-85`; `checkout.tsx:89-90,190-233,496-508` (core-flaws M3) — dine-in `tableNumber` never input/validated; unbounded notes.
- M6 [R1] `checkout.tsx:568,577,586` (`?? 0/15/35`) vs `pricingEngine.ts:21`, `cart.tsx:243` (core-flaws M4) — loading bill invents numbers; delivery default ₹35 vs ₹40; needs skeleton + shared constant.
- M7 [R1] `payment.tsx:126-138,169-177,386-402`; `checkout.tsx:147-155` (core-flaws M5+H12) — dead Pay CTA with no recovery on totals failure.
- M8 [R1] `stores.tsx:93-116,167-171,175-213`; `orders.index.tsx:76-88,94-129`; `payment.tsx:169-177`; `checkout.tsx:147-150`; `menu.product.$productId.tsx:59-78` (core-flaws H12) — unhandled-async cluster: transient failure freezes screens, no retry; every loading flag needs try/catch+finally.
- M9 [R1] `GlobalErrorBoundary.tsx:25-27`; `__root.tsx:159-161`; zero `unhandledrejection` listeners (core-flaws H13) — no global async-error sink/telemetry.
- M10 [R1] `OfflineBanner.tsx:19-29` (core-flaws H15) — "Back online → refreshing" refreshes nothing; no `invalidateQueries` on reconnect.
- M11 [R1] `AddressForm.tsx:95-144,220-224` (core-flaws H14+M16) — reverse-geocode `fetch` unchecked, no `response.ok`/timeout/abort/offline guard.
- M12 [R1] `CreateTicketForm.tsx:55-77`; `useCustomerTickets.ts:82-88` (core-flaws M10) — ticket photo as base64 in localStorage; exceeds quota, still reports success.
- M13 [R1+R0] `supportService.ts:60-99` → `support.tsx:271-314` (core-flaws H6) — fabricated contact channels (`+911800123123`, `support@burgonomics.example`); must come from backend config.
- M14 [R0] `firestore.rules:245-248,412-425`; throttle only `index.ts:88-94,128` (cross M6) — franchise/ticket create: no `customerId==uid` bind, no field validation; global 100/15min/IP throttle only.
- M15 [R0] `claimsManager.ts:104-129,188-226`; `index.ts:224,328,651-663` (cross M9) — `setClaims` missing in-function authz; `verifyPayment` on optionalAuth.
- M16 [R0] `core/security.ts:79-90`; `porter.service.ts:570-575` (cross M13) — OTP falls back to Razorpay webhook secret; needs dedicated fail-closed `OTP_HMAC_SECRET`.
- M17 [R0] `index.ts:749-821`; `porter.service.ts:688-708`; `ticketReminder.scheduler.ts:121-142` (cross M1) — poll-then-discard schedulers: 6 timers read 25–100 docs/tick then filter in-memory.
- M18 [R0] `porter.service.ts:699-835`; `razorpay.service.ts:303-320` (cross M2) — serial poll loop overrun; verify busy-poll (4×500ms serial `orderRef.get()`) blocks checkout ~2s.
- M19 [R0] `index.ts:183,733-743`; `import * as admin` ×~25; `firebase.json:13-15` (cross M10) — single-function monolith cold start + predeploy tax on every deploy.
- M20 [R0] `firebase.json:24,52`; SPA rewrite `** → /index.html`, zero `Cache-Control` (cross M12) — dangling publics (`burgonomics-partner/`, `burgonomics-foundation-core/` absent); no immutable/no-cache story; App-Link autoVerify fragile.
- M21 [R0] `notifications/fcmClient.ts:133-144`; `templates.ts:165-193`; `notificationDispatcher.ts:63-83,120-132` — iOS/Web push parity gaps (server half of H34).
- M22 [R1] `useLocationPermission.ts:104-110,116-120`; `stores.tsx:84-91` (core-flaws M14+L6) — cached-coords presence trusted as "granted"; corrupt JSON → `granted` + null coords.
- M23 [R1] `AndroidManifest.xml:28-33`; `mobileBootstrap.ts:59-78`; `assetlinks.json:7-8`; `apple-app-site-association:7,28` (core-discovery §5/R4) — deep-link fragility: unconstrained `burgonomics://`, single SHA256, missing iOS entitlement.
- M24 [R1] `tsconfig.json:2`; `vitest.config.ts:8-17`; `package.json:8,15,22`; `build.gradle`; `version.properties:2`; `Info.plist:35,54-67`; `index.html`; `styles.css:9,110-118` (core-discovery §5/R5) — typecheck/test blind spots, silent native failures (optional `google-services.json`, manual `VERSION_CODE=1`, CSP/font triple-maintenance).
- M25 [R2] `partnerFunctionsApi.ts:44-63` (partner-flaws M9) — raw `fetch`, no timeout/abort/retry/offline check; retry risks double Porter booking (no idempotency key).
- M26 [R2] `OrderDetailPage.tsx:55-76` + quote effect + `OrderTableList.tsx:40-48` (partner-flaws L1) — Porter quote refetches on `[order]` churn; empty-error vs empty-shift identical copy.
- M27 [R2] `OrderTableList.tsx:40-48` + DeliveryQueue filters (partner-flaws L5) — filter-empty views lack "Clear filters" recovery.
- M28 [R2] `RaiseTicketModal.tsx:38-54` (partner-flaws L5) — `alert()` validation, `attachmentUrl` never URL-validated, unconditional `onClose` (double-submit + unhandled rejection).
- M29 [R2] `TicketDetailPage.tsx:89` (partner-flaws L5) — un-awaited `clipboard.writeText` throws unhandled on denied permission.
- M30 [R2] `ProtectedRoute.tsx:63` (partner-flaws L5) — lock overlay leaks name/role pre-unlock; use generic "Terminal locked".
- M31 [R2] `LoginPage.tsx:52-87` + `AdminLoginPage.tsx:19-31` (partner-flaws M14) — no brute-force throttle on any login surface.
- M32 [R2] `authStore.ts:178-180,197` → `LoginPage.tsx:47` + `adminAuthService.ts:37` (partner-flaws M10) — distinct login errors form user-enumeration oracle; single generic message needed.
- M33 [R2] `LoginPage.tsx:224-296` + `AuthContext.tsx:26-37,49-91` (partner-flaws H7, UX half) — "PIN sign-in enabled" promise with `DEFAULT_STAFF_SESSIONS={}` failing every PIN; future roster entry = credential-less client session, server sees anonymous.
- M34 [R2] `authStore.ts:221-225` (partner-flaws L3) — offline bootstrap trusts stale cached claims indefinitely, no TTL/banner.
- M35 [R2] `AdminRoutes.tsx:46,105` + `AdminPortalLayout` vs partner shell (partner-discovery §1) — separate admin `ThemeContext` vs hardcoded-dark shell; theme flash (B10 fixed login only).
- M36 [R2] `src/admin/` + 7 `admin-*` chunks + static mocks (partner-discovery §6.5) — ~5× page weight; mock-data-into-prod-bundle risk; slow POS cold start.
- M37 [R2] `useKDSRealtimeStream.ts:187-193` + dual `getDocs` + `orderContract.ts:220-230` (partner-flaws M5 cost half) — ~100 docs + alias-registry fetch per client per 15s poll; read-cost storm, still stale.
- M38 [R2] `firebase.json:24,52` hosting (cross M12 app half) — zero `Cache-Control` → stale shell + slow repeat loads on mobile.
- M39 [R2] menu images `scripts/process-menu-images.ps1:17,101-103,123-132` (cross L4) — single 800px, no srcset; one MOMOS.JPG across 6 SKUs (visual dishonesty).
- M40 [R2] partner `/login` error boxes lack `role=alert` (UI_SWEEP_STATE iter6 note) — `/login` sibling of fixed B11; screen readers miss auth errors.

### Low (queued buckets + nits)

- L1 [R1] `pricingEngine.ts:144-146` vs `BillBreakdown.tsx:45` (core-flaws L2) — GST fallback pre-discount integer vs post-discount 2dp engine.
- L2 [R1] `checkout.tsx:250-286,388-398` vs `payment.tsx:395-401` (core-flaws L1) — "PAY ₹X SECURELY" for COD.
- L3 [R1] `auth.login.tsx:56` vs `authStore.ts:192,249` (core-flaws L3) — SMS vs WhatsApp OTP default mismatch; single `DEFAULT_DELIVERY_METHOD`.
- L4 [R1] `authStore.ts:287-289`; `env.ts:120` (core-flaws L4) — dev `window.useAuthStore` gated by env string; gate on `import.meta.env.DEV`.
- L5 [R0] 75 unstructured `console.*` incl. hot paths (cross L1) — move to structured `firebase-functions/logger`.
- L6 [R0] `maintenance/orderBackfill.ts` + `bin/backfillOrders.ts`; `porter/client.ts:1-5`; dead `notificationDispatcher` import; `firestore.indexes.json:194-256` unused COLLECTION_GROUPs (cross L2) — prune/move to `scripts/`.
- L7 [R0] `firebase.json:78-92`; `index.ts:99-104,112-137`; `env.ts`; `.firebaserc:3` (cross L3) — emulator port collision, 2MB no per-route cap, AppCheck monitor-only, permissive CORS.
- L8 [R2] `AuthContext.tsx:6` + `tests/login-page.test.tsx:6` + `tests/staff-pin-lockout.test.ts:9` (partner-flaws L2) — import of nonexistent `./pinHelpers`; fails closed, ranked low.
- L9 [queued bucket] sub-44px targets (support RAISE 36px, offers Apply 28px, login Sign-in 42px/tabs 38px, consent X 24px, inline links ~16px) — proven same-class at 390/768px; single bucket, not per-target issues.
- L10 [queued bucket] 100+ app-local hardcoded token hits per app — out of shared-source scope; future app-local token pass.
- L11 [queued bucket] BURG50 badge (Banner model has no badge field) — needs model change; presentational default stands.
- L12 [R2] `index.html` meta — confirm `viewport-fit=cover` + `theme-color` land with H38; single acceptance line.

## 2. Implementation batches (3 parallel sessions each; disjoint files within a batch)

**Parallelism rule:** no file owned by >1 session in the same batch. `firestore.rules` owned by ≤1 session per batch. Cross-batch re-entry allowed (sequential).

### Batch 1 — Unblock build + close forgery seams (R0 only; lands first)

Goal: `tsc` green; staging can no longer mint payable orders / forge webhooks on missing env.
- **S1 — Function wiring + webhook swap.** Owns `functions/src/index.ts`, new `modules/petpooja/index.ts`, `modules/auth/index.ts`, `modules/notifications/index.ts`, `modules/payments/razorpayClient.ts` (restore or drop its two importers), `modules/payments/webhookHandler.ts` (reject missing `payload.id`, freshness window), delete `modules/payments/razorpay.webhook.ts` after reroute. Fixes C2, H11.
- **S2 — Mock fail-closed + secrets.** Owns `functions/src/config/env.ts`, `functions/.env.example`, `core/security.ts` (dedicated `OTP_HMAC_SECRET`; M16), `core/middleware.ts` (remove mock bypass + `body.app_key` fallback; 401 not 500), `modules/petpooja/client.ts`, `porter.service.ts` §§323–390 (HMAC wiring). Fixes C3, C4, M16.
- **S3 — Rules emergency.** Owns `firestore.rules` ONLY (payments/refunds/audits/unmatched → server-only; cancel literal-shape + `kind/terminal` allowlist; chats/messages/notifications/device-tokens lockdown). Fixes C5, H13, H14, H15.
- Gates: R0 `npm --prefix functions run typecheck` + `build` clean, zero dangling barrels; forged-webhook negative tests (missing env → 401, no `order_mock_*`); emulator read/write matrix per changed path.

### Batch 2 — Money-path truth (backend → fronts)

Goal: one price, one tip/coins/loyalty/promo truth cart→gateway; no fabricated order flags.
- **S1 — Backend pricing/payments (R0).** Owns `modules/payments/razorpay.service.ts`, `pricing.engine.ts`, `routeTransfers.ts` (verify busy-poll → 202 + client retry), `porter.service.ts` §§quote/book/rebook/verify (idempotency key, fail-closed rate-card/GPS). Depends on Batch 1 S1/S2.
- **S2 — Core cart/checkout/pay (R1).** Owns `src/routes/cart.tsx`, `checkout.tsx`, `payment.tsx`, `menu.product.$productId.tsx`, `src/features/cart/**`, `checkout/**`, `payments/**`, `offersService.ts`, `pricingEngine.ts`, `BillBreakdown.tsx`, `loyalty/**`. Fixes C1, C6, H1–H8, M6, M7, L1–L3.
- **S3 — Partner ops money (R2).** Owns `useTicket.ts`, `TicketDetailPage.tsx`, `ManualOrderCreateModal.tsx`, `OrdersPage.tsx`, `OrderDetailPage.tsx`, `OrderTableList.tsx`, `partnerFunctionsApi.ts` (timeout/idempotency/offline). Fixes C9, C11, H21(money half), H22, H24, M25, M26.
- Gates: `tsc --noEmit` clean; route-import smoke tests; promo-revalidation + coupon-status tests; webhook idempotency tests; cash + online test orders price-match server repricing.

### Batch 3 — Auth, roles, session integrity

Goal: one enforced role policy; no client-minted sessions, bonus mint, or stale-claim overreach.
- **S1 — Backend authz + rules auth model (R0).** Owns `firestore.rules` (narrow `isAdmin` to brand roles; `customerId==uid` bind; ticket-owner `affectedKeys` allowlist; session self-mint block), `claimsManager.ts` (in-function role assert), `guestMigration.ts` (signed guest-ownership proof; OTP-verified phone; UID-bonus once per device/AppCheck; chunk ≤400), `index.ts` §§auth/FCM (auth on verify/quote; per-route limiters). Fixes C7, M14, M15.
- **S2 — Core auth + identity honesty (R1).** Owns `src/features/auth/**`, `auth.login.tsx`, `auth.otp.tsx`, `QuickAuthSheet.tsx`, `secureStorage.ts`, `profile/**`, `AddressForm.tsx` (phone/`"0000000000"` fail-closed only). Fixes H6, M1–M4, L4.
- **S3 — Partner auth + guards (R2).** Owns `src/App.tsx` (guard mount), `core/auth/*`, `LoginPage.tsx`, `authStore.ts`, `adminAuthService.ts`, `AdminRoutes.tsx`, R2 `secureStorage.ts`, `config/firebase.ts`. Fixes H28–H30, H37, M30–M35, L8. PIN: restore `pinHelpers` with server custom-token exchange **or** delete PIN tab + imports.
- Gates: `tsc` clean; revoked-role + offline-boot matrix; generic-error assertion (no enumeration); emulator matrix for new binds/allowlists.

### Batch 4 — Orders / KDS / delivery / tracking truth

Goal: KDS + tracking + dispatch reflect one backend order truth; no phantom-empty or phantom-rush screens.
- **S1 — Petpooja/Porter bridge (R0).** Owns `petpooja/orderPush.ts`, `menuSyncWebhook.ts` (chunk ≤500), `item86ingSync.ts` (indexed `where+limit(1)`, drop full-scan fallback), `petpooja.scheduler.ts` (paginate), delete legacy `petpooja.service.ts`, `porter.service.ts` §§webhook/poll (event-id dedup, server `orderId` mapping, freshness, concurrent fetch), `porter/client.ts` + `index.ts`. Fixes H10 (bridge half), M17(part), M18.
- **S2 — Core orders/tracking/robustness (R1).** Owns `routes/orders.*`, `stores.tsx`, `features/tracking/*` (implement or delete route + import), `features/orders/**`, `useLocationPermission.ts`, `OfflineBanner.tsx`, `GlobalErrorBoundary.tsx` (+twin), `addressService.ts` (shared update validation), `__root.tsx` (report sink). Fixes H12(R1), M3, M8–M11, M22, H7-gate half.
- **S3 — Partner KDS/queue/dashboard honesty (R2).** Owns `KDSPage.tsx`, `features/kds/**`, `DeliveryQueuePage.tsx`, `DashboardPage.tsx`, `orderContract.ts`, `useOrders.ts`, `useOrder.ts`, `useMenu.ts`, `useBranchMenu.ts`, `MenuPage.tsx`, `ChatPage.tsx`, `useChats.ts`, `chatService.ts`. Fixes C8, C10, H19–H23, H25–H27, H31, H32, M37.
- Gates: `tsc` clean; KDS bump → track → webhook status round-trip test; error-vs-empty-vs-loading screenshot/state matrix per touched screen.

### Batch 5 — Support / tickets / PII / push parity

Goal: tickets are real backend records; notifications PII-free and correct on all platforms.
- **S1 — Tickets + notify backend (R0).** Owns `modules/tickets/*`, `notifications/templates.ts` (conditional veg/refund/ETA/POS-ack copy; plain-case KOT), `fcm.service.ts` + `fcmClient.ts` (badge = unread count + clear-on-read; shared `apns` + `webpush`), `triggers.ts`, `core/validation.ts` + `errors.ts` (user-safe copy map). Fixes H17, H18, H33, H34, H36, M21.
- **S2 — Core support honesty (R1).** Owns `routes/support.tsx`, `features/support/**`. Fixes H9, M12, M13. Wires `POST /v1/support/tickets`; SLA copy gated on backend field; `[]` empty state; delete `INITIAL_MOCK_TICKETS`; backend-sourced channels/FAQs; storage-backed photo evidence.
- **S3 — Partner tickets/branches scope (R2).** Owns `useTickets.ts` (fallback → `[]` + chunked `in`), `TicketsPage.tsx`, `TicketDetailPage.tsx` (non-money halves: toasts + retry + confirm), `ticketContract.ts`, `BranchesPage.tsx` + scope helpers (10-branch cap surfaced). Fixes H21(non-money), H32, M28, M29.
- Gates: `tsc` clean; ticket create → escalate → push test with PII-free body assertion; badge set/clear test; `subject` never in `notification.body` (unit test on templates).

### Batch 6 — Platform hardening, perf, hygiene (last)

Goal: cold starts, cost storms, deep-links, lint/type blind spots fixed on frozen behavior.
- **S1 — Backend perf/hygiene (R0).** Owns `index.ts` §§schedulers/monolith (server-side inequalities + composite indexes; skip empty ticks; jitter; lazy `firebase-admin/*`), `maintenance/orderBackfill.ts`, `bin/backfillOrders.ts` (→ `scripts/`), `tsconfig.json`, `firebase.json` (predeploy scoping; immutable `/assets/*` + no-cache shell; CSP; `SAMEORIGIN` eval; emulator port doc/fix; per-webhook body caps), `firestore.indexes.json` (prune `store.id` drift; add chats/messages/payments/refunds/franchise/coupons + `customerId+status`/`branchId+status` composites), `scripts/`. Fixes M17–M20, H35(server), L5–L7.
- **S2 — Core platform (R1).** Owns `vite.config.ts`, `vite.mobile.config.ts`, `capacitor.config.ts`, `router.tsx`, `mobile-entry.tsx`, `theme/tokens.ts`, `styles.css`, `shared/platform/*`, `public/.well-known/*`, `android/*`, `ios/*`, `index.html`, `tsconfig.json`, `vitest.config.ts`, `package.json`, `scripts/test-rules.mjs`, `SafeImage.tsx`. Fixes H12, M20(app), M23, M24.
- **S3 — Partner platform (R2).** Owns R2 `capacitor.config.ts`, `android/*`, `ios/*`, `index.html`, `vite.config.ts`, `shared/platform/*`, `App.tsx` (router shell only), `tsconfig.json`, oxlint config, `tests/*`, missing-component audit (`OrderStatusBadge/Stepper/FiltersBar/TicketQueueTable/LiveStatsGrid/ActiveOrdersPulse` — restore or delete imports), R2 `scripts/*`. Fixes H38, H35(app), M35, M36, M38–M40, L9–L12.
- Gates: `tsc` clean; cold-start, scheduler-invocation, bundle-size deltas within budget; App-Link/associated-domains verification; no mock data in prod bundle (grep gate).

## 3. Sequencing constraints

1. **Batch 1 → everything.** No money/auth/status work reviewable until `functions` builds and mock-webhook minting is fail-closed. Deploys gated on build from Batch 1 onward.
2. **Backend-before-frontend on every coupled seam:** B2-S1 → S2/S3 (server repricing/verify before cart/pay/Porter UI); B3-S1 → S2/S3 (claims/rules/migration before login/PIN/profile); B4-S1 → S2/S3 (canonical Petpooja/Porter statuses before KDS/track); B5-S1 → S2/S3 (dispatcher/template/badge contract before support/push UI).
3. **Rules ordering:** B1-S3 (server-only money, cancel-shape, chat lockdown) → B3-S1 (role narrowing, binds, allowlists). Never two rules writers in one batch.
4. **Legacy-deletion ordering:** each swap is delete-after-rewire inside ONE session (webhookHandler↔legacy webhook B1; canonical Petpooja↔`petpooja.service.ts` B4; canonical ticket schema B5) — zero importers verified before deletion.
5. **R1/R2 prerequisite:** sibling checkouts (`burgonomics-foundation-core @ 6c59b84`, `burgonomics-partner @ fa06c5c`) mounted before Batches 2–6; R1/R2 sessions never attempt work inside `wt-plan-b` alone.
6. **Batch 6 last.** Perf/CSP/caching/shell/token work lands after behavior freeze so measurements are valid.

## 4. Global rules for implementers

- Scoped commits per repo (R0/R1/R2 separate commits; never mix repos in one commit); `git status --porcelain` must show only owned files.
- Every session, every batch: `tsc --noEmit` clean (no new excludes), `vitest run` on touched modules + new tests per HIGH fix, `vite`/`functions` build green; rules sessions add emulator read/write matrix; full suite must not regress.
- No mock data in prod paths (`INITIAL_MOCK_TICKETS`, `INITIAL_RICH_ORDERS`, sample/offers/stores-as-truth, seed-fallback queues, hardcoded `paymentStatus:'completed'`/`kotPrinted:true` are build-breakers outside explicit `DEV`-gated demo flags).
- No fabricated states: every lock/timer/SLA/ETA/veg/refund/synced/printed/paid string backed by a backend field or removed; BillBreakdown presentational only (single shared threshold/fee/GST); per-method CTA labels (COD ≠ "PAY SECURELY").
- No secrets in code; OTP HMAC never shares the Razorpay webhook secret; bad webhook signatures → 401 (never 500-retry, never `next()` bypass); no tokens/`admin_session_id` in plaintext storage framed "secure".
- Webhook/event handlers require real event IDs (reject `Date.now()` fallbacks) with claim-lease/TTL + freshness window; Firestore batches ≤400–500 with pagination; schedulers filter server-side with composite indexes.
- PII discipline: free-text subject/names/phones/addresses never in notification `body` (generic copy + `data`-only IDs, ~120-char server truncate backstop); user-safe error copy, technical detail in logs only.
- Fail-closed money/auth merges: reviewer blocks on any violation of the above; batch exit order B1→B2→B3→B4→B5→B6 with honesty checks (B2 price-match; B3 revoked-role/offline matrix; B4 KDS→track→webhook round-trip; B5 PII-free push; B6 cold-start/bundle deltas).

## 5. Non-goals (do not re-litigate)

D1 `/menu` "AWAITING SYNC"/networkidle timeouts (no-backend preview artifact, revisit live); D2/D8 consent-banner overlap (fresh-profile harness); D3 hero clipping (cosmetic); D4/D5 already fixed as B9/B8; D6 "prefilled" creds are placeholders; D7 pristine OTP ring is intentional keyboard-a11y (`:focus-visible` `--ring #C2410C`), removal regresses a11y. Quick-Staff-PIN tab intentional fail-closed; social chips honest non-interactive spans; `/payment` guest→login redirect correct guard; stores mock-GPS toast dev fallback.
