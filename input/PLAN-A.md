# PLAN-A — Complete Implementation Plan (synthesis of 6 input reports)

Model: opencode/muse-spark-1.3-contributor-free (planner + all 3 triage subagents). Worktree root only, relative paths. READ-ONLY synthesis — no fixes applied.
Sources: input/REPORT-core-discovery.md, input/REPORT-core-flaws.md, input/REPORT-partner-discovery.md, input/REPORT-partner-flaws.md, input/REPORT-root-discovery.md, input/REPORT-cross-flaws.md (~90 findings).
Method: 3 parallel lanes — L1 money/auth/security, L2 UX/robustness/platform, L3 batches+gates — synthesized below.
B1–B11 (UI_SWEEP_STATE.md) DROPPED as banned (no regression in the 6 reports): B1 support crash, B2 admin-login stall, B3 splash, B4 fake telemetry, B5 bell dot, B6 chip loss, B7 fake lock, B8 support headings, B9 competitor BOGO, B10 admin hex, B11 admin labels.

Repo tags: `core` = burgonomics-foundation-core · `partner` = burgonomics-partner · `functions/root` = functions/ + firestore.rules + firestore.indexes.json + firebase.json + scripts/.

## 1. Deduplicated master issue list

### HIGH — money / auth / security (fail-closed)

