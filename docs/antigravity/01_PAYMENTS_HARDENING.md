# PROMPT 01 — Payments Hardening (Days 1–2)

**Commit:** `fix(backend): webhook idempotency + HMAC dedup`  
**Audit:** BND-6, BND-9, SEC-7 · **Risk:** revenue loss / spoofed webhooks

## Context

`netlify/functions/payments.ts:80` and `netlify/functions/razorpay-webhook.ts` duplicate HMAC logic and have divergent idempotency checks. This prompt unifies them and closes the `validatedAt` persistence gap noted in `docs/audit-report.md:31`.

## Files to Touch (only)

- `netlify/functions/lib/verifySignature.ts` — **create** canonical `verifyRazorpaySignature(payload, signature, secret)` using `timingSafeEqual`; both functions import it
- `netlify/functions/lib/server-price.ts` — no edits (read-only reference for amount trust)
- `netlify/functions/verify-payment.ts`
- `netlify/functions/razorpay-webhook.ts`
- `firestore.rules` — only if needed for `paymentEvents` idempotency doc (see acceptance)

## Do Not Touch

- `src/**`, `src/styles.css`, `android/**`, `firebase.json`

## Tasks

1. Extract duplicate `crypto.createHmac('sha256', secret).update(...)` into `lib/verifySignature.ts`; export `verifyRazorpaySignature(rawBody:string, headerSig:string|undefined, secret:string): boolean` + unit-testable `computeHmac`.
2. Normalize both handlers to read `event.body` raw (no `JSON.parse` before HMAC), return `401` on missing/invalid signature, `200` only after verification.
3. Ensure idempotency via `paymentEvents/{razorpay_event_id}` doc (if exists → return 200 idempotent skip). Write doc before mutating order.
4. Verify `validatedAt` is written on the canonical success path (both `verify-payment` and webhook) — add missing `validatedAt: serverTimestamp()` where absent.
5. Log structured event `{ eventId, orderId, amount, signatureValid: true/false }` via `console.info(JSON.stringify(...))` for Netlify logs.

## Acceptance

- [ ] Both payment functions import `verifySignature.ts`; no inline `createHmac` remains in either file
- [ ] Invalid/missing `x-razorpay-signature` → 401 with `{ error: "Invalid signature" }`
- [ ] Duplicate `razorpay_event_id` replay → 200 with `{ status: "already_processed" }` and no second order mutation
- [ ] `orders/{id}.validatedAt` set on success (rules allow — already `update` scoped to `payment.*`)
- [ ] `npx tsc --noEmit` 0 errors, `npm run build` passes, `npm run lint` passes

## Verification for Antigravity

```bash
npx tsc --noEmit
npm run build
npm run lint
# Manual: curl webhook with valid HMAC, then replay same event_id — second must be 200 already_processed
```

## Out of Scope (next prompts)

- Price authoritative checks (Prompt 02)
- Petpooja bridge (Prompt 04)
