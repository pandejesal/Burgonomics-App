# BURGONOMICS — Delivery & Porter Integration (Layer 3 Constraint)

> **Reference Specification**: Production Porter logistics integration, quote computation, automated dispatch, webhook reconciliation, and manual fallback.
> **Locked Grill Directives (Q2, Grill 11, Spec 09 §3)**: Real Porter for production, feature flag gating, HMAC webhook verification, and margin reconciliation.

---

## 1. 🚚 Logistics Overview & Configuration
- **Primary Delivery Provider**: Porter API (`https://api.porter.in/v1` / `/v2`).
- **Feature Flag Gating**: `branches/{branchId}.features.porterEnabled` (Boolean, default `false`).
  - Gated so new branches/cities can be activated without code changes or blocking core payments.
- **Environment Variables**:
  - `PORTER_API_KEY`: API access token.
  - `PORTER_CUSTOMER_ID`: Porter enterprise account ID.
  - `PORTER_CITY`: Operating city identifier (e.g. `Ahmedabad`, `Surat`, `Vadodara`).

---

## 2. 🔄 Dispatch & Lifecycle Workflow
1. When payment is verified (`payment.status == "completed"` / `"paid"`) and `order.orderType == "delivery"`:
2. Serverless dispatcher checks if `branch.features.porterEnabled == true`:
   - **If true**: calls `functions/create-porter-order.ts` -> `POST api.porter.in/v1/orders`.
   - **If false / no riders**: order remains in `status: 'ready'`, sets `deliveryStatus: 'no_riders_available'`, and alerts branch operator for manual assignment.
3. Order document stores Porter tracking details:
   ```typescript
   order.porter = {
     orderId: "PORTER_ORD_987",
     cost: 45.00, // ₹40-80 bike fare
     status: "ASSIGNED"
   };
   ```

---

## 3. 🔐 Webhook Receiver (`netlify/functions/porter-webhook.ts`)
- Porter dispatches real-time status webhooks (Rider Assigned, Arrived at Store, Out for Delivery, Delivered, Cancelled).
- `porter-webhook.ts` performs HMAC signature verification before updating Firestore `orders/{orderId}.status`.

---

## 4. 💰 Margin Reconciliation
- Customer delivery fee charged (e.g. ₹29, ₹50, or ₹0 for free delivery > ₹499).
- Porter real delivery cost incurred (₹40–80).
- Admin reconciliation reporting displays `porterCost` vs `deliveryFee` net delivery subsidy/margin per order.
