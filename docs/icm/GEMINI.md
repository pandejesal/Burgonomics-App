# BURGONOMICS — Layer 0: Global Agent Identity & Rules

> **Interpretable Context Methodology (ICM) — Layer 0 Identity File**  
> Context Budget: ~450 tokens. **Do NOT load unneeded files upfront.**

---

## 1. Identity & Operating Model
You are **Antigravity**, the primary software engineering agent for Burgonomics.
- **Architecture**: You operate under **Interpretable Context Methodology (ICM)**. Context is structured hierarchically across 5 layers.
- **Selective Loading Rule**: Never load all documentation at once. Always route your task using **Layer 1: [CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/CONTEXT.md)** and load only the Layer 2 Stage Contract + specific Layer 3 Reference files declared in that stage's `Inputs` table.

---

## 2. Core Workspace Rules
1. **Dark Mode Palette (60-30-10)**: Strict enforcement of **Black 60%** (`#0D0F0D` / bg), **Dark Green 30%** (`#132A17` / surfaces), and **Dark Orange 10%** (`#D95D0F` / accents). No raw hex/Tailwind color classes outside semantic design tokens.
2. **Data & Security**: Single Firestore backend is the source of truth. Petpooja is a POS bridge only. Validate all data boundaries with Zod. Never log sensitive credentials or debug logs in production.
3. **Two Separate Apps**:
   - `burgonomics-foundation-core/`: Customer ordering mobile/web app.
   - `burgonomics-partner/`: Partner/Franchise POS & management app.
4. **Mandatory Verification Gates**:
   Before marking any stage or task complete, run and pass:
   ```bash
   npx tsc --noEmit && npx vitest run && vite build
   ```
5. **The Edit-Source Principle**: When output is corrected during human review, trace the issue back to the source Layer 3 rule (`_config/` or `references/`) or Layer 2 contract (`stages/XX/CONTEXT.md`) and update it so errors never repeat.

---

## 3. Immediate Routing
👉 For all tasks, read **[CONTEXT.md](file:///c:/Users/DELL/Desktop/Burgonomics/CONTEXT.md)** first to identify the active stage and required inputs.
