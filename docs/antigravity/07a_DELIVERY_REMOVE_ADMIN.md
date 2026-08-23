# PROMPT 07a — Delivery: Remove Admin Portal (foundation-core)

**Repo:** `burgonomics-foundation-core` · **Commit:** `chore(delivery): remove admin portal (→ partner)`  
**Depends on:** 07 extraction master · **Blocks:** 07b (partner intake)

## Scope — Delete Entirely

```
src/admin/
src/routes/admin.tsx
src/routes/admin.*.tsx          (all 53 — glob src/routes/admin*)
src/admin/theme/ThemeContext.tsx
src/admin/store/adminAuthStore.ts
src/admin/services/*
src/admin/hooks/useAdmin.tsx
```

## Scope — Edit (surgical)

- `src/routeTree.gen.ts` — regenerated (remove admin routes); do not hand-edit, run `npm run build` or `npx @tanstack/router-cli generate` if needed
- `src/router.tsx` — remove any admin-specific history/error handling
- `src/shared/layouts/AppShell.tsx` — remove admin nav links if present
- `package.json` — remove admin-only deps only if fully unused elsewhere (e.g., admin chart libs); if shared (recharts, zod) keep
- `firestore.rules` — **DO NOT DELETE** admin collections/rules; add comment `// Admin UI moved to burgonomics-partner — rules retained`
- `README.md` / `docs/**` — replace admin references with `> Admin portal moved to burgonomics-partner — see docs/antigravity/07_ADMIN_PORTAL_EXTRACTION.md`

## Do Not Touch

- `netlify/functions/**` (backend stays)
- `src/features/**` (customer features)
- `src/shared/pricing/**`
- `android/**`, `capacitor.config.ts` (appId stays `com.glassdoorsstudio.burgonomics`)

## Steps for Antigravity

1. `git checkout -b chore/remove-admin-portal`
2. `rm -rf src/admin` + `rm src/routes/admin.tsx src/routes/admin.*.tsx`
3. `grep -rn "@/admin" src/ --include="*.ts" --include="*.tsx"` → fix stragglers (should be 0)
4. `grep -rn "adminAuthStore\|ThemeContext.*admin\|useAdmin" src/ --include="*.ts" --include="*.tsx"` → remove imports/usages
5. Regenerate `routeTree.gen.ts` (run `npm run build` — TanStack Start regenerates)
6. Verify:
   ```bash
   npx tsc --noEmit
   npm run lint
   npm run build
   npm run test  # vitest run — must not reference admin
   ```
7. `git status` must show only deletions + `routeTree.gen.ts` + doc updates; no new `src/admin` files

## Acceptance

- [ ] `src/admin` does not exist
- [ ] `src/routes/admin*.tsx` = 0 files (`ls src/routes/admin*` → No such file)
- [ ] `grep -r "from '@/admin" src/` = 0
- [ ] `grep -r "/admin" src/` = 0 (except comment "Admin portal moved to partner")
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run build` succeeds; `dist/` contains no admin chunk
- [ ] No `firestore.rules` admin collection deleted
- [ ] PR description links to `07_ADMIN_PORTAL_EXTRACTION.md` and `burgonomics-partner` intake PR

## Rollback Note

If partner intake stalls, do NOT restore admin to delivery — delivery stays customer-only. Partner intake is the only recovery path.