- H-M1 Razorpay webhook split-brain + weak idempotency → double-charge/double-KOT. `functions/src/index.ts:29`, `functions/src/modules/payments/razorpay.webhook.ts:35-43,112-120` vs unwired hardened `functions/src/modules/payments/webhookHandler.ts:42-74`; `eventId = payload.id || evt_Date.now()` collides. Fix: route to webhookHandler, delete legacy, reject missing payload.id + freshness window. (functions)
- H-M2 Fail-open mock env = forged webhooks, phantom orders. `functions/src/config/env.ts:9-58,65-77` mock literals + auto-mock; skips `razorpay.webhook.ts:20`, `webhookHandler.ts:20`, `porter.service.ts:323`, `petpooja/client.ts:39-41`, `core/middleware.ts:233-236`. Fix: fail-closed, explicit MOCK_*=true only, remove mock literals. (functions)
- H-M3 Forgeable Porter/Petpooja order-state. `functions/src/modules/porter/porter.service.ts:318-332,342-385,471` (upe_Date.now collide, request_id→orderId trust, blind merge flip to DELIVERED, bad-sig→500) + `functions/src/core/middleware.ts:232-271` (appKey+token+secret accepted, body.app_key fallback). Fix: wire `petpooja/client.ts:34-51` HMAC, single inbound secret, idempotency keys, 401 + freshness. (functions)
- H-M4 isAdmin() over-broad + stale-claim trust. `firestore.rules:27-32,48-55` (branch_staff/support read payments/payment_audits/refunds/unmatched/chats/all notifications). Fix: narrow isAdmin to brand roles, separate isStaff, branch-scoped reads. (root)
- H-M5 Public-read scraping + gateway/POS id leak. `firestore.rules:143,157,173,179-196,204-214,398,428` (branches/products/menus/stores/coupons/app_settings). Fix: split public vs admin fields, auth-gate coupons, move razorpayAccountId/petpoojaStoreId to branches/{id}/secrets. (root)
- H-M6 Ticket "Refund processed" with no money movement. `partner: src/hooks/useTicket.ts:189-191,219-221` swallow → `src/pages/TicketDetailPage.tsx:101-144` unconditional success + autoRefund claim with no call/cap. Fix: rethrow, gate UI on real receipt, disable on isPending. (partner)
- H-M7 Counter orders hardcoded paid+synced+printed + weak tender. `partner: src/features/orders/components/ManualOrderCreateModal.tsx:79-80,108,123,137,155-158` → `DashboardPage.tsx:58-62` revenue. Fix: default pending/unsynced/unprinted until receipts; min/max + tender + outlet validation. (partner)
- H-M8 Porter double-book / accidental paid booking. `partner: src/pages/OrdersPage.tsx:98-111`, `OrderTableList.tsx:189-203`, `src/services/partnerFunctionsApi.ts:44-63` (global single-flight drops taps, one-tap paid book, no timeout/idempotency). Fix: per-order pending + fare confirm, timeout + idempotency key, offline-aware errors. (partner)
- H-M9 Weak guard mounted, strong guard dead. `partner: src/App.tsx:20,49` mounts components/ProtectedRoute not `core/auth/ProtectedRoute.tsx:14-123`; only /branches,/analytics,/users carry allowedRoles. Fix: route App through strong guard or merge policy+lock. (partner)
- H-M10 PIN fast-switch fabricates session + ghost module. `partner: src/core/auth/AuthContext.tsx:26-37,49-99`, `LoginPage.tsx:224-296`, missing `./pinHelpers` (AuthContext.tsx:6). Roster empty = fail-closed today; any roster entry = client-side auth. Fix: server-verified custom token or remove/disable PIN tab; restore-or-delete pinHelpers. (partner)
- H-M11 Plaintext secureStorage (tokens + admin_session_id). `core: src/core/storage/secureStorage.ts:51-74`; `partner: src/core/storage/secureStorage.ts:1-34`, `src/admin/services/adminAuthService.ts:57-68,86-101` (no TTL, ip "Unknown"). Fix: untrusted-cache doc, short TTL, Keychain/Keystore, expiry+cleanup. (partner+core)
- H-M12 Persisted promo tamper = discount. `core: src/features/cart/state/cartStore.ts:228-259`, `src/routes/cart.tsx:233`. Fix: scrub promo on rehydrate, re-run offerRepository.apply in validate/totals. (core)
- H-M13 offersService.apply skips active check. `core: src/features/offers/services/offersService.ts:100-102` vs `:120-140`. Fix: shared eligibility gate + server re-check. (core)
- H-M14 Dual "To Pay" totals (₹349 vs ₹499 free-delivery). `core: src/shared/pricing/pricingEngine.ts:154-156`, `src/routes/cart.tsx:243,250,352,357`, `BillBreakdown.tsx:42`. Fix: presentational breakdown, single threshold constant. (core)
- H-M15 Tip + coins shown but lost. `core: src/routes/cart.tsx:102-103,246-249,445,449` vs `OrderRepository.ts:125,168-180`, `PaymentRepository.ts:116-199`. Fix: persist in store + include in order/payment or remove UI. (core)
- H-M16 Guest-migration Sybil + 50-coin mint. `functions/src/modules/auth/guestMigration.ts:156-185,230-273,343-364`, `index.ts:694-715` + `core: QuickAuthSheet.tsx:85-91` flag→earn(50). Fix: signed guest-ownership proof, OTP-verified phone, server-side idempotent bonus. (functions+core)
- H-M17 Customer ticket update = escalation (rules bypass service). `firestore.rules:249-254,267-272` owner update no mask vs staff-only `tickets.service.ts:165-260`. Fix: hasOnly allowlist or block client update. (root)
- H-M18 Order-cancel object poisoning. `firestore.rules:125-133` status MAP unchecked. Fix: literal-shape + kind/terminal allowlist. (root)
- H-M19 Chat/notification/device-token impersonation. `firestore.rules:344-371,390-395,402-406` vs `index.ts:521-609`. Fix: server-only writes (allow write: if false), force via functions. (root)
- H-M20 setClaims missing in-function authz; verifyPayment on optionalAuth. `functions/src/modules/auth/claimsManager.ts:104-129`, `index.ts:224,328,651-663`. Fix: assert caller role inside setter; require auth + limiters. (functions)
- H-M21 useTickets fail-open leaks cross-branch PII. `partner: src/hooks/useTickets.ts:56-58,65` fallback branches (vs useOrders.ts:49 correct []). Fix: return [] + empty state; chunk/paginate `in`. (partner)
- H-M22 No brute-force throttle on logins. `partner: LoginPage.tsx:52-87`, `AdminLoginPage.tsx:19-31`. Fix: client backoff + server attempt lockout + admin rate-limit. (partner)
- H-M23 Ticket escalation push leaks subject PII. `functions/src/modules/tickets/notificationDispatcher.ts:38-57,124`, `notifications/templates.ts:199-208`. Fix: generic body, subject/id in data only, ~120ch truncate. (functions)
- H-M24 OTP shared-secret blast radius. `functions/src/core/security.ts:79-90`, `porter.service.ts:570-575`. Fix: dedicated OTP_HMAC_SECRET, fail-closed. (functions)

