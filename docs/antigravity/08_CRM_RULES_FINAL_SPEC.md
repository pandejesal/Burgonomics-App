# 08 — CRM + Firestore Rules Final Spec (Week 1 P0)

**Priority:** P0 — executes immediately after `07a/b` per Grill 14 (`CRM + Rules → Payments → Everything else`)  
**Replaces execution order of:** `03_FIRESTORE_RULES_VERIFICATION.md` now consumes this spec  
**Authors:** Muse Spark planning · Executor: Antigravity

## Grill Context

- Firestore is the CRM (no Petpooja CRM endpoints — Petpooja is POS view-only).
- Live analytics queries over CRM are acceptable at **2–4s** (Grill 13). No daily rollup jobs for v1.
- Role hierarchy is **Customer loyalty shared**: loyalty/history is global brand-wide, sales data is branch-scoped.

## CRM Collections (authoritative)

```
customers/{customerId}          — profile, loyaltyPoints (global), totalOrders (global)
orders/{orderId}                — customerId, branchId, status {kind}, payment {status,method}, totals, items[], pricingSnapshot, petpoojaOrderId?
branches/{branchId}             — name, city, active, pricingOverrides?
admins/{uid}                    — role: "brand_owner" | "branch_owner", branchId? (null for brand)
admin_stores/{storeId}          — legacy alias for branches (keep but prefer branches/)
paymentAudits/{auditId}         — paymentId, orderId, branchId, expectedAmount, paidAmount, delta, webhookId, createdAt (append-only, not arch-dependent)
analytics_daily/{branchId}_{YYYY-MM-DD} — OPTIONAL future rollup (do not build now)
```

### Loyalty — Global (Brand-wide)

- `customers/{id}.loyaltyPoints` and `orderHistory` are **not** partitioned by branch.
- Earn/redeem applies to any branch. Query: `collectionGroup` or `customers/{id}` single-doc.

### Sales Data — Branch-scoped

- `orders` filtered by `branchId` for branch owner; brand owner queries across all `branchId`.
- Never leak cross-branch `orders` to branch owner (enforced in rules, not just UI).

## Firestore Rules — Required Matrix

| Collection                       | anon  |                                         customer (auth)                                         |                           branch_owner                            |             brand_owner              |
| -------------------------------- | :---: | :---------------------------------------------------------------------------------------------: | :---------------------------------------------------------------: | :----------------------------------: |
| `customers/{id}` read            | DENY  |                                   own doc ALLOW, others DENY                                    | read own-branch customers ALLOW (query `orders` → join? see note) |            read all ALLOW            |
| `customers/{id}` write           | DENY  |                         own profile ALLOW, `loyaltyPoints` via txn only                         |                        DENY (backend only)                        |             backend only             |
| `orders` create                  | DENY  | own `customerId==request.auth.uid && status.kind=="pending" && payment.status=="pending"` ALLOW |                               DENY                                |                 DENY                 |
| `orders` read                    | DENY  |                                     own `customerId` ALLOW                                      |            `branchId == resource.data.branchId` ALLOW             |              all ALLOW               |
| `orders` update `status/payment` | DENY  |                                              DENY                                               |      own branch ALLOW (status transitions only, not totals)       |              all ALLOW               |
| `orders` update `totals`         | DENY  |                                              DENY                                               |                               DENY                                | DENY (server only via `payments.ts`) |
| `branches/{id}` read             | ALLOW |                                              ALLOW                                              |                               ALLOW                               |                ALLOW                 |
| `branches/{id}` write            | DENY  |                                              DENY                                               |               own `branchId` ALLOW (limited fields)               |              all ALLOW               |
| `admins/{uid}` read              | DENY  |                                              DENY                                               |                           own doc ALLOW                           |              all ALLOW               |
| `admins/{uid}` write             | DENY  |                                              DENY                                               |                               DENY                                |          brand_owner ALLOW           |
| `paymentAudits/**` read          | DENY  |                                              DENY                                               |                         own branch ALLOW                          |              all ALLOW               |
| `paymentAudits/**` write         | DENY  |                                              DENY                                               |                               DENY                                |          DENY (server only)          |
| `app_settings/pricing` read      | ALLOW |                                              ALLOW                                              |                               ALLOW                               |                ALLOW                 |
| `app_settings/pricing` write     | DENY  |                                              DENY                                               |                               DENY                                |          brand_owner ALLOW           |

**Note:** `customers` branch-scoping is via `orders` aggregation — do not store `branchId` on `customers`. Branch owner lists customers by `orders where branchId == X distinct customerId`. For v1, branch owner may read all `customers` but UI filters; rules v1 allow `customers` read for any admin, v2 tightens — document this tradeoff in `RULES_MATRIX.md` under "Known gap".

## Indexes (add to `firestore.indexes.json`)

- `orders` composite: `branchId ASC, createdAt DESC`
- `orders` composite: `customerId ASC, createdAt DESC`
- `orders` composite: `branchId ASC, payment.status ASC, createdAt DESC`
- `orders` composite: `customerId ASC, status.kind ASC`
- Document covering index for `paymentAudits`: `branchId ASC, createdAt DESC`

## Tasks

1. **Model:** Confirm collections above match current code (`src/features/orders`, `src/features/customers`, `netlify/functions/payments.ts`). Do not rename existing `admin_stores` — add `branches/` as alias with migration script `scripts/migrate-admin_stores-to-branches.mjs` (dryRun copy).
2. **Rules:** Implement matrix in `firestore.rules` with helper functions:
   ```js
   function isBrandOwner() { return exists(/databases/$(database)/documents/admins/$(request.auth.uid)) && get(...).data.role == "brand_owner"; }
   function isBranchOwner() { ... role == "branch_owner" }
   function ownsBranch(branchId) { return isBrandOwner() || (isBranchOwner() && get(...).data.branchId == branchId); }
   ```
3. **Tests:** Extend `03` test suite to 18+ tests covering loyalty global read + branch-scoped orders + brand sees-all + paymentAudits append-only + customer cannot escalate. All under `tests/rules/` via `@firebase/rules-unit-testing`.
4. **Docs:** Write `docs/antigravity/RULES_MATRIX.md` with above table + known gap note + index list.
5. **Perf note:** Add comment in `RULES_MATRIX.md` explaining 2–4s acceptance: 90k docs/month, 6 widgets = 6 queries ≈ 5–8s without indexes, ≈ 1.2–2s with indexes — acceptable per Grill 13.

## Acceptance

- [ ] `firestore.rules` implements matrix with `ownsBranch` helpers
- [ ] ≥18 emulator tests green covering all rows above + loyalty global
- [ ] `firestore.indexes.json` contains 4 `orders` composites
- [ ] `RULES_MATRIX.md` created with known gap note
- [ ] `npx tsc --noEmit` + `firebase emulators:exec --only firestore "npx vitest run tests/rules --reporter=verbose"` green
- [ ] No existing 07a/b prompts broken (`src/admin` already removed before this prompt)

## Verification

```bash
npx tsc --noEmit
npm run build
firebase emulators:exec --only firestore "npx vitest run tests/rules --reporter=verbose"
```

## Permanent DON'T WANT Guard

- Do not create a second `kitchen_orders` collection mirroring Petpooja KOT — `orders` is the single order collection.
- Do not add per-branch `loyaltyPointsByBranch` — loyalty stays global.
