# BATCH-3 S2 — Core auth + identity honesty (R1)

You are implementer B3-S2. Model: opencode/muse-spark-1.3-contributor-free — you AND every subagent run this exact model, no substitution. If unreachable, stop and report.

ISOLATION: work ONLY inside this worktree root (core @ post-batch-2 main) — ALL paths relative. No absolute parent paths, no %Temp%, no heredocs. `npm ci` allowed INSIDE this worktree only (`--ignore-scripts` if @google/genai preinstall crashes — batch-2 precedent, pre-existing). No long-blocking servers.

CONTEXT: Batch 2 wired promo/loyalty/tip into payloads; your auth layer must not re-open what backend closed (guest bonus now server-idempotent — client flag must not mint). Sweep B1–B11 hold.

PLAN: input/PLAN-A.md §Batch 4 (4Y) + input/PLAN-B.md §Batch 3 S2. EXCLUSIVE scope:
- src/features/auth/** + auth.login.tsx + auth.otp.tsx (single OTP delivery default; no channel mismatch)
- QuickAuthSheet.tsx (guest→earn flow must defer to server bonus; localStorage flag never mints)
- secureStorage.ts (untrusted-cache documentation; short TTL where tokens cached; no new plaintext secrets; Keychain/Keystore path where feasible, else queued with reason)
- profile.** (remove hardcoded Burger Lover/Gold-as-truth; backend-or-empty)
- AddressForm.tsx + addressService.ts (phone fail-closed ^[6-9]\d{9}$ on create AND update; 0000000000 blocked; shared update validation)
- validators.ts (same phone rule, single source)

METHOD: 2–3 parallel subagents (same model): auth flows/OTP, storage/profile honesty, address/validator hardening. Unknown role / empty scope → deny + sign-out, never minted session.

GATES: npx tsc --noEmit clean; npm run build clean; touched auth/address/storage tests pass (touched modules only). Then HANDOFF + STOP.

COMMIT + PUSH: scoped commit (owned files only) referencing H6/M1-M4/L4, push origin HEAD:main (verify branch first), record SHA. Then HANDOFF (changed / gates / SHA) + STOP.