### HIGH — UX / robustness / platform (dead screens, fake data, build)

- H-R1 Money path dead: routes import missing components. `core: src/routes/cart.tsx:21,24`, `checkout.tsx:46-47,426,614`, `payment.tsx:53,665`, `menu.index.tsx:15,451`, `search.tsx:17,491`, `home.tsx:25` vs `features/cart|checkout` barrels. Fix: restore components or repoint imports + route smoke test. (core)
- H-R2 Tracking route imports stub. `core: src/features/tracking/index.ts:1-2` via `orders.$orderId.track.tsx:19-24,46-47`. Fix: implement module or remove route. (core)
- H-R3 Build broken: dangling barrels + missing razorpayClient. `functions/src/index.ts:36,66,842`, `modules/payments/razorpay.service.ts:12`, `routeTransfers.ts:5`. Fix: add barrels, restore razorpayClient or drop imports; gate deploy on build. (functions)
- H-R4 Support tickets localStorage-only + fake SLA. `core: useCustomerTickets.ts:90-121`, `support.tsx:118-129`, `CreateTicketForm.tsx:221-229`. Fix: POST /v1/support/tickets; gate SLA copy on backend field. (core)
- H-R5 Seeded fake resolved ticket + credit. `core: useCustomerTickets.ts:50-68,73-77` (TKT-84920). Fix: start [], demo seeds behind flag. (core)
- H-R6 Fabricated contact channels. `core: supportService.ts:60-99` via `support.tsx:271-314`. Fix: backend-config channels; hide unverified. (core)
- H-R7 Mock FAQs as prod claims. `core: supportService.ts:22-58`. Fix: CMS/backend FAQs. (core)
- H-R8 Unhandled-async cluster (stuck spinners/skeletons). `core: stores.tsx:167-213`, `orders.index.tsx:76-129`, `payment.tsx:169-177`, `checkout.tsx:147-150`, `menu.product.$productId.tsx:59-78`. Fix: try/catch+finally + FailureState/toast retry. (core)
- H-R9 No global error sink. `core: GlobalErrorBoundary.tsx:25-27`, `__root.tsx:159-161`, zero unhandledrejection listeners. Fix: global handlers → reportAppError with route context. (core)
- H-R10 Offline banner refreshes nothing. `core: OfflineBanner.tsx:19-29`. Fix: invalidateQueries + store reload on online. (core)
- H-R11 Support cache non-array bricks list. `core: useCustomerTickets.ts:71-78`. Fix: Array.isArray+shape validate, clear bad key. (core)
- H-R12 Reverse-geocode unchecked. `core: AddressForm.tsx:95-131`. Fix: response.ok + abort-timeout + offline early-return. (core)
- H-R13 Delivery queue fabricates data + drops errors. `partner: DeliveryQueuePage.tsx:66,74,94-132` (INITIAL_RICH_ORDERS + invented phone/totals/Maps URL). Fix: loading/error/empty + Retry; seeds DEV-only. (partner)
- H-R14 Store Online/Pause toggle no-op + success toast. `partner: DashboardPage.tsx:113-115`, `BranchSwitcher.tsx:44-62`. Fix: wire isAcceptingOrders + re-read or disable. (partner)
- H-R15 Native shell fragility. `partner: capacitor.config.ts:3-52`, `App.tsx:40` BrowserRouter on file://, Android package/scheme mismatch, missing POST_NOTIFICATIONS/location perms, google-services.json, /sounds/new_order.wav, no viewport-fit. Fix: native router, align schemes/entitlements, perms+sound+viewport. (partner)
- H-R16 Web-vs-mobile build conflation. `core: vite.config.ts:1-2`, `vite.mobile.config.ts:18-56`, `netlify.toml:1-4`; SSR files absent. Fix: split web/mobile outputs; drop stale comments. (core)
- H-R17 Hosting publics dangling. `firebase.json:24,52` (foundation-core/dist/mobile, partner/dist absent here). Fix: CI publics-exist check. (root)
- H-R18 APNs badge hardcoded 1 never cleared. `functions: templates.ts:66,189`, `fcm.service.ts:43,69-87` + `rules:90-93`. Fix: badge = unread-count at send; clear on read. (functions)
- H-R19 Fail-open rate-card/GPS fallback. `functions: porter.service.ts:50-55,97-115`. Fix: fail-closed quote/dispatch. (functions)
- H-R20 Firestore public-read + coupons/offers/branches exposure (dup of H-M5 platform half); device_tokens any-auth overwrite, franchise unbound create, sessions self-mintable. `firestore.rules:142-230,377-430`. Fix with H-M4/H-M5 batch. (root)

