# Stage 04: Partner Operational Dashboard

> **Layer 2 Stage Contract**: Executive metrics, branch performance cards, live order stream widgets, open ticket alerts, and quick actions.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../_config/design_system.md`
- **Layer 3 (Reference)**: `../../references/rbac.md`
- **Layer 3 (Reference)**: `../../_config/coding_standards.md`
- **Layer 4 (Working)**: `../03_auth_roles/output/stage_summary.md`

---

## 2. ## Process
1. Build executive stat cards (Total Revenue, Active Orders, SLA Breaches, Average Prep Time).
2. Create role-adaptive views:
   - **Brand Owner**: Aggregated multi-city performance + branch comparison list.
   - **Regional Manager**: Filtered city overview.
   - **Branch Operator**: Single branch real-time order queue + pending alerts.
3. Integrate live order counter badges and direct navigation quick actions.
4. Style strictly according to the 60-30-10 Dark Mode design system tokens.

---

## 3. ## Outputs
- `burgonomics-partner/src/pages/Dashboard.tsx`
- `burgonomics-partner/src/components/dashboard/StatCards.tsx`
- `burgonomics-partner/src/components/dashboard/LiveOrderStream.tsx`
- `burgonomics-partner/src/components/dashboard/BranchOverview.tsx`
- `output/stage_summary.md` -> Stage verification summary

---

## 4. ## Verify
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Assert no hardcoded color tokens; verify contrast compliance.
- Confirm dashboard renders correctly across desktop and mobile viewports.
