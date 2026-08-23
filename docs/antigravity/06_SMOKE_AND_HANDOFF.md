# PROMPT 06 — Backend Smoke + Handoff (Day 7)

**Commit:** `chore(backend): backend smoke + handoff notes`  
**Audit:** OPS-2..5 · **Goal:** Close week with one-click demo readiness

## Context

Final day is not a code prompt — it is a verification + documentation day. Backend must be demonstrable without Petpooja live.

## Files to Touch (only)

- `docs/antigravity/BACKEND_SMOKE_CHECKLIST.md` — **create**
- `docs/antigravity/HANDOFF_LOG.md` — **append** final summary
- `scripts/seed.ts` — verify runbook (read-only unless seed broken)
- `netlify.toml` — verify functions config (read-only unless broken)

## Tasks

1. Run full smoke locally (record pass/fail in checklist):
   ```bash
   npx tsc --noEmit
   npm run lint
   npm run build
   firebase emulators:exec --only firestore "npm run test:rules"
   npx vitest run src/shared/pricing
   # If emulator available:
   npx tsx scripts/seed.ts --dry-run   # no write, just validates
   npx tsx scripts/reconcile-payments.ts --dry-run
   ```
2. Build debug APK sanity (no upload):
   ```bash
   npm run cap:sync:android
   # then in android/: ./gradlew assembleDebug  (record output)
   ```
3. Create `BACKEND_SMOKE_CHECKLIST.md`:
   ```
   # Backend Smoke — Week 1 Exit
   Date:
   Branch:
   | Check | Command | Result | Notes |
   | npx tsc --noEmit | ... | PASS/FAIL | |
   | npm run build | ... | PASS | |
   | test:rules | ... | 12/12 | |
   | pricing tests | ... | PASS | |
   | seed --dry-run | ... | PASS | |
   | assembleDebug | ... | PASS | |
   ```
4. Append to `HANDOFF_LOG.md`:
   ```
   ## WEEK1 EXIT — 2026-08-XX
   - branch: ...
   - smoke: PASS (see BACKEND_SMOKE_CHECKLIST.md)
   - known gaps: Petpooja dormant (flag-guarded), release keystore pending (OPS-4)
   - next week proposal: Branch CRUD (stores/admin_stores) + push notifications
   ```

## Acceptance

- [ ] `BACKEND_SMOKE_CHECKLIST.md` exists with 6 rows filled, all PASS (or FAIL with reason)
- [ ] `HANDOFF_LOG.md` has 5 prompt entries + WEEK1 EXIT entry
- [ ] No code changes beyond checklist/log unless a smoke failure forces a fix (then commit as `fix(backend): week1 smoke failure — <reason>`)

## Verification

```bash
cat docs/antigravity/BACKEND_SMOKE_CHECKLIST.md
cat docs/antigravity/HANDOFF_LOG.md
```
