# tests/playwright — how to run these suites

`@playwright/test` is declared as a devDependency (`1.63.0`) for the
sticky-scrollport gate. Other configs in this folder still rely on a workspace
root install; run every command **from this app's directory**.

## Suite inventory (glob-verified: `tests/playwright/*config.ts`)

| Config | Spec | Needs a server? |
|---|---|---|
| `playwright.sticky-scroll.config.ts` | `sticky-scrollport.spec.ts` | **Yes** — a served production build via `UI_BASE_URL` |
| `playwright.directional-scroll.config.ts` | `ui-directional-scroll.spec.ts` | No — offline `file://` fixture, real Chromium touch |
| `playwright.appbutton.config.ts` | `app-button-submit.spec.ts` | No — harness is bundled at test time |

Historical note: the pre-iteration README referenced
`ui-a11y-gestures.config.ts`. That file is **not present** in this tree. The
existing offline gesture suite is `playwright.directional-scroll.config.ts`
(spec `ui-directional-scroll.spec.ts`); use the recipe below instead of the old
filename.

## Commands

### Sticky-scrollport gate (served production build)

```powershell
$env:UI_BASE_URL = "http://127.0.0.1:5194"
npm run test:sticky
npm run test:sticky:types      # type-checks this config + spec
Remove-Item Env:\UI_BASE_URL
```

Gate semantics:

- With `UI_BASE_URL` set, the suite measures a served build and fails on real
  geometry regressions.
- **Without** `UI_BASE_URL`, a local run is an explicitly labelled **skip**
  (`LOCAL OPTIONAL SKIP`, never a pass).
- With `CI=1` or `UI_GATE_REQUIRED=1` and no `UI_BASE_URL`, the suite **fails
  hard** (missing URL must not skip a required gate).
- A blank page fails; a content-bearing short `/search` at 375 is an explicit
  data-dependent skip, and the 375 proof is carried by `/privacy`.

### Directional-scroll / gesture fixture (offline, no `UI_BASE_URL`)

```powershell
# Category-rail swipe fixture: bundles the shipped useDirectionalScroll hook
# and drives it over file:// with Chromium's real touch pipeline.
npx --no-install playwright test -c tests/playwright/playwright.directional-scroll.config.ts
```

This suite needs **no server and no `UI_BASE_URL`**; the page fixture is
synthetic but the hook under test is the shipped module. There is no
public-route/`UI_BASE_URL` variant for this config in the current tree. It does
not skip on its own; a failure is a failure.

### AppButton native submit contract (offline)

```powershell
# Builds the harness from app-button-harness.tsx at test time.
npx --no-install playwright test -c tests/playwright/playwright.appbutton.config.ts
```

## Notes

- The AppButton harness is compiled from `app-button-harness.tsx` on every run
  into `%TEMP%`. The old prebuilt `app-button-harness.html` is **not** read by
  the suite and does not need to be committed; `build-harness.mjs` is a manual
  debugging aid only.
- The fallback leg of the sticky suite serves the same build with its
  `@supports (overflow: clip)` block removed. That is a Chromium syntax-branch
  simulation, **not** an iOS 15 / Safari 15 device proof. The fulfill path
  deletes `content-encoding`/`content-length` so a compressed static server
  cannot mislabel the replacement body; this is a portability guard, not a
  claim that a failure was observed.
- `test-results/` and `playwright-report/` are runner output and are ignored by
  this repo's `.gitignore`; evidence hashes/screenshots belong outside the repo.
- These Playwright files are outside the app `tsconfig.json`; the sticky gate's
  config + spec are type-checked by `tests/playwright/tsconfig.browser-tests.json`
  via `npm run test:sticky:types`.
