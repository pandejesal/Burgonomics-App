# Stage 03: Authentication & Role-Based Access Control

> **Layer 2 Stage Contract**: Firebase Authentication, Phone OTP, Email/Password sign-in, Role Claims, Auth Guards, and Role Context.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../references/rbac.md`
- **Layer 3 (Reference)**: `../../references/firestore_schema.md`
- **Layer 3 (Reference)**: `../../_config/coding_standards.md`
- **Layer 4 (Working)**: `../02_firebase_firestore/output/stage_summary.md`

---

## 2. ## Process
1. Implement Firebase Auth state observer in `src/core/auth/AuthContext.tsx`.
2. Support dual sign-in paradigms:
   - Phone + OTP authentication (Primary for Customer App).
   - Email + Password + Role session (Primary for Partner App).
3. Build route protection guards (`ProtectedRoute.tsx`, `RoleGuard.tsx`) that filter views based on `user.role` (`brand_owner`, `regional_manager`, `branch_owner`).
4. Implement profile loading and branch association sync upon login.

---

## 3. ## Outputs
- `burgonomics-partner/src/core/auth/AuthContext.tsx`
- `burgonomics-partner/src/core/auth/ProtectedRoute.tsx`
- `burgonomics-partner/src/components/auth/LoginForm.tsx`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit
```
- Assert route guards redirect unauthorized roles cleanly.
- Verify role permissions map to `references/rbac.md`.
