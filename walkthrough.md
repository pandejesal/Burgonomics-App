# BURGONOMICS — ICM & Locked Grill Reconciliation Walkthrough

This repository has fully reconciled the **Interpretable Context Methodology (ICM)** (arXiv:2603.16021v2) with the 10 locked grill decisions (Q1–Q10).

---

## 🏛️ 5-Layer Context Hierarchy Implemented

```
burgonomics-foundation-core/docs/icm/
├── GEMINI.md                   <- Layer 0: Global Identity & Core Directives (~450 tok)
├── AGENTS.md                   <- Layer 0: Entrypoint Router
├── CONTEXT.md                  <- Layer 1: Workspace Task Router (12 stages + Grill Specs)
│
├── _config/                    <- Layer 3: Global Factory Constraints (Rules, Conventions)
│   ├── project_context.md      <- Product overview & tech stack
│   ├── design_system.md        <- La Pino'z 60-30-10 palette tokens & WCAG AAA contrast
│   ├── coding_standards.md     <- TypeScript strictness, WCAG 2.2 AA, Zod validation
│   ├── architecture_overview.md<- Two-app architecture, Petpooja truth, single CRM DB
│   ├── agent_protocols.md      <- Git flow, review gates, edit-source debugging
│   └── deployment_strategy.md  <- Netlify functions & Capacitor builds
│
├── references/                 <- Layer 3: Domain Reference Specs (Internalized as Constraints)
│   ├── firestore_schema.md     <- Chats, upcoming branches, global loyalty, branch-scoped sales
│   ├── petpooja_pos.md         <- POS bridge, sync, callbacks
│   ├── delivery_porter.md      <- Logistics API, HMAC webhook, margin reconciliation
│   ├── rbac.md                 <- Role permissions matrix (isBrandOwner, ownsBranch, isChatParticipant)
│   ├── ticketing.md            <- Unified single tickets collection & 24h SLA badges
│   ├── order_flow.md           <- Delivery/Takeaway/Dine-in state machines
│   ├── push_notifications.md   <- 5 FCM topics, sw.js, background notify.ts
│   ├── image_storage.md        <- Storage layout & WebP rules
│   └── scaling_architecture.md <- Dynamic branch scaling
│
└── stages/                     <- Layer 2: Stage Contracts & Layer 4: Working Artifacts
    ├── 01_project_setup/       <- CONTEXT.md + output/stage_summary.md
    ├── 02_firebase_firestore/  <- CONTEXT.md + output/stage_summary.md
    ├── 03_auth_roles/          <- CONTEXT.md + output/stage_summary.md
    ├── 04_dashboard/           <- CONTEXT.md + output/stage_summary.md
    ├── 05_orders/              <- CONTEXT.md + output/stage_summary.md
    ├── 06_customers/           <- CONTEXT.md + output/stage_summary.md
    ├── 07_tickets/             <- CONTEXT.md (Unified tickets, 24h SLA, DMs in Stage 12)
    ├── 08_menu/                <- CONTEXT.md + output/stage_summary.md
    ├── 09_analytics/           <- CONTEXT.md + output/stage_summary.md
    ├── 10_branches/            <- CONTEXT.md (Upcoming branch wizard & FCM subscriptions)
    ├── 11_users/               <- CONTEXT.md + output/stage_summary.md
    └── 12_settings_notifications/ <- CONTEXT.md (1:1 DMs onSnapshot + FCM, no overhead)
```

---

## 🔒 Locked Grill Directives Encoded

| Ref # | Grill Item | Resolution / Spec Location |
|---|---|---|
| **Q1** | **Design System** | `_config/design_system.md`: `#F5F5F5` light canvas / `#0A0A0A` dark canvas, `#0E4825` 30% Forest Green in both, `#FF6600` light accent / `#CC5200` dark accent, `#4ADE80` WCAG AAA text on dark. |
| **Q2** | **Logistics** | `references/delivery_porter.md`: Porter for production (`api.porter.in`), feature flag `features.porterEnabled: false` default. |
| **Q3 & Q4** | **1:1 DMs & Equality** | `references/firestore_schema.md` & `stages/12`: Branch Owner ↔ Brand Owners (Yash and Nehh) 1:1 pairs only in `chats/{pairId}`. Both brand owners equal. |
| **Q5 & Q9** | **Tickets & SLA** | `references/ticketing.md` & `stages/07`: Single unified collection, `raisedBy: 'customer' | 'branch_owner'`, first-assign, 24h SLA badge. |
| **Q6 & Q10** | **Upcoming Branches** | `stages/10` & `references/firestore_schema.md`: `status: "active" | "upcoming" | "paused"`, `expectedOpenDate`, `upcoming_{branchId}` FCM topic, `upcoming_subscriptions/{uid}_{branchId}`, creatable strictly by `isBrandOwner()`. |
| **Q7 & Q8** | **Chat Mechanics** | `stages/12`: `onSnapshot` + FCM `chat_{pairId}` via `notify.ts`, optional orderId/ticketId chips. Zero typing/presence/read receipts overhead. |
| **Grill 15** | **Loyalty & Sales** | `references/firestore_schema.md`: `Customer.loyaltyPoints` is GLOBAL brand-wide. Sales and `orders` are branch-scoped (`branchId`). |
| **Grill 16** | **DON'T WANTs** | Grep `kitchen_orders = 0`, grep `walletBalance = 0`, grep `ioredis|bull|ws = 0`. |
| **Grill 14** | **Roadmap Order** | `CONTEXT.md` & `_config/agent_protocols.md`: `00_BACKEND_WEEK_PLAN.md` sequence (`07a` ✅ `c493c4b` → `07b` → `03+08` → `01` → `02+09` → `04+09` → `05` → `09` wk2 → `06`) is active. |
| **Envs** | **Toggles** | `PETPOOJA_ENABLED=false` default until live creds land; `VITE_API_BASE=https://burgonomics.netlify.app`. |
