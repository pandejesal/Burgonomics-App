# Stage 06: Customer Relationship Management (CRM)

> **Layer 2 Stage Contract**: Customer profiles, lifetime value (LTV) metrics, saved address books, order frequency, and loyalty points.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../references/firestore_schema.md`
- **Layer 3 (Reference)**: `../../_config/design_system.md`
- **Layer 4 (Working)**: `../05_orders/output/stage_summary.md`

---

## 2. ## Process
1. Build Customer directory table with search, phone lookup, and order frequency sorting.
2. Build Customer 360 profile view displaying:
   - Order history timeline
   - Total spend and Average Order Value (AOV)
   - Loyalty points balance
   - Associated delivery addresses
   - Raised support tickets
3. Implement export to CSV functionality for marketing campaigns.

---

## 3. ## Outputs
- `burgonomics-partner/src/pages/Customers.tsx`
- `burgonomics-partner/src/components/customers/CustomerList.tsx`
- `burgonomics-partner/src/components/customers/CustomerProfileModal.tsx`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Verify customer search filter performance and responsive mobile table rendering.
