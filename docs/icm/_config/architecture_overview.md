# BURGONOMICS — Architecture Overview (Layer 3 Constraint)

> **Factory Configuration**: Ecosystem architecture, two-app topology, POS pricing bridge, and direct messaging topology.
> **Locked Grill Directives (Q1–Q10)**: Petpooja is pricing truth, Firestore is single CRM, Porter is production delivery, and 1:1 chat pairs.

---

## 1. Two-App Architecture Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        BURGONOMICS ECOSYSTEM                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐          ┌──────────────────┐            │
│  │  CUSTOMER APP    │          │  PARTNER APP     │            │
│  │  (Capacitor)     │          │  (Capacitor)     │            │
│  │                  │          │                  │            │
│  │  - Order Flow    │          │  - Live Pipeline │            │
│  │  - Menu & Mod    │          │  - 1:1 DMs (≤2)  │            │
│  │  - Track Order   │          │  - Unified Tkt   │            │
│  │  - Global Loyalty│          │  - Analytics     │            │
│  └────────┬─────────┘          └────────┬─────────┘            │
│           │                             │                       │
│           └──────────┬──────────────────┘                       │
│                      │                                          │
│                      ▼                                          │
│           ┌──────────────────┐                                  │
│           │  FIRESTORE       │                                  │
│           │  (Single CRM DB) │                                  │
│           │  Role-Based ACL  │                                  │
│           └────────┬─────────┘                                  │
│                    │                                            │
│          ┌─────────┴─────────┐                                  │
│          │                   │                                  │
│          ▼                   ▼                                  │
│  ┌──────────────┐   ┌──────────────┐                            │
│  │  PETPOOJA    │   │  PORTER      │                            │
│  │  POS API     │   │  DELIVERY    │                            │
│  │  (Live Truth)│   │  API         │                            │
│  └──────────────┘   └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Decisions

1. **Pricing — Petpooja is Truth**: Item MRP pulled from Petpooja API (`qle1yy2ydc`/`47pfzh5sf2`) when `PETPOOJA_ENABLED=true`. Firestore is cached fallback with `PRICING_FALLBACK` banner.
2. **CRM — Firestore is Single CRM**: All customer profiles, global loyalty points, orders, and unified tickets live in Firestore. Petpooja is POS bridge only.
3. **Delivery — Porter for Production**: Real Porter order creation and HMAC webhook tracking for delivery orders (gated by `features.porterEnabled`).
4. **Direct Messaging (1:1 DMs)**: Branch Owner ↔ Brand Owners (Yash and Nehh) pair-scoped rooms in `chats/{pairId}/messages` (`onSnapshot` + FCM `chat_{pairId}`).
5. **FCM Notifications**: Web & native push via 5 standard topics (`order_{id}`, `branch_{id}`, `brand`, `chat_{pairId}`, `upcoming_{branchId}`).
6. **Backend Execution Sequence**: `00_BACKEND_WEEK_PLAN.md` sequence (`07a` -> `07b` -> `03+08` -> `01` -> `02+09` -> `04+09` -> `05` -> `09` wk2 -> `06`) governs backend delivery.