### MEDIUM (merged)

- M1 No min-order/closed-store gate. `core: cart/models:83-86`, `pricingEngine.ts:10-24` never enforced (`cartService.ts:79-90`, validateCart, PaymentRepository:63-109). (core)
- M2 Client-computed unitPrice trusted (combo +₹99/+₹149). `core: menu.product.$productId.tsx:125-143,226-254`, `pricingEngine.ts:79-106`. (core)
- M3 Quantity cap bypass. `core: menu.product.$productId.tsx:289-299`, `CartRepository.ts:109`, `cartStore.ts:60-67` → clamp 1..99. (core)
- M4 Loyalty vanishes checkout→payment. `core: checkout.tsx:123-124,270-272` vs `payment.tsx:225,356`. (core)
- M5 Checkout bill invents numbers + fee mismatch. `core: checkout.tsx:568,577,586` (?? 0/15/35) vs engine 40. (core)
- M6 Pay CTA dead with no recovery. `core: payment.tsx:126-138,386-402`, `checkout.tsx:147-155`. (core)
- M7 Auth validator + address fail-open. `core: validators.ts:19-25` (0000000000 passes), `AddressForm.tsx:180` "0000000000", `addressService.ts:17-77` update skips line1/city; enforce ^[6-9]\d{9}$, same validate() on update. (core)
- M8 Hardcoded profile identity. `core: profile.index.tsx:66-77`, `profileStore.ts:43-55`, `profile.edit.tsx:37-44`. (core)
- M9 "1-Tap Instant Login" vs OTP reality. `core: QuickAuthSheet.tsx:130-132,173-175`. (core)
- M10 Dine-in tableNumber never input/validated + unbounded notes. `core: checkoutStore.ts:28,54`, `OrderRepository.ts:177`, `DineInPanel.tsx:1-85`. (core)
- M11 Ticket photo base64 in localStorage. `core: CreateTicketForm.tsx:55-77` → `useCustomerTickets.ts:82-88`. (core)
- M12 Location "granted" on cached-string presence. `core: useLocationPermission.ts:104-110`, `stores.tsx:84-91`. (core)
- M13 Track failure → "not found", no retry. `core: orders.$orderId.track.tsx:49-90`. (core)
- M14 Map/tiles + auto-locate with no offline guard. `core: AddressForm.tsx:220-224,133-144`. (core)
- M15 Transient error signs user out. `partner: authStore.ts:151-154,226-243`. (partner)
- M16 Stale-claims offline trust indefinite + no banner. `partner: authStore.ts:221-225`. (partner)
- M17 Session lock never arms / couldn't unlock. `partner: AuthContext.tsx:93-95`, `core/auth/ProtectedRoute.tsx:34-107`. (partner)
- M18 Login enumeration oracle. `partner: authStore.ts:178-180 vs :197`, `LoginPage.tsx:47`, `adminAuthService.ts:37`. (partner)
- M19 Order normalizer fail-open to pending. `partner: orderContract.ts:86-97,167-183`. (partner)
- M20 Support role brand-wide + URL bypass. `partner: useRBAC.ts:19`, `branchScope.ts:4-9` (+H-M9). (partner)
- M21 partnerFunctionsApi no timeout/retry/offline. `partner: partnerFunctionsApi.ts:44-63`. (partner)
- M22 Chat send loses text offline; dead listener = empty. `partner: ChatPage.tsx:46-52`, `useChats.ts:56-79`. (partner)
- M23 KDS bump ungated on checklist (ephemeral). `partner: KDSOrderCard.tsx:55-63,230-236`, `KDSPage.tsx:69,115-121`. (partner)
- M24 Stale dashboards: one-shot reads, no error surface, wrong day boundary. `partner: DashboardPage.tsx:19,44-45,94-100`, `useKDSRealtimeStream.ts:187-193`. (partner)
- M25 KDS "grill clear" while loading; refresh-age lies; recall unguarded. `partner: KDSPage.tsx:308,346,384`, `useKDSRealtimeStream.ts:152-185`. (partner)
- M26 Menu 86 / POS divergence silent + double-toast. `partner: useMenu.ts:198-202`, `useBranchMenu.ts:40-44`, `MenuPage.tsx:86-95`. (partner)
- M27 Counter validation gaps (beyond H-M7). `partner: ManualOrderCreateModal.tsx:79-137`. (partner)
- M28 Admin guard exact-match + blank render. `partner: AdminRoutes.tsx:51-103` (pathname === "/admin/login", if (!admin) return null, dep loop). (partner)
- M29 Admin Developer default-role fallback. `partner: adminAuthService.ts:48`. (partner)
- M30 Unbounded scans + batch overflow. `functions: petpooja.scheduler.ts:13`, `menuSyncWebhook.ts:130-167`, `guestMigration.ts:231-273,367`, `item86ingSync.ts:142`. (functions)
- M31 Poll-then-discard schedulers cost storm. `functions: index.ts:749-821`, `porter.service.ts:688-708`, `ticketReminder.scheduler.ts:121-142`. (functions)
- M32 Serial poll overrun + verify busy-poll. `functions: porter.service.ts:699-835`, `razorpay.service.ts:303-320`. (functions)
- M33 Franchise/support-ticket spam + victim-id stamping. `firestore.rules:412-425,245-248`, `index.ts:88-94,128`. (root)
- M34 iOS/Web push parity gaps. `functions: fcmClient.ts:133-144`, `templates.ts:165-193`, `notificationDispatcher.ts:63-132`. (functions)
- M35 Notification copy dishonesty (veg/refund/ETA/POS-ack/caps-emoji). `functions: templates.ts:34,76,100-138`, `webhookHandler.ts:177`. (functions)
- M36 Missing CSP; DENY vs payment/webview. `firebase.json:37-47,64-74`. (root)
- M37 AppCheck monitor-only + CORS credentials+!origin pass + 2mb no per-route cap. `functions: env.ts:43-45`, `index.ts:99-137`. (functions)
- M38 Single-function monolith cold start + predeploy tax. `functions: index.ts:733-743`, `firebase.json:13-15`. (functions)
- M39 Hosting: zero Cache-Control. `firebase.json:24,52`. (root)
- M40 Deep-link/App-Link fragility. `core: AndroidManifest.xml:28-33`, `mobileBootstrap.ts:59-78`, `assetlinks.json:8`, iOS entitlement missing. (core)
- M41 Token system without enforcement + palette drift. `core: tokens.ts:1-38`, `styles.css:9,128,134,176,181,206`. (core)
- M42 Typecheck/test blind spots. `core: tsconfig.json:2`, `vitest.config.ts:8-17`, `package.json:22`; `partner: tsconfig include ["src"]`, oxlint 2 rules. (core+partner)

