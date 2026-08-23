# BURGONOMICS — Project Context (Layer 3 Constraint)

> **Factory Configuration**: Product identity, business model, and high-level tech stack.

---

## 1. Product Summary
Burgonomics is a next-generation Quick-Service Restaurant (QSR) direct-ordering and franchise operations platform built for gourmet burger chains.

### Core Ecosystem
1. **Customer App (`burgonomics-foundation-core`)**:
   - High-craft mobile (Capacitor iOS/Android) and web ordering experience.
   - Interactive visual burger customizer, geolocated branch selection, real-time order tracking.
2. **Partner/Franchise App (`burgonomics-partner`)**:
   - Operational dashboard for Brand Owners, Regional Managers, and Branch Operators.
   - Real-time order pipeline, Petpooja POS sync, Porter delivery dispatch, hierarchical ticketing CRM, live revenue analytics.

---

## 2. Core Tech Stack
- **Frontend Framework**: React 18 / 19 + TypeScript + Vite
- **Mobile Engine**: Capacitor 6+ (Native Android & iOS bridges)
- **Styling**: Vanilla CSS / Tailwind with semantic tokens (Strict 60-30-10 Dark Palette)
- **State Management**: TanStack Query v5 (Server cache), Zustand (Client UI state)
- **Database & Auth**: Firebase Firestore + Firebase Authentication + Firebase Cloud Storage
- **Backend / Edge**: Netlify Functions (TypeScript serverless functions for POS/Delivery bridges)
- **External Integrations**:
  - **POS**: Petpooja POS API (Menu pull, Order push, Status webhooks)
  - **Logistics**: Porter On-Demand Delivery API (with manual fleet fallback)
  - **Notifications**: Firebase Cloud Messaging (FCM)

---

## 3. Fundamental Invariants
- **Firestore is the Single Source of Truth**: All app state, orders, and tickets live in Firestore. External POS systems (Petpooja) sync to/from Firestore.
- **Strict Role Isolation**: Operations are compartmentalized by Brand, Region, Branch, and Customer.
- **Offline Resilience & Fast UI**: Optimistic UI updates with TanStack Query caching.
