# PROMPT 05 — Webhook Reconciliation + Audit Trail (Days 5–6)

**Commit:** `fix(backend): payment discrepancy + audit trail`  
**Audit:** SEC-7, OPS-2 · **Risk:** amount mismatch accepted, no forensic trail

## Context

`audit-report.md:36` flags missing audit trail on payment discrepancies. `payments.ts` verifies `amount === order.totals.grandTotal` but does not persist the check result atomically with the order update. This prompt adds a dedicated ledger and a reconciliation query for ops.

## Files to Touch (only)

- `netlify/functions/lib/paymentAudit.ts` — **create** helper `writePaymentAudit(db, { orderId, razorpayPaymentId, expectedAmount, receivedAmount, signatureValid, outcome })`
- `netlify/functions/payments.ts`
- `netlify/functions/razorpay-webhook.ts`
- `firestore.rules` — add `paymentAudits/{id}` collection rules (admin-read, function-write via service account bypass)
- `functions/src/reconcile.ts` or `scripts/reconcile-payments.ts` — **create** one-off reconciliation script

## Tasks

1. Create `paymentAudits/{auditId}` write on every verification attempt:
   ```ts
   // doc id: `${orderId}_${razorpayPaymentId}_${Date.now()}`
   { orderId, razorpayPaymentId, razorpayOrderId, expectedAmount, receivedAmount,
     signatureValid, amountMatch, outcome: "verified"|"amount_mismatch"|"signature_fail",
     createdAt: serverTimestamp(), source: "verify-payment"|"webhook" }
   ```
2. Make amount check atomic: use `db.runTransaction` — read order, verify amount, write audit, update `orders/{id}.payment` and `validatedAt` in same transaction (or sequential with audit first — document choice).
3. On `amountMismatch` → write audit with `outcome:"amount_mismatch"`, return `400 { error:"Amount mismatch", expected, received }`, do **not** mark order `paid`; trigger `paymentAudits` retention (no delete).
4. Add reconciliation script `scripts/reconcile-payments.ts`:
   - Queries `paymentAudits` last 7d where `outcome != "verified"`
   - Prints table `orderId | expected | received | outcome | createdAt`
   - Exits `1` if mismatches found (for CI cron)
5. Rules: `paymentAudits` → `allow read: if isAdmin(); allow write: if false` (writes via Admin SDK only); add emulator test in `tests/rules` to assert user read DENY.

## Acceptance

- [ ] Every payment attempt (success or fail) creates a `paymentAudits` doc with all fields
- [ ] Amount mismatch never marks order `paid`; audit outcome = `amount_mismatch`
- [ ] `scripts/reconcile-payments.ts` runnable via `npx tsx scripts/reconcile-payments.ts` and prints discrepancy table
- [ ] Rules test for `paymentAudits` passes
- [ ] `npx tsc --noEmit` + `npm run build` + `npm run lint` green

## Verification

```bash
npx tsx scripts/reconcile-payments.ts --dry-run
npx tsc --noEmit
firebase emulators:exec --only firestore "npx vitest run tests/rules --run -t paymentAudits"
```