### LOW (merged)

- L1 GST fallback differs from engine. `core: pricingEngine.ts:144-146` vs `BillBreakdown.tsx:45`. (core)
- L2 Checkout pay bar says PAY for cash. `core: checkout.tsx:388-398`. (core)
- L3 OTP channel default mismatch. `core: auth.login.tsx:56` vs `authStore.ts:192,249`. (core)
- L4 Dev window.useAuthStore by env string. `core: authStore.ts:287-289`, `env.ts:120`. (core)
- L5 SafeImage no placeholder. `core: SafeImage.tsx:14-36`. (core)
- L6 Raw getItem outside try. `core: stores.tsx:84-91`. (core)
- L7 AuthContext ghost pinHelpers import. `partner: AuthContext.tsx:6`, `tests/login-page.test.tsx:6`. (partner)
- L8 Porter quote refetch churn; empty vs failed identical. `partner: OrderDetailPage.tsx:55-76`, `OrderTableList.tsx:40-48`. (partner)
- L9 Validation nits (alert(), attachmentUrl, clipboard, Clear filters, lock identity leak). `partner: RaiseTicketModal.tsx:38-54`, `TicketDetailPage.tsx:89`, `OrderTableList.tsx:40-48`, `core/auth/ProtectedRoute.tsx:63`. (partner)
- L10 Console noise 75+ unstructured logs. `functions: petpooja.service.ts:180`, `item86ingSync.ts:63,77`, `triggers.ts:41,129`, `index.ts:757-819`. (functions)
- L11 Orphan/dead code + index drift. `functions: orderBackfill.ts`, `bin/backfillOrders.ts`, `porter/client.ts:1-5`, `indexes.json:194-256`, tickets vs support_tickets. (functions/root)
- L12 Emulator 8080 collision + per-webhook caps. `firebase.json:78-92`, `index.ts:112`. (root)
- L13 Menu-image script single-size + shared photos + absolute paths. `scripts/process-menu-images.ps1:5-141`. (root)
- L14 User-facing error jargon + raw ids. `functions: core/validation.ts:44,108,119-120`, `porter.service.ts:150,538,654`, `razorpay.service.ts:166`. (functions)
- L15 Docs drift (absolute file:/// links, stale secret/netlify/React-18, handoff line-refs). `README.md:65-71`, `CONTEXT.md`, `_config/deployment_strategy.md`, `IMPLEMENTATION_HANDOFF...md`. (root)

## 2. Implementation batches (3 parallel sessions each; no two sessions share files)

### Batch 1 — Unbreak build + fail-closed shell (lands FIRST, unblocks all)

| Session | Owns (exclusive) | Acceptance gates |
|---|---|---|
| 1X backend barrels | `functions/src/index.ts:36,66,842`, `functions/src/modules/payments/razorpayClient.ts` (restore), legacy `razorpay.webhook.ts` vs `webhookHandler.ts:42-74`, new `modules/petpooja/index.ts`, `modules/auth/index.ts`, `modules/notifications/index.ts` | `npm run build` in functions/ clean; touched payments/webhook tests only; deploy gated on build |
| 1Y rules lockdown | `firestore.rules:27-55,106-136,239-273,280-337,344-371,377-430`, `firestore.indexes.json` (prune store.id group, add branch/status composites) | rules test script + touched rules tests; diff proves isAdmin narrowed, server-only writes `allow write: if false` |
| 1Z mock fail-closed | `functions/src/config/env.ts:9-58,65-77`, `functions/src/core/middleware.ts:232-271`, `functions/src/core/security.ts:79-90`, `.env.example` | boot with empty env denies webhooks (401/503), never `order_mock_*`; touched env/middleware tests only |

Fail-closed: missing secret → deny; payload without id → reject; never mock-accept.

### Batch 2 — Money-path backend truth (needs Batch 1)

| Session | Owns | Gates |
|---|---|---|
| 2X payments | `functions/src/modules/payments/razorpay.service.ts:61,211,383,458`, `pricing.engine.ts:90,165-169`, `routeTransfers.ts:23,40,68,136-202` | touched pricing/verify/refund/transfer tests pass; tsc clean |
| 2Y porter+petpooja | `functions/src/modules/porter/porter.service.ts:44-115,145,318-390,497,527,647,683-835`, `modules/petpooja/orderPush.ts:50-80`, `menuSyncWebhook.ts:130-167`, `item86ingSync.ts:39-154`, `petpooja.scheduler.ts:10,42`, `client.ts:14-51` | 400-chunk batches; bad-sig → 401 not 500; fail-closed quote/GPS; touched tests only |
| 2Z tickets/notify/coins | `functions/src/modules/tickets/tickets.service.ts:78-265`, `notificationDispatcher.ts:18,34,111`, `modules/notifications/templates.ts:34-208`, `fcm.service.ts:18,43`, `fcmClient.ts:14,35,122`, `modules/auth/guestMigration.ts:156-273` | subject stripped from body; badge = unread-count; Sybil bonus gated; touched tests only |

Fail-closed: amount-mismatch → payment_discrepancies, no auto-capture; unknown event → park + 401, never blind merge-flip.

### Batch 3 — Core money-path frontend (needs Batches 1–2; backend-before-frontend)

| Session | Owns | Gates |
|---|---|---|
| 3X build-break barrels | `core: src/routes/cart.tsx:21,24`, `checkout.tsx:46-47,426,614`, `payment.tsx:53,665`, `menu.index.tsx:15,451`, `search.tsx:17,491`, `home.tsx:25`, `features/cart/index.ts`, `features/checkout/index.ts:1-9`, `features/tracking/index.ts:1-2` | `npx tsc --noEmit` clean; route-import smoke test; `npm run build` clean |
| 3Y pricing honesty | `core: pricingEngine.ts:10-24,79-106,144-156`, `BillBreakdown.tsx:42,45`, `cart.tsx:243-357,442`, `checkout.tsx:568,577,586`, `menu.product.$productId.tsx:125-254`, `OrderRepository.ts:125,168-180`, `PaymentRepository.ts:116-199` | single threshold constant; tip/coins reach payload or UI removed; touched cart/checkout tests only |
| 3Z promo/loyalty/gates | `core: cartStore.ts:60-67,228-259`, `offersService.ts:100-140`, `cartService.ts:79-90`, `QuickAuthSheet.tsx:85-91`, `checkout.tsx:121-124,188` | promo revalidated on rehydrate; 1..99 clamp; loyalty survives checkout→payment; min-order/store-open enforced; touched tests only |

Fail-closed: totals unresolved → skeleton + disabled Pay with retry, never `?? 0/15/35` invented bill; server reprice is truth.

### Batch 4 — Auth + trust hardening (needs Batch 1; parallelizable across repos)

| Session | Owns | Gates |
|---|---|---|
| 4X functions-auth | `functions/src/modules/auth/claimsManager.ts:104-226`, `index.ts:224,328,651-715` (optionalAuth→required on verify/quote, in-function role assert) | touched auth tests; negative test: non-role caller denied even if route miswired |
| 4Y core-auth/trust | `core: validators.ts:19-25`, `authStore.ts:140-287`, `AddressForm.tsx:95-224`, `addressService.ts:17-77`, `secureStorage.ts:51-74`, `auth.login.tsx:56`, `profile.index.tsx:66-77` | ^[6-9]\d{9}$ enforced; 0000000000 blocked create+update; single OTP default; touched auth/address tests only |
| 4Z partner-auth/guards | `partner: stores/authStore.ts:33-248`, `core/auth/AuthContext.tsx:26-99`, `core/auth/ProtectedRoute.tsx` + `components/ProtectedRoute.tsx`, `routePolicy.ts:8-31`, `App.tsx:20,49`, `admin/services/adminAuthService.ts:25-101`, `LoginPage.tsx:30-87` | strong guard mounted; PIN server-exchanged or tab removed; transient ≠ sign-out; generic login errors; offline grace + banner; tsc + touched tests |

Fail-closed: unknown role / empty scope / PIN without server credential → deny + sign-out, never minted session.

### Batch 5 — Partner ops integrity (needs Batches 1, 2, 4)

| Session | Owns | Gates |
|---|---|---|
| 5X tickets | `partner: hooks/useTickets.ts:56-140`, `hooks/useTicket.ts:133-228`, `pages/TicketDetailPage.tsx:30-593`, `pages/TicketsPage.tsx:24-269` | mutations reject (no swallow); empty scope → []; refund gated on real receipt + isPending disable |
| 5Y delivery/KDS/counter | `partner: DeliveryQueuePage.tsx:58-493`, `kds/hooks/useKDSRealtimeStream.ts:46-193`, `KDSOrderCard.tsx:51-244`, `KDSPage.tsx:37-408`, `ManualOrderCreateModal.tsx:79-158`, `hooks/useMenu.ts:198-202`, `MenuPage.tsx:86-95`, `OrdersPage.tsx:98-111` | no INITIAL_RICH_ORDERS outside DEV; counter pending/unsynced/unprinted; store toggle wired or disabled; per-order Porter pending + confirm; tsc + touched tests |
| 5Z robustness | `partner: ChatPage.tsx:46-52`, `hooks/useChats.ts:56-79`, `services/partnerFunctionsApi.ts:44-63`, `DashboardPage.tsx:37-116`, `utils/orderContract.ts:86-183`, `pages/admin/AdminRoutes.tsx:51-103` | timeout + idempotency on book/rebook; unknown → quarantine bucket; honest freshness labels; touched tests only |

Fail-closed: server refund/claim APIs (Batch 2) must exist before any partner "Refund processed / resolved" UI claims success.

### Batch 6 — Robustness + honesty polish (needs Batches 3–5; LAST)

| Session | Owns | Gates |
|---|---|---|
| 6X core-async | `core: routes/stores.tsx:84-213`, `orders.index.tsx:76-129`, `payment.tsx:169-177`, `checkout.tsx:147-150`, `GlobalErrorBoundary.tsx:25-27`, `OfflineBanner.tsx:19-29`, `useCustomerTickets.ts:71-88`, `menu.product.$productId.tsx:59-78`, `orders.$orderId.track.tsx:49-90`, `useLocationPermission.ts:104-120` | every loading flag try/catch+finally; unhandledrejection → report; reconnect invalidates queries; touched tests only |
| 6Y core-honesty | `core: supportService.ts:22-99`, `useCustomerTickets.ts:50-121`, `support.tsx:118-314`, `CreateTicketForm.tsx:55-77`, `profile.index.tsx:66-77`, `checkoutStore.ts:28,54`, `checkout.tsx:89-90,388-398` | tickets start []; channels from backend; no base64-in-localStorage; per-method pay labels; table-required dine-in; touched tests only |
| 6Z platform polish | `functions: templates.ts:34-193`, `fcmClient.ts:133-144`, `notificationDispatcher.ts:63-132`, `index.ts:88-137,688-821`, `core/validation.ts`, `core/errors.ts`; `root: firebase.json:37-92`, `indexes.json`, `scripts/process-menu-images.ps1`, docs drift files | CSP + SAMEORIGIN evaluated; immutable /assets/* + no-cache shell; structured logger; user-safe error copy; emu port fixed; no full suite |

## 3. Sequencing constraints

```
Batch 1 (build + rules + mocks)
 ├─→ Batch 2 (payments/porter/petpooja/tickets backend)
 │     ├─→ Batch 3 (core money frontend) ──┐
 ├─→ Batch 4 (auth all repos) ─────────────┤
 │     └─→ Batch 5 (partner ops; needs 2X refund API + 4Z guards)
 └─────────────────────────────────────────→ Batch 6 (robustness/polish; needs 3+5)
```

Hard edges: 1X barrels before any build claim; 1Y rules before 4X/4Z/5X (tests must run against locked policy); 1Z mock lockdown before 2X/2Y webhook work; 2X refund API before 5X success UI; 3X barrels before 3Y/3Z and 6X; 4Z strong-guard before 5X/5Y role assumptions; backend-before-frontend everywhere money/auth-coupled.

## 4. Global rules for implementers

1. Scoped commits per repo (functions / core / partner separate; never cross-repo in one commit); reference anchor (e.g. H-M1, M5) in message.
2. Gates per session: typecheck (`tsc`/`typecheck`) clean + `npm run build` clean + touched-file tests ONLY — NEVER full suite (swarm no-full-suite rule).
3. No mock/seed data in prod paths (INITIAL_RICH_ORDERS, INITIAL_MOCK_TICKETS, mockWebhookLogs, MOCK_FAQS, fake channels, invented phones/totals/ETAs); DEV seeds behind explicit flag only.
4. No secrets in repo; no localStorage for tokens/session IDs; fail-closed on money/auth (deny + retry UI, never warn-only + proceed).
5. Backend-before-frontend where coupled: webhook idempotency + rules lockdown + refund/claim APIs land before any app rewiring that claims success.
6. Read-only recon provenance: every fix cites report file:line; any B1–B11 touch requires new regression evidence with distinct stack signature.
