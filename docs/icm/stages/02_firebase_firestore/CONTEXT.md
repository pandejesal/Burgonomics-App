# Stage 02: Firebase & Firestore Data Layer

> **Layer 2 Stage Contract**: Firestore initialization, typed collections, security rules, indexes, and database service wrappers.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../references/firestore_schema.md`
- **Layer 3 (Reference)**: `../../references/rbac.md`
- **Layer 3 (Reference)**: `../../_config/coding_standards.md`
- **Layer 4 (Working)**: `../01_project_setup/output/stage_summary.md`

---

## 2. ## Process
1. Configure Firebase client SDK instance in `src/core/firebase/config.ts`.
2. Define TypeScript interfaces for all Firestore entities (`Branch`, `Customer`, `Order`, `Ticket`, `MenuItem`, `User`) in `src/types/firestore.ts`.
3. Implement strongly typed CRUD services in `src/services/` (`branches.ts`, `orders.ts`, `tickets.ts`, `menu.ts`).
4. Write and validate `firestore.rules` enforcing role-based isolation (Brand Owner, Regional Manager, Branch Operator, Customer).
5. Generate `firestore.indexes.json` for compound queries (e.g. `branchId + status + createdAt`).

---

## 3. ## Outputs
- `burgonomics-partner/src/core/firebase/config.ts`
- `burgonomics-partner/src/types/firestore.ts`
- `burgonomics-partner/src/services/firestore/*.ts`
- `burgonomics-partner/firestore.rules`
- `burgonomics-partner/firestore.indexes.json`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit
```
- Validate that all Firestore interfaces export without type conflicts.
- Ensure `firestore.rules` syntax passes Firebase CLI validation.
