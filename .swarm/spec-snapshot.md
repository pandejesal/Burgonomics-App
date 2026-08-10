# Burgonomics Security & UX Hardening Spec (Audit Remediation)

## Overview

Burgonomics is a React 19 / TanStack Start customer app wrapped in Capacitor 8 (Android + iOS), backed by a NestJS API (Prisma) and Firebase Cloud Functions + Firestore. A full six-lane audit (2026-08-09) found critical webhook authentication gaps, hardcoded secrets, open Firestore rules, a non-functional live payment path, and store-readiness blockers. This spec defines the mandatory remediation work. All work must preserve the frozen frontend architecture (README §17) and the working Gradle/AGP/Xcode toolchain versions.

## Functional Requirements

### FR-001 (MUST) Razorpay webhook guardian
Cloud Function `functions/src/razorpay/webhooks.ts` MUST fail closed: the webhook secret MUST come only from `RAZORPAY_WEBHOOK_SECRET` env or `functions.config().razorpay.webhook_secret`; when absent the function MUST respond 503 and never process. Signature validation MUST always use `req.rawBody` via timing-safe compare; missing rawBody or signature MUST be rejected with 400. No mock/fallback secret may exist. The captured amount MUST be a positive integer (paise) before persistence.

### FR-002 (MUST) Petpooja webhook authentication
`functions/src/petpooja/webhooks.ts` (pushMenu, storeStatus) MUST verify every request via `x-petpooja-webhook-signature` = HMAC-SHA256(body, secret) using a timing-safe compare, where the secret comes from env/config (`PETPOOJA_WEBHOOK_SECRET` / `functions.config().petpooja.webhook_secret`). Unset secret MUST reject with 503 (fail closed). A legacy `x-webhook-token` header equal to the secret MAY be accepted, documented, and deprecated.

### FR-003 (MUST) Petpooja credentials not in Firestore
`functions/src/petpooja/orders.ts` MUST read `app_secret` and `access_token` from environment/config only, never from order documents (publicly readable) — stale secret fields in docs MUST be ignored.

### FR-004 (MUST) Firestore rules lockdown
`firestore.rules` MUST deny client access to `petpooja_orders` and all internal collections; users read/write only own `users/{uid}` + own addresses; orders accessible only to the owning user; `payments`/`refunds`/`payment_discrepancies` own-row only; `admin_*` collections gated on custom claim admin token. Functions (admin SDK) bypass rules by design; comments MUST document that.

### FR-005 (MUST) Admin JWT secrets from env only
`backend/src/modules/admin-auth/**` MUST NOT contain hardcoded fallback secrets; `ADMIN_JWT_ACCESS_SECRET` / `ADMIN_JWT_REFRESH_SECRET` MUST be required (zod env validation, min 32 chars) and boot/use MUST fail when absent.

### FR-006 (MUST) Environment files untracked
`backend/.env.*` MUST be removed from git tracking (`git rm --cached`), added to `.gitignore` (allowing `.env.example` with placeholders), so no secret-shaped values can be committed.

### FR-007 (MUST) OTP safety
SMS OTP delivery MUST fail closed (throw) unless explicitly in development mode; OTP codes MUST never be written to logs/console (any logging MUST redact); OTP MUST NOT appear in URL query strings. Per-phone OTP rate limiting MUST be atomic (Redis INCR+EXPIRE or Lua) to close the TOCTOU window (3 requests / 30s cooldown).

### FR-008 (MUST) Payment amount integrity
Backend verify (`payments.service.ts`) and capture (`recordCapture`) MUST re-check gateway amount (paise) against the expected order amount; mismatch MUST NOT mark VERIFIED/CAPTURED and MUST record a discrepancy. Webhook processor MUST forward the payload amount.

### FR-009 (MUST) Admin login brute-force protection
Admin password and 2FA verification MUST enforce per-account atomic attempt counters with lockout (5 fails → 15 min), reset on success; failed TOTP challenges MUST be destroyed. Seeded admin MUST be forced to change the default password (login rejected while `requiresPasswordChange`).

### FR-010 (MUST) Webhook guards fail closed
NestJS Razorpay + Petpooja webhook guards MUST reject when secrets are missing in ALL environments (no non-production bypass). Petpooja replay window MUST validate `x-petpooja-timestamp` when present and reject absent timestamps; config wiring must use real config values.

### FR-011 (MUST) Payment client contract alignment
The frontend payment flow (PaymentRepository/paymentsService/razorpayAdapter + payment screen) MUST call the backend checkout-session endpoint first, then `POST /payments/orders` with `checkoutSessionId`, and MUST map verify results to `{paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature}`. Backend `amount` (paise) MUST NOT be re-multiplied (remove 100× inflation). Simulation MUST run only under explicit `VITE_ENABLE_PAYMENT_SIMULATION=true`; otherwise missing backend configuration MUST fail with a clear error — never fabricate `verified: true` or an `unsigned_test` signature.

