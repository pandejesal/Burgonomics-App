<!--
AUTO-GENERATED EXPORT/CHECKPOINT SNAPSHOT — DO NOT EDIT
This file is NOT the live plan. It is a derived export artifact.
- .swarm/plan-ledger.jsonl is the authoritative source of plan state.
- .swarm/plan.json and .swarm/plan.md are derived projections.
Regenerated on: save_plan and phase_complete.
-->
# Security hardening remediation
Swarm: burgonomics
Phase: 1 [PENDING] | Updated: 2026-08-10T05:36:13.998Z

---
## Phase 1: Security hardening remediation [PENDING]
- [ ] 1.1: VERIFY (already implemented): Razorpay webhook guardian — constant-time HMAC signature validation over raw body; fail closed when webhook secret missing (FR-001, FR-010) [SMALL]
- [ ] 1.2: VERIFY (already implemented): Petpooja webhook authentication — HMAC-SHA256 shared-secret verify with timestamp replay window on pushMenu and storeStatus (FR-002, FR-010) [SMALL]
- [ ] 1.3: VERIFY (already implemented): Petpooja credentials not in Firestore — credentials sourced from functions config/env only, with fail-closed sync error (FR-003) [SMALL]
- [ ] 1.4: VERIFY (already implemented): Firestore rules lockdown — users self-only, orders owner-only, menu public-read, internal collections denied to clients (FR-004) [SMALL]
- [ ] 1.5: VERIFY (already implemented): Admin JWT secrets from env only — required in env.validation.ts, no fallback strings in service/strategy (FR-005) [SMALL]
- [ ] 1.6: VERIFY (already implemented): Environment files untracked — .gitignore .env.* patterns, git rm --cached performed for the three tracked env files (FR-006) [SMALL]
- [ ] 1.7: Mobile platform hardening: gate android webContentsDebuggingEnabled on NODE_ENV (never in production), StatusBar style DARK to LIGHT with comments; Keyboard style DARK unchanged (FR-014 partial — full FR-014 scope declared in spec.md Phase Scope Appendix) [SMALL]
