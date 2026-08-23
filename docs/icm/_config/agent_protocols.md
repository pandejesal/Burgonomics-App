# BURGONOMICS — Agent Protocols & Edit-Source Workflows (Layer 3 Constraint)

> **Factory Configuration**: Protocols for agent execution, git branching, verification gates, and the Edit-Source debugging cycle.

---

## 1. 🔄 Interpretable Context Operating Flow
1. **Identify Task Stage**: Read [CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/CONTEXT.md) and open the target `stages/XX/CONTEXT.md`.
2. **Load Inputs Only**: Load only the specific Layer 3 reference files and upstream Layer 4 outputs specified in `## Inputs`.
3. **Execute Process**: Follow the step-by-step instructions in `## Process`.
4. **Enforce Verification Gate**: Run the exact commands defined in `## Verify`.
5. **Generate Output & Stage Summary**: Write stage deliverables to `stages/XX/output/` and create `stages/XX/output/stage_summary.md`.

---

## 2. 🛠️ The Edit-Source Principle (Semantic Debugging)
*“Editing the output fixes this run. Editing the source fixes every future run.”*

When human review identifies a flaw in generated code or design:
1. **Diagnose Root Cause**: Was the issue caused by an underspecified Layer 3 rule (e.g. missing contrast token) or a missing constraint in the Layer 2 Stage Contract?
2. **Update the Source First**: Edit `_config/` (factory rules), `references/` (domain specs), or `stages/XX/CONTEXT.md` (stage contract).
3. **Re-execute the Stage**: Re-run the stage against the updated source to confirm the output is corrected and the improvement is permanent across all future runs.

---

## 3. 🌿 Git Flow & Commit Hygiene
- **Branch Naming**:
  - Features: `feature/stage-XX-<name>`
  - Fixes: `fix/<scope>-<description>`
- **Commit Format**: Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`).
- **Mandatory Pre-Commit Checklist**:
  ```bash
  npx tsc --noEmit && npx vitest run && vite build
  ```
- **Zero Dirty Git Tree**: Ensure working trees are clean with zero unstaged drift before completing turns.
