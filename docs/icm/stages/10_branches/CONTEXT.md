# Stage 10: Dynamic Branch Provisioning & Upcoming Branches

> **Layer 2 Stage Contract**: Branch creation wizard, Upcoming branch lifecycle (`active` | `upcoming` | `paused`), FCM topic subscriptions, geofencing, operating hours, and POS credentials config.
> **Locked Grill Directives (Q6, Q10)**: Brand Owner-only creation (`isBrandOwner()`), customer "Notify Me" subscription to `upcoming_{branchId}`, and subscriber count tracking.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../references/firestore_schema.md`
- **Layer 3 (Reference)**: `../../references/push_notifications.md`
- **Layer 3 (Reference)**: `../../references/scaling_architecture.md`
- **Layer 3 (Reference)**: `../../references/rbac.md`
- **Layer 4 (Working)**: `../09_analytics/output/stage_summary.md`

---

## 2. ## Process
1. Build Branch Management directory (visible to Brand Owner).
2. Create "Add New Branch" modal wizard with Brand Owner authorization guard (`isBrandOwner()`):
   - Branch Name, City, Address, Phone, Geocoordinates.
   - **Branch Status Selector**: `active` | `upcoming` | `paused`.
   - **Expected Opening Date**: e.g. `2026-09-15` (for `upcoming` status).
   - **Logistics Feature Toggle**: `features.porterEnabled` (default: false).
   - **Petpooja POS Credentials**: `appKey`, `appSecret`, `accessToken`, `restId`.
3. Implement Customer App "Notify Me" flow for upcoming branches:
   - Clicking "Notify Me" creates a document in `upcoming_subscriptions/{uid}_{branchId}`.
   - Subscribes the device to FCM topic `upcoming_{branchId}`.
4. Display live subscriber count badge on the branch card in Partner App.

---

## 3. ## Outputs
- `burgonomics-partner/src/pages/Branches.tsx`
- `burgonomics-partner/src/components/branches/BranchCard.tsx`
- `burgonomics-partner/src/components/branches/AddBranchModal.tsx`
- `burgonomics-foundation-core/src/features/branches/hooks/useUpcomingBranchSubscription.ts`
- `burgonomics-foundation-core/src/features/branches/components/UpcomingBranchCard.tsx`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Assert that only `brand_owner` can create or modify upcoming branches.
- Verify FCM topic naming format `upcoming_{branchId}`.
