# Stage 08: Menu Management & Petpooja Catalog Sync

> **Layer 2 Stage Contract**: Category hierarchies, burger customization options, pricing, item availability toggles, and manual/automated Petpooja menu sync.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../references/petpooja_pos.md`
- **Layer 3 (Reference)**: `../../references/image_storage.md`
- **Layer 3 (Reference)**: `../../_config/design_system.md`
- **Layer 4 (Working)**: `../07_tickets/output/stage_summary.md`

---

## 2. ## Process
1. Build Menu Management UI with category filtering (Burgers, Sides, Beverages, Desserts).
2. Implement branch-level item stock toggle (Mark In Stock / Out of Stock instantly in Firestore).
3. Build manual "Sync Menu from Petpooja" trigger button for Brand Owners.
4. Implement item detail drawer showing POS mapping ID (`petpoojaItemId`), modifiers, and Cloud Storage image URL.

---

## 3. ## Outputs
- `burgonomics-partner/src/pages/Menu.tsx`
- `burgonomics-partner/src/components/menu/MenuItemCard.tsx`
- `burgonomics-partner/src/components/menu/CategoryTabs.tsx`
- `burgonomics-partner/src/components/menu/SyncMenuButton.tsx`
- `burgonomics-partner/netlify/functions/sync-menu.ts`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Verify menu schema compatibility with Customer App menu parser.
