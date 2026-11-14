# Customer dependency policy

The rules this repository's dependency state must satisfy, and the reason each
exists. The executable form is `scripts/customer-dependency-policy.mjs`; the
guards are `scripts/customer-dependency-guards.test.mjs`, runnable with no
`node_modules`:

```bash
node --test scripts/customer-dependency-guards.test.mjs
```

## Package manager

**npm 11.17.0 is canonical.** `package.json` declares
`"packageManager": "npm@11.17.0"`.

That field records *intent*. npm only enforces it under Corepack (or an
engine-strict style check), so it is not a runtime guarantee — do not read a
passing install as proof the declared manager was used.

`package-lock.json` (lockfileVersion 3) is the single authoritative resolution.
`bun.lock` was retired in phase39: nothing in `src/`, `scripts/`, `tests/`,
`.github/`, or any config invoked Bun. The removed file is preserved byte-exact
with its sha256 in the phase39 evidence folder. **Never regenerate a Bun lock**
— npm frozen install is authoritative.

`.npmrc` at the repository root carries `legacy-peer-deps=true`. This is
load-bearing: npm's own documentation states a lock built with
`--legacy-peer-deps` must be installed with the same flag. It must stay, and
installs must pass it explicitly too.

## Installation and script policy

All lock mutations and reinstalls run scripts-disabled:

```bash
npm install --package-lock-only --ignore-scripts --legacy-peer-deps
npm ci --ignore-scripts --legacy-peer-deps
```

`--package-lock-only` never touches `node_modules`; `--ignore-scripts` covers
*all* lifecycle scripts including `prepare`, so no package's install hook runs
unreviewed. Packages in this tree that declare install scripts:
`@firebase/util`, `esbuild`, `fsevents` (optional), `protobufjs`, `re2`
(optional), `sharp`.

The CI emulator lane applies the same rule to **both** of its installs — the
workspace `npm ci --ignore-scripts` and the ephemeral
`npm install --prefix … --ignore-scripts` toolchain. A static test asserts no
`npm ci`/`npm install` in that workflow can omit the flag.

`esbuild` and `sharp` ship prebuilt binaries through a postinstall step. If a
build later fails on a missing binary, the remedy is a **named, reviewed**
`npm rebuild esbuild` — never re-enabling scripts wholesale and never
`--force`/`audit fix --force`.

Three integrity checks are mandatory before accepting any resolved version:
the public registry metadata (`npm view <pkg>@<ver> dist.integrity`), the
resolved URL in the lock, and the package's own `scripts` block (no
`preinstall`/`install`/`postinstall`/`prepare` beyond what is already reviewed).

## Floors

A floor is the lowest **stable** release that closes an advisory. Prereleases do
not satisfy a floor: `11.0.0-alpha.1` ranks below `11.0.1`, and
`14.0.2-alpha` ranks below `14.0.2`. The comparator in the policy module
preserves the prerelease tag specifically so a guard cannot pass on a
prerelease.

Direct: `zod>=4.6.6`, `vite>=8.3.3`, `vitest>=5.0.3` (the minimal patched 5.0
line — a 5.1 jump is a separate decision), and
`@capacitor/{core,android,ios,cli}>=8.6.0` staying matched at one major.minor.

Transitive: `re2js>=2.8.7`, `seroval>=1.6.11`, `source-map-js>=1.2.2`,
`rimraf>=6.1.4`, `glob>=14.0.2`, `minimatch>=11.0.1`,
`brace-expansion>=5.0.12`, plus the firebase-tools leaf floors
(`@modelcontextprotocol/sdk>=1.32.0`, `undici` 6.x `>=6.29.1`,
`body-parser` 1.x `>=1.20.9`, `fast-uri>=3.1.9`, `qs>=6.16.1`,
`hono>=4.13.11`, `ip-address>=10.7.4`, `@hono/node-server>=2.1.3`).

**Every floor must be reachable from a parent's own declared range.** No
`overrides` block is permitted for these packages: an override would mask a
genuinely incompatible parent range instead of resolving it.

## Deliberately out of scope

- **`@capacitor` plugin blanket bumps.** Only core/android/ios/cli move. App-check,
  app, status-bar and the rest stay at their supported versions.
- **Firebase.** Versions and the `~1.9.0` `@grpc/grpc-js` pin are untouched. The
  npm suggestion of `firebase@9.14.0` is a downgrade and is refused. A WebView
  loads Firestore's `browser` export condition (`index.esm.js`), not the
  `node` one (`index.node.mjs`) that imports gRPC — that is exposure evidence,
  **not** a closed finding.
- **`firebase-tools`.** The lock stays 15.30.2 and CI's pinned 15.32.1 is
  unchanged; they must not silently diverge.
- **Native/iOS assets.** `scripts/patch-ios-spm.js`, archive scripts, workflows,
  privacy manifests and native pins belong to the iOS owner. This policy covers
  package metadata only.

## Open residuals

These are not fixed and must not be reported as fixed:

- **ESLint nested `minimatch` 10.2.6.** eslint 10.x, `@eslint/config-array`
  0.23.5 and `typescript-eslint` 8.x all declare `^10.2.x`, which cannot reach
  11.0.1. Only the `rimraf → glob 14` chain reaches the floor. A guard asserts
  this residual is still present, so a future resolution that quietly claims it
  fixed will fail the suite rather than pass unnoticed.
- **`@grpc/grpc-js` 1.9.16** — parent-pinned, see above.
- **CLI-cluster majors** requiring a parent the pinned `firebase-tools` does not
  offer: `basic-ftp` 6.x, `csv-parse` 7.x, `@opentelemetry/core` 2.x,
  `stream-json` 3.x, and `archiver` (no 7.0.2 exists).

Each residual's exact reason is recorded in `KNOWN_RESIDUALS` in the policy
module, which the guards import — so the list is data under test, not prose that
can drift.

## Reachability vocabulary

"Browser bundle" (`re2js`, `seroval`, `zod`, Firestore browser build) means a
shipped WebView can load the code. "Node/tooling" (`vite`, `vitest`,
`@capacitor/cli`, `firebase-tools` and its cluster, `sharp`, `tar`,
`source-map-js`) means it runs on a developer machine or CI. Node-only is an
**exposure statement, never a risk waiver**: every finding stays open until a
supported fix lands.

## Production build

`npm run build` remains fail-closed without real LIVE client configuration. A
passing `--mode staging` build is not a production pass, and no dependency
change here alters that.