### FR-012 (MUST) Order finalization UX safety
Cart MUST be cleared and success state shown only when server order creation actually succeeded; post-charge failures MUST show "check your bank statement" copy (never "no money charged") and keep the cart; init failures MUST stay on the payment screen; missing Razorpay signature MUST surface a pending-reconciliation state with real status polling; cancel MUST call the backend when configured.

### FR-013 (SHOULD) Client secret hygiene
Admin refresh token MUST NOT persist in localStorage (sessionStorage); `atob()` decodes MUST be guarded; hardcoded Firebase config and Razorpay test key MUST be dev-only fallbacks behind `import.meta.env.DEV`; dead client code referencing server env keys (`process.env.MSG91_*` etc.) MUST be removed; the admin print window MUST HTML-escape every interpolated customer-controlled field (DOM XSS).

### FR-014 (SHOULD) Mobile platform hardening
`webContentsDebuggingEnabled` MUST be false in production builds; Android StatusBar style MUST be LIGHT on the dark-green theme; `maximum-scale` zoom restriction MUST be removed; Android release MUST sign from env-provided keystore only; unneeded manifest permissions (per usage evidence) MUST be removed; FileProvider MUST NOT expose the external storage root; broken template tests MUST match the real appId; keystore patterns MUST be gitignored; an Android CI workflow (assembleDebug + lint) MUST be added.

### FR-015 (SHOULD) iOS shell & CI correctness
An `App.entitlements` file MUST exist with `WKAppBoundDomains` (matching `limitsNavigationsToAppBoundDomains: true`) plus the secure-storage keychain group, wired into the Xcode target; `CFBundleURLTypes` MUST declare the app scheme; the device-IPA CI flow MUST produce a real `.xcarchive` before export; simulator failures MUST fail the job; `sslVerify false` MUST be scoped to github.com with a rationale comment; artifact `find` MUST target DerivedData; `IOS_BUILD_SETUP.md` MUST match the fixed flow.

### FR-016 (SHOULD) UX corrections
Deep-link handling MUST validate host/path and work with hash history; Android back from any tab root MUST minimize; location permission MUST be requested only on explicit user intent; fulfillment-sheet deadlock MUST have an escape; tracking labels MUST derive from step data; infinite tracking animations MUST respect reduced motion; offline banner claims MUST be enforced at cart/checkout entry; safe-area insets MUST not double-apply; misc LOW fixes (badge cap 99+, tabular-nums prices, ≥44px touch targets, empty-store guards, skeletons instead of blank flashes, unify toasts).

### FR-017 (SHOULD) Session token lifecycle
Refresh/access expiries MUST derive from the same env config as JWT claims; a deactivated user MUST be rejected by the JWT strategy (`isActive`); a deleted user on refresh MUST yield 401 (no null deref), and `isNewUser` analytics MUST be accurate.

# Phase Scope Appendix

This section records the formal scope of Phase 1 for obligation-traceability purposes. It does not remove, weaken, or re-obligate any FR; it declares which obligations this phase covers and which are deferred.

## In scope (tasks 1.1-1.7)
- FR-001 Razorpay webhook guardian; FR-010 Webhook guards fail closed (tasks 1.1, 1.2)
- FR-002 Petpooja webhook authentication (task 1.2)
- FR-003 Petpooja credentials not in Firestore (task 1.3)
- FR-004 Firestore rules lockdown (task 1.4)
- FR-005 Admin JWT secrets from env only (task 1.5)
- FR-006 Environment files untracked (task 1.6)
- FR-014 Mobile platform hardening — ONLY the webContentsDebuggingEnabled production gate + StatusBar LIGHT on dark-green theme (task 1.7). Remaining FR-014 items (maximum-scale zoom removal, env-only keystore signing, manifest permission removal, FileProvider restriction, broken template test appId fixes, keystore gitignore, Android CI workflow) are deferred to a later phase with separate tracking.

## Formally declared OUT OF SCOPE for Phase 1 (separate remediation tracks per audit triage; tracked for later phases)
- FR-007 OTP safety (backend OTP rate limiting / Firebase auth settings — separate backend hardening track)
- FR-008 Payment amount integrity (backend checkout amount verification — separate payment-integrity track)
- FR-009 Admin login brute-force protection (admin auth track)
- FR-011 Payment client contract alignment (payment frontend/backend contract track)
- FR-012 Order finalization UX safety (order flow track)
- FR-013 Client secret hygiene, FR-015 iOS shell & CI correctness, FR-017 Session token lifecycle (SHOULD-level; deferred tracks)

## Build-pipeline caveat (task 1.7)
`webContentsDebuggingEnabled: process.env.NODE_ENV !== "production"` is evaluated at Capacitor config-build time. The gate is only effective if the release mobile build (vite.mobile.config.ts / `bun run build:mobile` + `npx cap sync` + `assembleRelease`) runs with NODE_ENV=production. CI must set NODE_ENV=production for release builds; this is a verification item for the Android CI workflow track.
