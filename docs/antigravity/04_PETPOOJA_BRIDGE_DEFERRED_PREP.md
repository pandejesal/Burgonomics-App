# PROMPT 04 — Petpooja Bridge — Dormant Guardrails (Days 4–5)

**Commit:** `chore(backend): petpooja dormant guardrails`  
**Audit:** BND-4 · **Policy:** DEFERRED per `implementation_plan.md:15` (₹8k, requires client opt-in). No live Petpooja calls this week.

## Context

`src/integrations/petpooja/` and `netlify/functions/petpooja-proxy.ts` are dormant. Risk is accidental live calls that burn credentials or leak `app_key/secret`. This prompt makes dormancy explicit and adds the dry-run scaffolding for when client opts in.

## Files to Touch (only)

- `src/integrations/petpooja/client.ts`
- `src/integrations/petpooja/menuSync.ts`
- `netlify/functions/petpooja-proxy.ts`
- `src/features/menu/repositories/MenuRepository.ts` — guard against direct Petpooja calls
- `.env.example` — ensure `PETPOOJA_ENABLED=false` default

## Do Not Touch

- `netlify/functions/payments.ts`, `firestore.rules`, `src/styles.css`

## Tasks

1. Add feature flag:
   ```ts
   // src/integrations/petpooja/flags.ts
   export const PETPOOJA_ENABLED = import.meta.env.VITE_PETPOOJA_ENABLED === "true";
   ```
   Every Petpooja call site must early-return `{ success:false, error:{ code:"PETPOOJA_DISABLED" }}` when flag false. No network request.
2. Audit all Petpooja imports (`grep -rn petpooja src/ netlify/`). Wrap each with flag check + `console.warn("[petpooja] dormant — set VITE_PETPOOJA_ENABLED=true to enable")`.
3. Harden `petpooja-proxy` Netlify function: reject when `PETPOOJA_ENABLED !== "true"` with `503 { error:"Petpooja bridge disabled"}` — do not forward to Petpooja.
4. Add dry-run validator `menuSync.validatePayload(menu) → { valid, errors }` that checks required fields (`rest_id`, `items[].price`, `items[].name`) without network.
5. Document opt-in steps in `docs/antigravity/PETPOOJA_OPTIN.md`: credentials → Netlify envs (`PETPOOJA_APP_KEY/SECRET/ACCESS_TOKEN/REST_ID`) → `VITE_PETPOOJA_ENABLED=true` → test with `?dryRun=1`.

## Acceptance

- [ ] `grep -rn "fetch.*petpooja\|qle1yy2ydc\|47pfzh5sf2" src/ netlify/` shows only flag-guarded paths
- [ ] `PETPOOJA_ENABLED=false` default; live call impossible without explicit env
- [ ] `petpooja-proxy?dryRun=1` returns validated payload shape, no external fetch
- [ ] `.env.example` lists all Petpooja envs with `PETPOOJA_ENABLED=false` comment
- [ ] `npx tsc --noEmit` passes

## Verification

```bash
PETPOOJA_ENABLED=false npm run build
grep -rn "PETPOOJA_ENABLED" src/ netlify/ --include="*.ts"
npx tsc --noEmit
```
