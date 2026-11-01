# `tests/emulator` — local Firestore guest-catalog lane

**EMULATOR TEST — synthetic data, not live.** This directory is a test-only lane.
It is not a deploy target, it is never imported by `src/**`, and it proves nothing
about production data, payments, POS or a deployed environment.

Design: `polish-plan-20261025/stages/02_firebase_firestore/output/local-emulator-browser-contract.md`.

## Run

```powershell
# Required once per checkout/CI job: the canonical rules artifact.
# Fail-closed when absent — the lane never skips the parity gate.
$env:EMULATOR_CANONICAL_RULES = "..\polish-backend-20261025\firestore.rules"

node tests/emulator/run-lane.mjs
```

That single command:

1. refuses to start if `8099` / `5199` / `4400` / `4500` / `9150` are busy (never kills an unknown PID);
2. requires Java 21+ (the installed Android Studio JBR is auto-detected; the machine's Java 8 default is ignored);
3. requires the cached Firestore emulator JAR (no download unless `EMULATOR_ALLOW_DOWNLOAD=1`);
4. requires the canonical backend `firestore.rules` and aborts with **BLOCKED** when the path is missing or its hash differs from the customer copy;
5. builds the child env from an **allowlist** of benign OS variables and synthetic demo `VITE_*` values; credential-bearing variables are never read, copied, logged or written;
6. seeds `demo-burgonomics-emulator` with 2 stores / 48 alpha products / 3 beta sentinels, then re-reads them as an **unauthenticated** guest through the real SDK;
7. serves the unmodified app with a test-only Vite config (in-memory `index.html` rewrite, loopback-only CSP, `envDir: false`);
8. runs Chromium against the **real** Firestore SDK + emulator with the real customer rules;
9. parses the **Playwright JSON report** and requires exactly the 7 manifest-listed tests, all passing, none skipped/failed/flaky/retried;
10. tears the emulator down and runs a negative phase: the probe must pass **and** the catalogue spec must fail **only** at `toHaveCount` with `Expected: 2 / Received: 0`, corroborated by a captured Firestore backend-unavailable signature and loopback:8099 attempts. A generic timeout, blank page, harness error, wrong test or skipped run is rejected.

Artifacts (report, manifest, raw logs, JSON reports, screenshots, seed proof) go to
`%TEMP%/opencode/phase1-emulator-browser` (override `EMULATOR_LANE_ARTIFACTS`).

Scoped typecheck/tests (TEMP cache; never the shared `node_modules/.vite`):

```powershell
npx tsc -p tests/emulator/tsconfig.json --noEmit
npx vitest run --config tests/emulator/vitest.emulator.config.ts
```

The Playwright specs are `*.spec.ts`, which the root Vitest `include` list does not
collect; the unit files are `*.test.ts`.

## Acceptance gates (pure, unit-tested)

`lane-gates.mjs` holds the classification logic with no imports/IO:

- `classifyPositiveReport` — exact title manifest, `expected/skipped/unexpected/flaky`
  counts must agree with the test records, no retries, no extra tests (a new test
  needs explicit manifest coverage), no top-level runner errors.
- `classifyNegativeReport` — exactly one failure, the intended test/file, the exact
  `toHaveCount` locator plus `Expected: 2` / `Received: 0`, no forbidden harness
  pattern, and browser evidence: backend-unavailable console signature, loopback:8099
  attempts, no production host.
- `classifyStickyHits` — the visible input midpoint must hit the **input or a
  descendant**, not merely something inside the form.
- `decideKill` — never signal an exited child; verify the OS start token before
  `taskkill /T` so a recycled PID cannot kill an unrelated process.

`lane-gates.test.ts` proves the old weaker conditions (`exit !== 0`, `exit === 0`,
`form.contains(hit)`) accepted bad inputs that the gates now reject.

## Safety model

- Target is fixed: `demo-burgonomics-emulator` @ `127.0.0.1:8099`. Non-demo,
  non-loopback, wrong-port and mismatched-project targets throw **before** the app
  or any socket exists.
- No mocks, no `getDocs` fakes, no route fulfilment. Allowed traffic is loopback
  only; any other request is aborted before egress, recorded and fails the test.
- Guest has no auth, no push, no service worker, no Functions/Storage. Auth
  emulator (9098) is Phase 2 and is not started.
- The DPDP consent banner is dismissed with its X (never "Accept"), and the test
  asserts no consent key was written.
- The Firestore emulator binds its own UI websocket on **9150** even with the
  Firebase UI disabled; it is preflighted and verified free after teardown.

## Deliberate deviations from the design doc

1. **Rules path is materialized at runtime.** firebase-tools rejects a `..` rules
   path (`"../../firestore.rules" is outside of project directory`) and silently
   defaults to **allow all** when the file is missing. `run-lane.mjs` therefore
   writes an effective config into the artifacts dir whose `firestore.rules` is an
   absolute, hash-verified path. The committed `firebase.emulator.json` points at
   `deny-all.rules` so using it directly is fail-closed, never allow-all.
   CI should pin the canonical rules artifact in Phase 4; the default peer-worktree
   path is a convenience, and a missing path is an explicit BLOCKED.
2. **One tolerated connectivity probe in the negative phase only.** When the
   emulator is unreachable, Google Closure's WebChannel transport requests
   `www.google.com/images/cleardot.gif` (an image probe, no project data, CSP
   blocked). The positive phase tolerates nothing; the negative phase records it
   in `network-proof-negative-inverted.json`. Any production service host still fails.
3. **Playwright spec args are passed relative**, because absolute Windows paths
   contain `\` escapes and `:` and match no files.
4. **`deny-all.rules`** is an extra fail-closed placeholder so the declared config
   cannot be run into an "allow all" state.
5. **The Playwright JSON report is the gate input**, not the exit code. `--reporter`
   on the CLI is intentionally absent so the config's list + JSON reporters run.

## Known limits

No Auth/OTP/SMS, no payment, no POS, no FCM, no Functions/Storage. Headless
Chromium has no OS keyboard (no inset claim). Google Fonts are stripped (no font
fidelity claim). No production build is run here; the existing `dist` scan is
read-only and is **not** fresh-release proof.
