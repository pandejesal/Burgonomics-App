# Stage 05: Orders Pipeline, POS Push & Delivery Dispatch

> **Layer 2 Stage Contract**: Order lifecycle management, Kanban pipeline, Petpooja POS bridge push, Porter rider dispatch, and manual driver fallback.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../references/order_flow.md`
- **Layer 3 (Reference)**: `../../references/petpooja_pos.md`
- **Layer 3 (Reference)**: `../../references/delivery_porter.md`
- **Layer 3 (Reference)**: `../../_config/design_system.md`
- **Layer 4 (Working)**: `../04_dashboard/output/stage_summary.md`

---

## 2. ## Process
1. Build interactive Order Management UI with status tabs / Kanban lanes:
   - `pending` -> `accepted` -> `preparing` -> `ready` -> `out_for_delivery` -> `delivered` / `cancelled`.
2. Connect Petpooja order push trigger on order acceptance (`netlify/functions/push-order-to-petpooja.ts`).
3. Connect Porter API auto-dispatch when order transitions to `ready` for delivery orders.
4. Implement Manual Delivery Fallback modal allowing branch operators to assign local rider name & phone number.
5. Provide audible alert on incoming new `pending` orders.

---

## 3. ## Outputs
- `burgonomics-partner/src/pages/Orders.tsx`
- `burgonomics-partner/src/components/orders/OrderCard.tsx`
- `burgonomics-partner/src/components/orders/OrderDetailModal.tsx`
- `burgonomics-partner/src/components/orders/ManualDeliveryModal.tsx`
- `burgonomics-partner/netlify/functions/push-order-to-petpooja.ts`
- `burgonomics-partner/netlify/functions/dispatch-delivery.ts`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Assert status transitions strictly follow `references/order_flow.md`.
- Verify Petpooja payload mappings and Porter error fallback logic.
