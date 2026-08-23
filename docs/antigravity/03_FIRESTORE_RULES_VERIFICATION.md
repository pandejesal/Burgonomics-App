# PROMPT 03 — Firestore Rules Verification (Days 3–4)

**Commit:** `fix(security): rules regression tests`  
**Audit:** SEC-2, SEC-4, SEC-1 · **Risk:** privilege escalation, cross-user order read

## Context

`firestore.rules:21,45,65,72` was hardened (pending-only create, public-read for settings). No emulator tests exist to prevent regression. This prompt adds the missing test harness without changing rule semantics (unless a failing test proves a bug).

## Files to Touch (only)

- `firestore.rules` — fix only if emulator test fails (document why)
- `firestore.indexes.json` — read-only (create index if test needs query)
- `tests/rules/**` or `firestore.rules.test.ts` — **create** emulator suite
- `firebase.json` — add `"emulators": { "firestore": { "port": 8080 } }` if missing

## Tasks

1. Init rules test harness:
   ```bash
   npm i -D @firebase/rules-unit-testing firebase-tools
   firebase emulators:start --only firestore  # for local run
   ```
2. Write tests (use `@firebase/rules-unit-testing`):
   - `orders` create with `status.kind != "pending"` / `payment.status != "pending"` → DENY
   - `orders` create with valid `pending/pending` → ALLOW (owner is `auth.uid`)
   - `orders` read by non-owner → DENY; owner → ALLOW
   - `orders` update `status` by non-admin → DENY; admin (`admins/{uid}` exists) → ALLOW
   - `stores/{id}` write by non-admin → DENY; admin → ALLOW; read by anon → ALLOW
   - `app_settings/pricing` read by anon → ALLOW; write by non-admin → DENY
   - `admin_stores` read by non-admin → DENY
3. Add npm script: `"test:rules": "firebase emulators:exec --only firestore 'vitest run tests/rules'"`
4. Document manual check in `docs/antigravity/RULES_MATRIX.md` (matrix of collection × role → read/write verdict).

## Acceptance

- [ ] ≥12 emulator tests covering all cases above, all green
- [ ] `firestore.rules` unchanged unless a test fails with justification in PR description
- [ ] `npm run test:rules` passes locally; CI can run same command (emulator action already docs)
- [ ] Hand-off matrix `RULES_MATRIX.md` created

## Verification

```bash
npx tsc --noEmit
firebase emulators:exec --only firestore "npx vitest run tests/rules --reporter=verbose"
```

## Notes

- Do not seed production data. Use emulator only.
- Keep `timingSafeEqual` logic out of this prompt (Prompt 01).
