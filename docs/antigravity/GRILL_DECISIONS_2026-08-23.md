# Grill Decisions — Backend Final App (2026-08-23)

**Interview:** `grill-me` relentless branch walk · **Scope:** All three tiers (Customer delivery `burgonomics-foundation-core` + Partner `burgonomics-partner` + Admin → partner)  
**Author:** Muse Spark (planning only) · **Executor:** Antigravity

## Decision Ledger (14 branches resolved)

| #   | Branch               | Decision                                                                                                                                                                         | Replaces             |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Scope                | **All three tiers** — full ecosystem audit, not delivery-only                                                                                                                    | —                    |
| 2   | Messiest domains     | **Payments & webhooks + Pricing/catalog** — revenue risk, week 1 P0                                                                                                              | —                    |
| 3   | Payments v1          | **Online (Razorpay = UPI/wallets/cards) + COD + Refund** with **auto refund on any cancel + payment failure** (incl. amount-mismatch, failed webhook, store reject pre-delivery) | —                    |
| 4   | Pricing truth        | **Petpooja is truth** — item MRP live from Petpooja API                                                                                                                          | Firestore strict     |
| 5   | Petpooja creds       | **Final app, not demo** — client provides test creds this week; Firestore CRM is CRM, Petpooja is POS view-only (public API v2.1.0 has no CRM endpoints)                         | demo deferred        |
| 6   | CRM ownership        | **Firestore is CRM, Petpooja is POS** — parallel: Firestore-first write (reliable UX) → async Petpooja push (tolerates downtime)                                                 | dual-write mirror    |
| 7   | Refund edge          | **Auto: any cancel + payment failure**                                                                                                                                           | manual               |
| 8   | Admin v1             | **Keep everything** — all 44 pages `src/admin/**` + 53 `src/routes/admin*.tsx` move to partner (`07a` delete delivery, `07b` intake partner)                                     | ops-only cut         |
| 9   | System infra         | **Firestore-only emulation** — queues/jobs/metrics/redis/logs as Firestore collections, no Redis/Upstash/BullMQ                                                                  | provision real infra |
| 10  | Customer app         | **Everything real** — Menu+Cart+Checkout+Coupons+Loyalty+Offers+Notifications+Marketing all Firestore-backed, no mocks                                                           | core-only            |
| 11  | Fulfillment          | **Porter for production** — real Porter order + tracking webhook for Delivery (Takeaway/Dine-in unaffected)                                                                      | simulation           |
| 12  | Notifications        | **FCM via Firebase only** — topics `order_{id}`, `branch_{id}`, `brand`, Capacitor Push Notifications                                                                            | in-app only          |
| 13  | Analytics            | **Live CRM queries, 2–4s acceptable** — 100k docs ≈ 2-4s, dashboards query CRM directly, no daily rollups                                                                        | rollup jobs          |
| 14  | Week 1 order         | **CRM + Rules → Payments → Everything else** — `03` → `01` → `02` → `04/05/06` (overrides prior 01→02→03)                                                                        | 01→02→03             |
| 15  | Role hierarchy       | **Customer loyalty shared** — loyalty/history global brand-wide, sales data branch-scoped; Brand sees all, Branch sees own, Customer sees own                                    | strict hierarchy     |
| 16  | Permanent DON'T WANT | **No second POS** (no own KOT) + **No in-app wallet** (Razorpay handles wallets)                                                                                                 | —                    |
| 17  | Done gate            | **Smoke + role test** — branch sees own branch only, brand sees all, customer sees loyalty, amount-mismatch blocked, refund audit logged                                         | load test            |

## Implications for Antigravity

- **Petpooja truth** means `07b` partner intake and `02` pricing must call live Petpooja (`qle1yy2ydc`/`47pfzh5sf2`) with `PETPOOJA_ENABLED=true` once creds arrive — until then use `?dryRun=1` + Firestore fallback with clear `PETPOOJA_DISABLED` banner.
- **Everything real + Porter + FCM** cannot ship in 7 days — week 1 is CRM+Rules+Payments only; Porter/FCM/Admin 44 pages = week 2+.
- **Live CRM queries** → add missing Firestore indexes for `orders` (branchId+createdAt, customerId+status, paymentStatus) before dashboards.

## References

- Master plan: `00_BACKEND_WEEK_PLAN.md`
- Extraction: `07_ADMIN_PORTAL_EXTRACTION.md`, `07a/b`
- Backend prompts: `01_PAYMENTS_HARDENING.md` … `06_SMOKE_AND_HANDOFF.md`
