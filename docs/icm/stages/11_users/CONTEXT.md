# Stage 11: User & Staff Administration

> **Layer 2 Stage Contract**: Staff directory, role assignments (Brand Owner, Regional Manager, Branch Operator), branch access mapping, and audit logging.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../references/rbac.md`
- **Layer 3 (Reference)**: `../../_config/coding_standards.md`
- **Layer 4 (Working)**: `../10_branches/output/stage_summary.md`

---

## 2. ## Process
1. Build Staff User Directory table (filtered for Brand Owners).
2. Create "Invite Staff / Add User" modal:
   - Full Name, Email, Phone
   - Role selection dropdown (`regional_manager`, `branch_owner`)
   - Branch mapping (Select assigned branches)
   - City mapping (Select assigned cities for regional managers)
3. Implement deactivate user / revoke access controls.

---

## 3. ## Outputs
- `burgonomics-partner/src/pages/Users.tsx`
- `burgonomics-partner/src/components/users/UserList.tsx`
- `burgonomics-partner/src/components/users/AddUserModal.tsx`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Verify that role assignments sync correctly with Firestore security rules.
