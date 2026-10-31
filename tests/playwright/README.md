# tests/playwright — how to run these suites

Playwright is **not** declared by this app. The runner resolves from the
workspace root (`C:\Users\DELL\Desktop\Burgonomics\node_modules`), so every
command below is run **from this app's directory** and relies on `npx` walking
up to that root. Do not add a Playwright dependency here without the repo
owner's decision — these suites are not wired into CI or `npm test`.

```powershell
# AppButton native submit contract (builds the harness at test time)
npx --no-install playwright test -c tests/playwright/playwright.appbutton.config.ts

# Category swipe gestures (offline, file:// fixture, real Chromium touch)
npx --no-install playwright test -c tests/playwright/ui-a11y-gestures.config.ts

# ...plus the public-route checks, against an already-served build
$env:UI_BASE_URL = "http://127.0.0.1:4322"
npx --no-install playwright test -c tests/playwright/ui-a11y-gestures.config.ts
Remove-Item Env:\UI_BASE_URL
```

Notes:

- The AppButton harness is compiled from `app-button-harness.tsx` on every run
  into `%TEMP%`. The old prebuilt `app-button-harness.html` is **not** read by
  the suite and does not need to be committed; `build-harness.mjs` is a manual
  debugging aid only.
- `ui-a11y-gestures.config.ts` needs no server. The route tests skip (never
  pass) without `UI_BASE_URL`, and throw in CI if it is unset.
- These files are outside both `tsconfig.json` and `vitest.config.ts`, so they
  are not typechecked or collected by unit-test runs.
- `test-results/` and `playwright-report/` are generated; they are not ignored
  by this repo's `.gitignore` yet, so stage `tests/playwright` explicitly.
