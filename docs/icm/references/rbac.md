# BURGONOMICS — Role-Based Access Control (Layer 3 Constraint)

> **Reference Specification**: Role hierarchy, permission matrices, security rules helper functions, and authorization boundaries.
> **Locked Grill Directives (Q3, Q4, Q10)**: Brand owner equality, 1:1 chat pairs only, upcoming branch creation restricted to brand owners, and global loyalty scoping.

---

## 1. 👥 Role Hierarchy & Personas

```
Brand Owner (role: "brand_owner") [e.g. Yash, Nehh — both equal]
├── Scope: Global (All cities, all branches)
├── Can: Manage branches, create upcoming branches, arbitration, view all metrics, 1:1 chat with any branch
└── Security: isBrandOwner() == true

Regional Manager (role: "regional_manager")
├── Scope: Multi-city (e.g. ["Ahmedabad", "Surat"])
└── Can: City-level metrics, regional ticket oversight, branch comparisons

Branch Owner / Operator (role: "branch_owner")
├── Scope: Single branch (e.g. ["branch_ahmedabad_01"])
├── Can: Accept orders, update kitchen status, manage local tickets, manual rider dispatch, 1:1 chat with Brand Owners
└── Security: ownsBranch(branchId) == true

Customer (role: "customer")
├── Scope: Personal profile, global loyalty balance, personal orders
└── Can: Order food, track delivery live, raise support tickets, subscribe to upcoming branches
```

---

## 2. 📊 Comprehensive Permission Matrix

| Feature / Resource | Customer | Branch Owner | Regional Manager | Brand Owner | Notes |
|---|---|---|---|---|---|
| **Place Order / Cart Checkout** | ✅ (own doc) | ❌ | ❌ | ❌ | Validated by server |
| **View Own Order History** | ✅ | ❌ | ❌ | ❌ | Authenticated UID only |
| **View Branch Live Orders** | ❌ | ✅ (own branch) | ✅ (city branches) | ✅ (all branches) | Enforced via `ownsBranch(branchId)` |
| **Update Order Status** | ❌ | ✅ (own branch) | ✅ | ✅ | Status transitions only |
| **Manual Rider Dispatch** | ❌ | ✅ (own branch) | ✅ | ✅ | When Porter has no riders |
| **Customer Loyalty Balance** | ✅ (own doc) | 👁️ (read-only) | 👁️ (read-only) | 👁️ (read-only) | **GLOBAL brand-wide** (Q10/Grill 15) |
| **Raise Support Ticket** | ✅ | ✅ | ✅ | ✅ | Single unified collection |
| **Resolve Branch Ticket** | ❌ | ✅ (own branch) | ✅ | ✅ | First-assign, 24h SLA |
| **Escalate Ticket to Brand** | ❌ | ✅ | ✅ | ✅ | Reassigns to brand |
| **Direct Messaging (1:1 DMs)** | ❌ | ✅ (`branchId_Brand`) | ❌ | ✅ (`branchId_Brand`) | **Pair-scoped only** (Q3/Q4/Q7) |
| **Create Upcoming Branch** | ❌ | ❌ **DENY** | ❌ **DENY** | ✅ **ALLOW** | **Brand Owner only** (Q10) |
| **Subscribe to Upcoming Branch** | ✅ | ❌ | ❌ | ❌ | Creates `upcoming_subscriptions` doc |
| **Configure Branch / POS Creds** | ❌ | ❌ | ❌ | ✅ | Brand Owner only |
| **View Branch Analytics** | ❌ | ✅ (own branch) | ✅ (city) | ✅ (all) | 2–4s live queries |

---

## 3. 🛡️ Security Rules Helper Functions (`firestore.rules`)

```javascript
// Check if user is authenticated
function isAuthenticated() {
  return request.auth != null;
}

// Brand Owner check (both Yash and Nehh equal)
function isBrandOwner() {
  return isAuthenticated() &&
    exists(/databases/$(database)/documents/admins/$(request.auth.uid)) &&
    get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == "brand_owner";
}

// Branch Owner check
function isBranchOwner() {
  return isAuthenticated() &&
    exists(/databases/$(database)/documents/admins/$(request.auth.uid)) &&
    get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == "branch_owner";
}

// Branch ownership verification (Branch Owner owns branch OR user is Brand Owner)
function ownsBranch(branchId) {
  return isBrandOwner() ||
    (isBranchOwner() && get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.branchId == branchId);
}

// Chat pair verification (pairId format: branchId_brandOwnerId)
function isChatParticipant(pairId) {
  return isBrandOwner() ||
    (isBranchOwner() && pairId.matches('^' + get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.branchId + '_.*$'));
}
```
