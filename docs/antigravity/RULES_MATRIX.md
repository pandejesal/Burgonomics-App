# BURGONOMICS — Firestore Rules & CRM Security Matrix

> **Interpretable Context Methodology (ICM) — Layer 3 Domain Spec Reference**  
> **Source Spec:** `08_CRM_RULES_FINAL_SPEC.md` · **Priority:** Week 1 P0  
> **Verification Gate:** `firebase emulators:exec --only firestore 'npx vitest run tests/rules --reporter=verbose'`

---

## 1. CRM & Security Access Matrix (13 Collections)

| # | Collection / Path | Anonymous | Customer (`auth.uid`) | Branch Owner (`role == 'branch_owner'`) | Brand Owner (`role == 'brand_owner'`) | Verification Rule Summary |
|---|-------------------|:---------:|:---------------------:|:---------------------------------------:|:------------------------------------:|:--------------------------|
| **1** | `customers/{id}` | DENY | **ALLOW read/update own doc** (profile only; loyaltyPoints locked) | **ALLOW read** (for CRM & loyalty verification) | **ALLOW read all / write all** | Loyalty is **GLOBAL brand-wide**; customer cannot arbitrarily manipulate loyalty balance. |
| **2** | `orders/{id}` | DENY | **ALLOW create own** (pending status) / **read own** | **ALLOW read/update status for own branch** (`ownsBranch`) | **ALLOW read all / update all** | Branch owner strictly scoped to assigned `branchId`; cannot mutate prices or totals. |
| **3** | `branches/{id}` | **ALLOW read** | **ALLOW read** | **ALLOW update own non-status fields** (`ownsBranch`) | **ALLOW create / update / delete all** | **Upcoming branch creation strictly Brand Owner only** (`isBrandOwner()`). Branch Owner DENIED. |
| **4** | `upcoming_subscriptions/{uid}_{branchId}` | DENY | **ALLOW create/read/delete own** (`uid == auth.uid`) | DENY | **ALLOW read all** | Opt-in push notification topic tracker for upcoming branches. |
| **5** | `chats/{pairId}/messages` | DENY | DENY | **ALLOW read/send for own branch pair** (`${branchId}_${brandOwnerId}`) | **ALLOW read/send across assigned pairs** | Direct 1:1 messaging between branch operator & brand owners. No branch↔branch leaks. |
| **6** | `tickets/{id}` | DENY | **ALLOW create/read own** | **ALLOW create/read/update for own branch** | **ALLOW read/update all** | Unified collection (`raisedBy: 'customer' \| 'branch_owner'`). First-assigned ownership. |
| **7** | `paymentAudits/{id}` | DENY | **ALLOW create** (append-only) | **ALLOW read for own branch** | **ALLOW read all** | Strictly append-only audit trail. `update` and `delete` are PERMANENTLY DENIED. |
| **8** | `admins/{uid}` | DENY | DENY | **ALLOW read own profile** | **ALLOW read all / write all** | Controls administrative RBAC role assignments (`brand_owner` vs `branch_owner`). |
| **9** | `app_settings/{id}` | **ALLOW read** | **ALLOW read** | **ALLOW read** | **ALLOW write** | Global pricing configuration and feature toggles. |
| **10** | `menu_items`, `offers`, `coupons` | **ALLOW read** | **ALLOW read** | **ALLOW read** | **ALLOW write** | Store catalog, marketing banners, and coupon configurations. |
| **11** | `device_tokens/{token}` | DENY | **ALLOW write own token** (`userId == auth.uid`) | **ALLOW write own token** | **ALLOW write own token** | Push notification tokens for native Android/iOS Capacitor and Web FCM. |
| **12** | `admin_stores/{id}` | **ALLOW read** | **ALLOW read** | **ALLOW update own** (`ownsBranch`) | **ALLOW write all** | Backward-compatibility alias for branch operations. |
| **13** | Server-only (`payments`, `refunds`, `petpooja_orders`, `payment_discrepancies`, `webhook_events`) | DENY | DENY | **ALLOW read** (dashboard metrics) | **ALLOW read all** | Client writes **DENIED** (writable strictly by Cloud Functions & Admin SDK). |

---

## 2. Helper Functions Reference

```javascript
function isAuthenticated() {
  return request.auth != null;
}

function isAdmin() {
  return isAuthenticated() && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
}

function isBrandOwner() {
  return isAdmin() && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'brand_owner';
}

function isBranchOwner() {
  return isAdmin() && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'branch_owner';
}

function ownsBranch(branchId) {
  return isBrandOwner() || (isBranchOwner() && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.branchId == branchId);
}

function isChatParticipant(pairId) {
  return isBrandOwner() || (isBranchOwner() && ownsBranch(pairId.split('_')[0]));
}
```

---

## 3. Query Performance & Latency Acceptance (Grill 13)

- **Target Query Latency**: 2–4 seconds acceptable on real-time CRM dashboards.
- **Volume Calculation**: ~90k orders/month across all stores. 6 dashboard widgets execute 6 queries.
- **Index Optimization**: Without composite indexes, cold collection scans take 5–8s. With composite indexes declared below, queries complete in 1.2–2s.
- **Rollup Policy**: No pre-computed daily rollups required for v1.

---

## 4. Firestore Composite Indexes (`firestore.indexes.json`)

1. `orders`: `branchId ASC, createdAt DESC`
2. `orders`: `customerId ASC, createdAt DESC`
3. `orders`: `branchId ASC, payment.status ASC, createdAt DESC`
4. `orders`: `customerId ASC, status.kind ASC, createdAt DESC`
5. `paymentAudits`: `branchId ASC, createdAt DESC`

---

## 5. Known Gaps & Tradeoffs

- **Customer Cross-Branch Filtering**: Customers do not store a fixed `branchId` because customers are brand-wide. In v1, Branch Owners query customers via their branch orders. In v1 Firestore rules, `admins` can read `customers/{id}` documents; in v2, field-masking rules will be added when custom tokens include hashed customer IDs.
- **Immutable Payment Audits**: Client applications and cloud functions can write audit records on discrepancy detection; modifications and deletions are denied at the database engine level.
