# BURGONOMICS — Layer 1: Workspace Task Router

> **Interpretable Context Methodology (ICM) — Layer 1 Task Router**  
> Read this file to determine which Stage Contract to execute and which Layer 3 references apply.
> **Active Backend Roadmap**: The execution sequence in `00_BACKEND_WEEK_PLAN.md` (`07a` ✅ `c493c4b` → `07b` → `03+08` → `01` → `02+09` → `04+09` → `05` → `09` wk2 → `06`) governs backend delivery.

---

## 1. Stage Routing Matrix

Identify your current goal and open the designated Stage Contract:

| # | Stage Directory | Focus Area | Stage Contract | Key Layer 3 References & Authoritative Grill Specs |
|---|---|---|---|---|
| **01** | `stages/01_project_setup/` | Tooling, monorepo configs, env vars, Capacitor setup | [01 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/01_project_setup/CONTEXT.md) | `_config/architecture_overview.md`, `_config/deployment_strategy.md` |
| **02** | `stages/02_firebase_firestore/` | Collections, security rules, indexes, client SDK | [02 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/02_firebase_firestore/CONTEXT.md) | `references/firestore_schema.md`, `references/rbac.md`, `08_CRM_RULES_FINAL_SPEC.md` |
| **03** | `stages/03_auth_roles/` | Phone/Email Auth, RBAC token claims, guards | [03 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/03_auth_roles/CONTEXT.md) | `references/rbac.md`, `_config/coding_standards.md` |
| **04** | `stages/04_dashboard/` | Executive stats, branch performance, live cards | [04 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/04_dashboard/CONTEXT.md) | `_config/design_system.md`, `references/rbac.md` |
| **05** | `stages/05_orders/` | Order creation, state machine, POS push, Porter | [05 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/05_orders/CONTEXT.md) | `references/order_flow.md`, `references/petpooja_pos.md`, `references/delivery_porter.md`, `09_BACKEND_FINAL_SPEC.md` |
| **06** | `stages/06_customers/` | Customer CRM, global loyalty, order history | [06 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/06_customers/CONTEXT.md) | `references/firestore_schema.md`, `08_CRM_RULES_FINAL_SPEC.md` |
| **07** | `stages/07_tickets/` | Unified support ticketing (customer & branch), 24h SLA | [07 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/07_tickets/CONTEXT.md) | `references/ticketing.md`, `references/rbac.md` |
| **08** | `stages/08_menu/` | Menu categories, items, modifiers, Petpooja sync | [08 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/08_menu/CONTEXT.md) | `references/petpooja_pos.md`, `09_BACKEND_FINAL_SPEC.md` |
| **09** | `stages/09_analytics/` | Sales reports, peak hours, item velocity, charts | [09 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/09_analytics/CONTEXT.md) | `_config/design_system.md`, `references/firestore_schema.md` |
| **10** | `stages/10_branches/` | Dynamic branches, upcoming branches, FCM subscriptions | [10 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/10_branches/CONTEXT.md) | `references/scaling_architecture.md`, `references/push_notifications.md`, `GRILL_DECISIONS_2026-08-23.md` |
| **11** | `stages/11_users/` | Staff management, role assignments, audit logs | [11 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/11_users/CONTEXT.md) | `references/rbac.md`, `_config/coding_standards.md` |
| **12** | `stages/12_settings_notifications/` | FCM push notifications, 1:1 DMs (chats/{pairId}) | [12 CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/stages/12_settings_notifications/CONTEXT.md) | `references/push_notifications.md`, `references/firestore_schema.md`, `references/rbac.md` |

---

## 2. Layer 3 Index (Factory Configuration & Domain Specs)

### Global Factory Rules (`_config/`)
- [project_context.md](file:///c:/Users/DELL/Desktop/Burgonomics/_config/project_context.md) — Product background, business logic, core stack.
- [design_system.md](file:///c:/Users/DELL/Desktop/Burgonomics/_config/design_system.md) — La Pino'z 60-30-10 palette tokens, typography scale, component design.
- [coding_standards.md](file:///c:/Users/DELL/Desktop/Burgonomics/_config/coding_standards.md) — TypeScript, WCAG 2.2 AA a11y, Zod, error handling.
- [architecture_overview.md](file:///c:/Users/DELL/Desktop/Burgonomics/_config/architecture_overview.md) — Two-app architecture, Firestore + POS data flow.
- [agent_protocols.md](file:///c:/Users/DELL/Desktop/Burgonomics/_config/agent_protocols.md) — Git workflow, stage review gates, edit-source debugging.
- [deployment_strategy.md](file:///c:/Users/DELL/Desktop/Burgonomics/_config/deployment_strategy.md) — Capacitor mobile builds, Netlify functions, Firebase rules.

### Domain Reference Specifications (`references/`)
- [firestore_schema.md](file:///c:/Users/DELL/Desktop/Burgonomics/references/firestore_schema.md) — Firestore data model, collections, chats, upcoming branches.
- [petpooja_pos.md](file:///c:/Users/DELL/Desktop/Burgonomics/references/petpooja_pos.md) — Petpooja POS bridge, hourly sync, webhook callbacks.
- [delivery_porter.md](file:///c:/Users/DELL/Desktop/Burgonomics/references/delivery_porter.md) — Porter delivery integration, HMAC webhook, margin reconciliation.
- [rbac.md](file:///c:/Users/DELL/Desktop/Burgonomics/references/rbac.md) — Role hierarchy (Brand, Regional, Branch, Customer) & helper rules.
- [ticketing.md](file:///c:/Users/DELL/Desktop/Burgonomics/references/ticketing.md) — Unified ticketing lifecycle & 24h SLAs.
- [order_flow.md](file:///c:/Users/DELL/Desktop/Burgonomics/references/order_flow.md) — Delivery, Takeaway, and Dine-In lifecycle states.
- [push_notifications.md](file:///c:/Users/DELL/Desktop/Burgonomics/references/push_notifications.md) — 5 FCM topics, sw.js, background push dispatch.
- [image_storage.md](file:///c:/Users/DELL/Desktop/Burgonomics/references/image_storage.md) — Cloud Storage paths, CDN caching, WebP optimization.
- [scaling_architecture.md](file:///c:/Users/DELL/Desktop/Burgonomics/references/scaling_architecture.md) — Dynamic multi-branch scaling without code changes.

### Authoritative Backend Grill Specs (`burgonomics-foundation-core/docs/antigravity/`)
- [00_BACKEND_WEEK_PLAN.md](file:///c:/Users/DELL/Desktop/Burgonomics/burgonomics-foundation-core/docs/antigravity/00_BACKEND_WEEK_PLAN.md) — Active execution roadmap.
- [GRILL_DECISIONS_2026-08-23.md](file:///c:/Users/DELL/Desktop/Burgonomics/burgonomics-foundation-core/docs/antigravity/GRILL_DECISIONS_2026-08-23.md) — Locked grill ledger (Q1–Q10).
- [08_CRM_RULES_FINAL_SPEC.md](file:///c:/Users/DELL/Desktop/Burgonomics/burgonomics-foundation-core/docs/antigravity/08_CRM_RULES_FINAL_SPEC.md) — CRM hierarchy & rules matrix.
- [09_BACKEND_FINAL_SPEC.md](file:///c:/Users/DELL/Desktop/Burgonomics/burgonomics-foundation-core/docs/antigravity/09_BACKEND_FINAL_SPEC.md) — Petpooja truth, Porter, FCM, and DON'T WANTs.
