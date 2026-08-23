# Stage 09: Revenue Analytics & Operational Reporting

> **Layer 2 Stage Contract**: Sales trends, top-selling items velocity, peak order hours heatmap, revenue breakdown, and branch performance comparisons.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../_config/design_system.md`
- **Layer 3 (Reference)**: `../../references/firestore_schema.md`
- **Layer 3 (Reference)**: `../../references/rbac.md`
- **Layer 4 (Working)**: `../08_menu/output/stage_summary.md`

---

## 2. ## Process
1. Build comprehensive Analytics Dashboard with date range selectors (Today, 7D, 30D, Custom).
2. Implement visual analytics components:
   - Revenue & Order Volume chart over time
   - Top Selling Items velocity ranking
   - Hourly Heatmap (Peak order times)
   - Order Mode breakdown (Delivery vs Takeaway vs Dine-In)
   - Payment method breakdown (Razorpay vs COD vs UPI)
3. Ensure brand owners can compare metrics across all branches side-by-side.

---

## 3. ## Outputs
- `burgonomics-partner/src/pages/Analytics.tsx`
- `burgonomics-partner/src/components/analytics/RevenueChart.tsx`
- `burgonomics-partner/src/components/analytics/TopItems.tsx`
- `burgonomics-partner/src/components/analytics/HourlyHeatmap.tsx`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Assert chart components follow the 60-30-10 palette tokens and render smoothly.
