# Stage 01: Project Setup & Core Infrastructure

> **Layer 2 Stage Contract**: Tooling, monorepo configurations, environment setup, and Capacitor mobile initialization.

---

## 1. ## Inputs
- **Layer 3 (Reference)**: `../../_config/architecture_overview.md`
- **Layer 3 (Reference)**: `../../_config/deployment_strategy.md`
- **Layer 3 (Reference)**: `../../_config/coding_standards.md`
- **Layer 4 (Working)**: N/A (Initial foundation stage)

---

## 2. ## Process
1. Initialize/verify Vite + React 18/19 + TypeScript configuration in both `burgonomics-foundation-core/` and `burgonomics-partner/`.
2. Configure path aliases (`@/*` -> `src/*`) in `tsconfig.json` and `vite.config.ts`.
3. Set up Capacitor core (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`) with unique app IDs:
   - Customer App: `com.burgonomics.app`
   - Partner App: `com.burgonomics.partner`
4. Establish environment variable templates (`.env.example`) for Firebase, Razorpay, Petpooja, and Porter.
5. Configure Tailwind v4 / Vanilla CSS design token imports linked to `_config/design_system.md`.

---

## 3. ## Outputs
- `burgonomics-partner/package.json`
- `burgonomics-partner/vite.config.ts`
- `burgonomics-partner/tsconfig.json`
- `burgonomics-partner/capacitor.config.ts`
- `burgonomics-partner/.env.example`
- `output/stage_summary.md` -> Stage completion summary and verification record

---

## 4. ## Verify
Run the following verification gate:
```bash
cd burgonomics-partner && npx tsc --noEmit && vite build
```
- Assert zero TypeScript compiler errors.
- Assert successful production bundle generation in `dist/`.
