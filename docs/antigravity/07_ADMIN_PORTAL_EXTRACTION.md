# PROMPT 07 — Admin Portal Extraction: Delivery → Partner

**Owner:** Antigravity (coding) · **Author:** Muse Spark (planning only — no code)  
**Priority:** P0 — supersedes Week 1 backend prompts 01–06; execute 07a then 07b before resuming 01–06  
**Source app (remove):** `burgonomics-foundation-core` (customer/delivery, `com.glassdoorsstudio.burgonomics`)  
**Target app (intake):** `burgonomics-partner` (`C:\Users\DELL\Desktop\Burgonomics\burgonomics-partner`)  
**Week constraint:** Backend-first for next 7 days — this extraction is backend-heavy; no UI polish in delivery app during extraction

> **Rule for Antigravity:** You code, Muse Spark does not. Follow 07a (remove) and 07b (intake) verbatim. One PR per sub-prompt. Verify each with `npx tsc --noEmit` + `npm run build` + `npm run lint` in the respective repo.

## Why

Delivery app must be customer-only (menu/cart/checkout/orders/profile). `src/admin/**` (85 files) + `src/routes/admin*.tsx` (53 routes) couples Admin SDK concerns, `admins/{uid}` privilege, and Petpooja ops into the customer bundle — bloats APK, leaks admin surface, violates two-app contract (customer vs partner).

## Current Admin Surface to Extract

**Source inventory (foundation-core):**

- `src/admin/**` — 8 dirs: `components/` (Badges/Buttons/Cards/CommandPalette/FeedbackStates/Headers/TableSystem/Utilities), `dashboard/` (10 widgets + charts), `hooks/useAdmin.tsx`, `layouts/{AdminLayout,SystemOperationsLayout,PetpoojaOperationsLayout}`, `pages/` (44 pages: AdminDashboardPlaceholder, AdminAnalyticsPage, AdminAutomation/Campaigns/Coupons/Customers/CustomerProfile/CustomerAnalytics/Segments/MarketingDashboard, AdminMenu/Stores, AdminOrders/live/$orderId, AdminPayments/$id/PaymentHealth/Refunds/Reconciliation, AdminNotifications/Automation/Templates/Developer/System, + 10 `system/*Tab.tsx` + `storesData/paymentsData/ordersData/marketingData/customersData.ts`), `services/{adminAuth,adminStores,adminPayments,adminOrders,adminCustomers}Service.ts`, `store/adminAuthStore.ts`, `theme/ThemeContext.tsx`
- `src/routes/admin.tsx` (layout guard) + 52 `src/routes/admin.*.tsx` (see `glob src/routes/admin*` — includes `admin.login`, `admin.index`, `admin.analytics`, `admin.menu`, `admin.orders{,.live,.$orderId}`, `admin.customers*`, `admin.payments*`, `admin.stores*`, `admin.petpooja*`, `admin.system*`, `admin.marketing`, `admin.coupons`, `admin.offers`, `admin.reconciliation`, `admin.notifications`, `admin.developer`)
- Indirect deps: `firestore.rules` admin checks (`isAdmin()` via `admins/{uid}`, `admin_stores`, `app_settings` admin-write), `src/core/config/firebase.ts` Admin SDK usage, `netlify/functions/lib/server-price.ts` fallback to `admin_stores`

**Target intake (partner) current state:**

- `burgonomics-partner/src/{components,config,hooks,pages,stores,types,utils}` — greenfield (no `src/admin` yet), stack React 19 + TanStack Query + Zustand + Firebase 12 + Tailwind 4, appId TBD

## Execution Order

1. **07a_DELIVERY_REMOVE_ADMIN.md** → PR `chore(delivery): remove admin portal (→ partner)` in `burgonomics-foundation-core`
2. **07b_PARTNER_INTAKE_ADMIN.md** → PR `feat(partner): intake admin portal from delivery` in `burgonomics-partner`
3. Resume backend Week 1 prompts `01–06` (payments/pricing/rules) in `foundation-core` — they assume no `src/admin` exists

## Global Constraints

- Do not delete `firestore.rules` admin collections (`admins`, `admin_stores`, `app_settings`, `paymentAudits`) — both apps share the same Firebase project; rules stay, only UI moves
- Do not delete Netlify functions that admin pages call (`payments.ts`, `petpooja-proxy.ts`) — keep them in delivery's backend; partner will call them via HTTPS (same site `burgonomics.netlify.app`)
- Keep Firebase project single — both apps use same `firebaseConfig`; partner gets its own `capacitor.config.ts` appId `com.glassdoorsstudio.burgonomics.partner`
- No Petpooja live enablement this week (`PETPOOJA_ENABLED=false`)

## Verification (both PRs)

```bash
# delivery (foundation-core) after 07a:
npx tsc --noEmit   # 0 errors, no src/admin imports remain
npm run build      # bundle drops ~30% vs before
npm run lint
grep -r "from '@/admin" src/ --include="*.ts" --include="*.tsx"  # expect 0
grep -r "/admin" src/ --include="*.ts" --include="*.tsx" | grep -v "admin portal moved"  # expect 0

# partner after 07b:
npm run typecheck  # or npx tsc --noEmit
npm run build
npm run lint
```

## Hand-off

- Update `docs/antigravity/HANDOFF_LOG.md` with `## PROMPT_07a` and `## PROMPT_07b`
- Update `docs/antigravity/00_BACKEND_WEEK_PLAN.md` status table (07a/07b at top)
- Partner side: create `burgonomics-partner/docs/ANTIGRAVITY_ADMIN_INTAKE.md` is the mirror of 07b (already provided — do not duplicate)
