# PROMPT 07b — Partner: Intake Admin Portal (burgonomics-partner)

**Repo:** `burgonomics-partner` (`C:\Users\DELL\Desktop\Burgonomics\burgonomics-partner`)  
**Commit:** `feat(partner): intake admin portal from delivery`  
**Depends on:** 07a (delivery removal merged or branch available for copy)

## Source to Copy (from foundation-core, commit before 07a deletion)

Copy entire `src/admin/**` + `src/routes/admin*.tsx` tree verbatim as first step, then adapt.

```
# From foundation-core (use git show or checkout pre-deletion tag)
src/admin/ → burgonomics-partner/src/admin/
src/routes/admin.tsx + src/routes/admin.*.tsx → burgonomics-partner/src/routes/
```

## Adaptation Tasks (partner-specific)

1. **Router**
   - Partner uses `react-router-dom@7` (not TanStack Router). Convert `createFileRoute("/admin")` wrappers to `react-router-dom` `Route` objects in `src/pages/admin/` or `src/routes/` shim.
   - `src/routes/admin.tsx` layout guard (`useAdminAuthStore` + `bootstrap`) → `src/admin/layouts/AdminLayout.tsx` with `react-router-dom` `Outlet`/`useNavigate`/`useLocation`.
   - Keep `ThemeContext` → `src/admin/theme/ThemeContext.tsx` works as-is (React 19).

2. **Auth**
   - `src/admin/services/adminAuthService.ts` + `store/adminAuthStore.ts` depend on Firebase Auth `admins/{uid}` — keep, point to same Firebase project (`src/config/firebase.ts` exists in partner — align `firebaseConfig` with delivery's).
   - Capacitor `appId` for partner: set in `capacitor.config.ts` → `com.glassdoorsstudio.burgonomics.partner` (delivery stays `...burgonomics`).

3. **Services**
   - `adminStoresService`, `adminOrdersService`, `adminPaymentsService`, `adminCustomersService`, `dashboardService` call `netlify/functions/**` on `https://burgonomics.netlify.app` — update base URL to `import.meta.env.VITE_API_BASE || "https://burgonomics.netlify.app"`; add `VITE_API_BASE` to `partner/.env.example`.

4. **Theme / Styles**
   - Admin theme uses Tailwind 4 in partner (already) — verify `ThemeContext` + `AdminLayout` styles compile; remove delivery-specific `src/styles.css` orange-gradient if not needed, keep admin tokens.

5. **Firestore Rules**
   - No change to `burgonomics-partner/firestore.rules` beyond aligning with delivery's `firestore.rules` (copy `admins`/`admin_stores`/`app_settings`/`paymentAudits` rules). Do not diverge.

## File Map After Intake

```
burgonomics-partner/src/admin/
  components/{Badges,Buttons,Cards,CommandPalette,FeedbackStates,Headers,TableSystem,Utilities}.tsx
  dashboard/{components/widgets/*,components/charts/DashboardCharts.tsx,hooks/useDashboardData.ts,services/dashboardService.ts,types/}
  hooks/useAdmin.tsx
  layouts/{AdminLayout,SystemOperationsLayout,PetpoojaOperationsLayout}.tsx
  pages/{Admin*.tsx, system/*Tab.tsx, *Data.ts}
  services/{adminAuth,adminStores,adminPayments,adminOrders,adminCustomers}Service.ts
  store/adminAuthStore.ts
  theme/ThemeContext.tsx
burgonomics-partner/src/routes/admin*.tsx  (or src/pages/admin/* if converting to react-router)
```

## Do Not Touch in Partner

- Existing `src/pages`, `src/stores`, `src/components` unless needed for shared shims

## Verification

```bash
# in burgonomics-partner/
npm run typecheck
npm run lint
npm run build
# manual: npm run dev → /admin/login → login with admins/{uid} → dashboard renders 10 widgets
```

## Acceptance

- [ ] `src/admin` exists with all 85 files; `src/routes/admin*` or equivalent admin routes render
- [ ] `/admin/login` → `/admin` guard works (non-admin redirected, admin sees dashboard)
- [ ] Admin services hit `burgonomics.netlify.app` (or `VITE_API_BASE`) and respect `PETPOOJA_ENABLED` flag
- [ ] `capacitor.config.ts` appId is `com.glassdoorsstudio.burgonomics.partner`
- [ ] `npm run typecheck` 0 errors, `npm run build` succeeds
- [ ] `HANDOFF_LOG.md` updated in delivery repo (cross-link both PRs)

## Hand-off

After merge, delivery's `07a` and partner's `07b` PRs must cross-reference each other. Close `07_ADMIN_PORTAL_EXTRACTION.md` with both PR URLs.
