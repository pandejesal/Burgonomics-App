# BURGONOMICS — Order Flow Lifecycle & State Machine (Layer 3 Constraint)

> **Reference Specification**: State machines and data transitions for Delivery, Takeaway, and Dine-In orders.

---

## 1. 🔄 Order State Machine

```
[pending] 
   │
   ├─► (Branch / POS Accept) ────────► [accepted]
   │                                       │
   │                                       ▼
   │                                  [preparing]
   │                                       │
   │                                       ▼
   │                                   [ready]
   │                                       │
   ├─► Delivery: (Porter Dispatch) ───► [out_for_delivery] ──► [delivered]
   │
   ├─► Takeaway / Dine-in: (Pickup) ──────────────────────────► [delivered]
   │
   └─► (Cancellation by user/branch) ─────────────────────────► [cancelled]
```

---

## 2. 🍔 Order Modes & Invariants
1. **Delivery**: Requires verified GPS coordinates + street address. Triggers Porter API or manual driver dispatch upon reaching `ready`.
2. **Takeaway**: Customer pickup at counter. Notifies customer with pickup code when `ready`.
3. **Dine-In**: Requires `tableNumber` or counter seat assignment. Bypasses delivery fees.

---

## 3. 💳 Payment Flow
- **Razorpay (Prepaid)**: Order initialized in `paymentStatus: 'pending'`. Upon webhook verification, transitions to `completed` and pushes order to Petpooja KOT.
- **COD / Cash**: Order placed directly with `paymentStatus: 'pending'`, settled at counter/doorstep.
