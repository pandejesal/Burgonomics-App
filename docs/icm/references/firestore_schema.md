# BURGONOMICS — Firestore Schema & Security (Layer 3 Constraint)

> **Reference Specification**: Single source of truth for Firestore database collections, TypeScript interfaces, security rules, indexes, and relations.
> **Locked Grill Directives (Q1–Q10)**: Strict adherence to unified collections, global loyalty, branch-scoped sales, 1:1 chat pairs, upcoming branches, and DON'T WANT guards.

---

## 1. Collections Hierarchy

```
/firestore
  /branches/{branchId}
  /upcoming_subscriptions/{subscriptionId}   <- {uid}_{branchId}
  /customers/{customerId}
  /orders/{orderId}
  /tickets/{ticketId}
  /chats/{pairId}/messages/{messageId}       <- {branchId}_{brandOwnerId}
  /menu/{branchId}/categories/{categoryId}
  /menu/{branchId}/items/{itemId}
  /users/{userId}
  /paymentAudits/{auditId}
```

---

## 2. Core Entity Schemas & Interfaces

### `branches/{branchId}`
```typescript
interface Branch {
  name: string;                    // "Burgonomics Ahmedabad Central"
  city: string;                    // "Ahmedabad"
  address: string;                 // "123 Main Road, Navrangpura"
  phone: string;                   // "+919876543210"
  status: 'active' | 'upcoming' | 'paused'; // Q6: Active, Upcoming, or Temporarily Paused
  expectedOpenDate?: string;       // "2026-09-15" (for upcoming branches)
  active: boolean;                 // true when status == 'active'
  coordinates: {
    lat: number;                   // 23.0225
    lng: number;                   // 72.5714
  };
  operatingHours: {
    open: string;                  // "09:00"
    close: string;                 // "23:00"
  };
  features: {
    porterEnabled: boolean;        // Q2: Porter logistics flag (default: false per branch)
  };
  petpoojaCredentials?: {
    appKey: string;
    appSecret: string;
    accessToken: string;
    restId: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `upcoming_subscriptions/{subscriptionId}`
> Document ID format: `{uid}_{branchId}` (Q10: Customer "Notify Me" opt-in for upcoming branches)
```typescript
interface UpcomingSubscription {
  uid: string;                     // Customer auth UID
  branchId: string;                // Target upcoming branch ID
  createdAt: Timestamp;
}
```

### `customers/{customerId}`
```typescript
interface Customer {
  name: string;
  phone: string;
  email: string;
  photoUrl?: string;
  addresses: Address[];
  loyaltyPoints: number;           // GLOBAL: Brand-wide balance, earn/redeem across all branches (Q10/Grill 15)
  totalOrders: number;             // GLOBAL: Lifetime order count across all branches
  fcmToken?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Address {
  id: string;
  label: 'Home' | 'Work' | 'Other';
  full: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}
```

### `orders/{orderId}`
> **Scope**: Sales & orders are strictly **branch-scoped** (`branchId`). Branch operators see own branch orders only; Brand owners see all.
```typescript
interface Order {
  customerId: string;
  customerName: string;
  customerPhone: string;
  branchId: string;                // Branch-scoped identifier
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  orderType: 'delivery' | 'takeaway' | 'dinein';
  deliveryAddress?: Address;       // Required for delivery
  tableNumber?: string;            // Required for dinein
  status: OrderStatus;
  paymentMethod: 'razorpay' | 'cod' | 'upi';
  paymentStatus: 'pending' | 'completed' | 'failed';
  petpoojaOrderId?: string;        // "PO12345" after POS sync
  porter?: {                       // Q2: Porter delivery integration
    orderId?: string;              // Porter delivery tracking ID
    cost?: number;                 // Porter delivery cost (₹40-80) for margin reconciliation
    status?: string;               // 'dispatched' | 'no_riders' | 'delivered'
  };
  deliveryStatus?: 'dispatched' | 'no_riders_available' | 'manually_assigned';
  specialInstructions?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';
```

### `tickets/{ticketId}`
> **Unified Single Collection** (Q5/Q9): Single ticket collection for both customer disputes and branch operations. First-assign, no auto-split, 24h SLA badge.
```typescript
interface Ticket {
  customerId?: string;             // Present if customer-raised ticket
  branchId: string;                // Scoped branch
  raisedBy: 'customer' | 'branch_owner'; // Q5: Unified ticket originator
  type: TicketType;
  message: string;
  orderId?: string;                // Linked order if dispute relates to specific order
  status: TicketStatus;
  assignedTo?: string;             // Brand owner or branch operator UID (first-assign)
  resolution?: string;
  attachments?: string[];          // Cloud Storage photo URLs
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type TicketType = 'wrong_item' | 'late_delivery' | 'quality' | 'payment' | 'maintenance' | 'supply' | 'equipment' | 'other';
type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
```

### `chats/{pairId}/messages/{messageId}`
> **Direct Messaging (DM) Pairs** (Q3, Q4, Q7, Q8):
> - Pair ID format: `{branchId}_{brandOwnerId}` (e.g. `branch1_Yash`, `branch1_Nehh`).
> - ≤ 2 chat rooms per branch. No branch ↔ branch rooms. No brand-only chat rooms.
> - Both Brand Owners (Yash and Nehh) are equal.
```typescript
interface ChatMessage {
  id: string;
  pairId: string;                  // `${branchId}_${brandOwnerId}`
  senderId: string;                // UID of sender
  senderRole: 'branch_owner' | 'brand_owner';
  text: string;
  orderId?: string;                // Optional reference chip
  ticketId?: string;               // Optional reference chip
  createdAt: Timestamp;
}
```

### `paymentAudits/{auditId}`
```typescript
interface PaymentAudit {
  paymentId: string;
  orderId: string;
  branchId: string;
  expectedAmount: number;
  paidAmount: number;
  delta: number;
  webhookId: string;
  createdAt: Timestamp;
}
```

---

## 3. 🚫 Permanent DON'T WANT Invariants (Grill 16 & Spec 09)
1. **NO SECOND POS / KOT DUPLICATION**: `grep "kitchen_orders"` must be 0. `orders` is the single order collection. `petpoojaOrderId` is stored directly on the order document.
2. **NO IN-APP WALLET**: `grep "walletBalance"` must be 0. Razorpay handles payment methods. `loyaltyPoints` is the only reward balance.
3. **NO REDIS / BULLMQ / CUSTOM WEBSOCKETS**: `grep "ioredis|bull|ws"` must be 0. Firestore `onSnapshot` is the real-time layer; Firebase Cloud Messaging (FCM) is the push layer.
