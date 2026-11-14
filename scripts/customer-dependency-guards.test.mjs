/**
 * Customer dependency contract guards (phase39, read-only over source).
 *
 * Run with the built-in runner so a baseline RED needs no node_modules:
 *
 *   node --test scripts/customer-dependency-guards.test.mjs
 *
 * Floors and the residual list come from `customer-dependency-policy.mjs`; no
 * evidence directory, workstation path or prior audit file is read here. Only
 * `package.json`, `package-lock.json` and `.npmrc` in this repository are
 * inspected.
 *
 * Coverage:
 * - C1/C2 removals, C3 direct floors, platform quadruple, no plugin blanket bump.
 * - Transitive floors reached through legitimate parent ranges (no overrides).
 * - The firebase-tools 15.30.2 leaf floors, and the residuals that stay open.
 * - Synthetic prerelease boundaries on the comparator itself.
 * - npm 11.17.0 as declared intent (a field, not enforcement) and `.npmrc`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  DIRECT_FLOORS,
  TRANSITIVE_FLOORS,
  REMOVED_PACKAGES,
  KNOWN_RESIDUALS,
  atLeast,
  compareVersions,
  parseVersion,
  rangeFloor,
} from "./customer-dependency-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
const packages = lock.packages ?? {};

const deps = pkg.dependencies ?? {};
const devDeps = pkg.devDependencies ?? {};

/** Every installed copy of `name`, including nested duplicates. */
function installedVersions(name) {
  const suffix = `node_modules/${name}`;
  return Object.entries(packages)
    .filter(([key]) => key === suffix || key.endsWith(`/${suffix}`))
    .map(([, entry]) => entry.version)
    .filter(Boolean);
}

/** Installed paths of `name` that are NOT nested under one of `parents`. */
function installedOutside(name, parents) {
  const suffix = `node_modules/${name}`;
  return Object.entries(packages)
    .filter(([key]) => key === suffix || key.endsWith(`/${suffix}`))
    .filter(([key]) => !parents.some((parent) => key.includes(`${parent}/node_modules/`)))
    .map(([key, entry]) => ({ path: key, version: entry.version }));
}

function declaredRange(table, name) {
  return table[name];
}

function assertAbsent(name) {
  assert.equal(declaredRange(deps, name), undefined, `${name} must not be a dependency`);
  assert.equal(declaredRange(devDeps, name), undefined, `${name} must not be a devDependency`);
  assert.equal(
    packages[`node_modules/${name}`],
    undefined,
    `${name} must not survive in the lock as a root entry`,
  );
}

/** Assert every installed copy of `name` clears `floor`. */
function assertAllAtLeast(name, floor) {
  const versions = installedVersions(name);
  assert.ok(versions.length > 0, `${name} must be installed`);
  for (const version of versions) {
    assert.ok(atLeast(version, floor), `installed ${name} ${version} is below ${floor}`);
  }
}

// ------------------------------------------------------------- comparator

test("prereleases rank below the stable triple, and never satisfy a stable floor", () => {
  // Synthetic boundaries on the current helper — a guard that numeric-stripped
  // "-alpha" would accept 11.0.0-alpha.1 against the 11.0.1 floor.
  assert.ok(!atLeast("11.0.0-alpha.1", "11.0.1"), "11.0.0-alpha.1 must fail the 11.0.1 floor");
  assert.ok(!atLeast("14.0.2-alpha", "14.0.2"), "14.0.2-alpha must fail the 14.0.2 floor");
  assert.ok(!atLeast("11.0.0", "11.0.1"), "11.0.0 itself is inside the advisory range");
  assert.ok(!atLeast("14.0.1", "14.0.2"), "14.0.1 itself is inside the advisory range");
  assert.ok(atLeast("11.0.1", "11.0.1"), "the stable fix satisfies its own floor");
  assert.ok(atLeast("14.0.2", "14.0.2"), "the stable fix satisfies its own floor");
  assert.equal(compareVersions("14.0.2-alpha", "14.0.2"), -1);
  assert.equal(compareVersions("11.0.0", "11.0.1"), -1);
  assert.equal(compareVersions("11.0.1", "11.0.0"), 1);
  assert.equal(parseVersion("1.2.3-rc.1+build").prerelease, "rc.1");
  assert.equal(parseVersion("9.9.9").prerelease, null);
});

test("range floors parse without inventing a version", () => {
  assert.equal(rangeFloor("^14.0.2"), "14.0.2");
  assert.equal(rangeFloor("~1.9.0"), "1.9.0");
  assert.equal(rangeFloor("nonsense"), null);
});

// ---------------------------------------------------------------- C1 / C2

test("C1: @tanstack/react-start is removed (unused Start server side)", () => {
  assertAbsent("@tanstack/react-start");
});

test("C1: the real SPA router stack is retained", () => {
  assert.ok(declaredRange(deps, "@tanstack/react-router"), "@tanstack/react-router must stay");
  assert.ok(
    declaredRange(deps, "@tanstack/router-plugin"),
    "@tanstack/router-plugin must stay — both Vite configs import it",
  );
  assert.ok(packages["node_modules/@tanstack/react-router"], "react-router must be installed");
  assert.ok(packages["node_modules/@tanstack/router-plugin"], "router-plugin must be installed");
});

test("C2: @capacitor/assets and nitro are removed", () => {
  assertAbsent("@capacitor/assets");
  assertAbsent("nitro");
});

test("every policy REMOVED_PACKAGES entry is actually gone", () => {
  for (const name of REMOVED_PACKAGES) assertAbsent(name);
});

// ---------------------------------------------------------------- C3 direct

test("C3: zod is patched to its floor", () => {
  assert.ok(atLeast(declaredRange(deps, "zod"), DIRECT_FLOORS.zod), `zod ${deps.zod} below floor`);
  assertAllAtLeast("zod", DIRECT_FLOORS.zod);
});

test("C3: vite is patched past the advisory window", () => {
  assert.ok(
    atLeast(declaredRange(devDeps, "vite"), DIRECT_FLOORS.vite),
    `vite ${devDeps.vite} below ${DIRECT_FLOORS.vite}`,
  );
  assertAllAtLeast("vite", DIRECT_FLOORS.vite);
});

test("C3: vitest is patched to the minimal 5.0 line (NOT 5.1)", () => {
  assert.ok(atLeast(declaredRange(devDeps, "vitest"), DIRECT_FLOORS.vitest));
  const versions = installedVersions("vitest");
  assert.ok(versions.length > 0, "vitest must be installed");
  for (const version of versions) {
    assert.ok(atLeast(version, DIRECT_FLOORS.vitest), `vitest ${version} below floor`);
    // A 5.1 jump is a different, unapproved decision.
    assert.equal(parseVersion(version).minor, 0, `vitest ${version} left the approved 5.0 line`);
  }
});

// ------------------------------------------------- Capacitor platform quadruple

test("platforms stay matched to core at the same major.minor", () => {
  const coreRange = declaredRange(deps, "@capacitor/core");
  assert.ok(coreRange, "@capacitor/core must be a dependency");
  assert.ok(atLeast(coreRange, DIRECT_FLOORS["@capacitor/core"]), `core ${coreRange} below floor`);

  const core = parseVersion(coreRange);
  for (const name of ["@capacitor/android", "@capacitor/ios", "@capacitor/cli"]) {
    const range = declaredRange(devDeps, name);
    assert.ok(range, `${name} must stay a devDependency`);
    assert.ok(atLeast(range, DIRECT_FLOORS[name]), `${name} ${range} below floor`);
    const got = parseVersion(range);
    assert.equal(got.major, core.major, `${name} major must match core`);
    assert.equal(got.minor, core.minor, `${name} minor must match core`);
  }
});

test("other Capacitor plugins are not blanket-bumped (app-check stays put)", () => {
  assert.equal(declaredRange(deps, "@capacitor-firebase/app-check"), "^8.5.2");
  assert.equal(declaredRange(deps, "@capacitor/app"), "^8.1.0");
  assert.equal(declaredRange(deps, "@capacitor/status-bar"), "^8.0.2");
});

// ------------------------------------------------------- transitive floors

test("browser-path transitive floors are met (re2js, seroval, source-map-js)", () => {
  assertAllAtLeast("re2js", TRANSITIVE_FLOORS.re2js);
  assertAllAtLeast("seroval", TRANSITIVE_FLOORS.seroval);
  assertAllAtLeast("source-map-js", TRANSITIVE_FLOORS["source-map-js"]);
});

test("rimraf chain floors arrive via @capacitor/cli, not an override", () => {
  // @capacitor/cli declares rimraf ^6.0.1 -> 6.1.4 -> glob ^14.0.3 -> minimatch
  // ^11.0.5 -> brace-expansion ^5.0.12. That is the legitimate path.
  // google-gax keeps its own rimraf 5.0.10 (^5.0.1): a different, still-open
  // Node-only residual that this slice does not claim to fix.
  const cliRimraf = installedOutside("rimraf", [
    "@google-cloud/firestore-api",
    "@google-cloud/pubsub",
    "@google-cloud/sql",
  ]);
  assert.ok(cliRimraf.length > 0, "the @capacitor/cli rimraf copy must exist");
  for (const entry of cliRimraf) {
    assert.ok(
      atLeast(entry.version, TRANSITIVE_FLOORS.rimraf),
      `${entry.path} rimraf ${entry.version} is below ${TRANSITIVE_FLOORS.rimraf}`,
    );
  }

  // The glob/minimatch/brace-expansion floors must be reached by that same chain.
  const globFourteen = installedVersions("glob").filter((version) =>
    atLeast(version, TRANSITIVE_FLOORS.glob),
  );
  assert.ok(globFourteen.length > 0, `no glob at ${TRANSITIVE_FLOORS.glob}+`);

  const minimatchEleven = installedVersions("minimatch").filter((version) =>
    atLeast(version, TRANSITIVE_FLOORS.minimatch),
  );
  assert.ok(minimatchEleven.length > 0, `no minimatch at ${TRANSITIVE_FLOORS.minimatch}+`);

  assert.ok(
    installedVersions("brace-expansion").some((version) =>
      atLeast(version, TRANSITIVE_FLOORS["brace-expansion"]),
    ),
    `no brace-expansion at ${TRANSITIVE_FLOORS["brace-expansion"]}+`,
  );
});

test("firebase-tools leaf floors are reached inside its own parent ranges", () => {
  // Each parent range genuinely admits these floors; no cross-range override.
  assertAllAtLeast("@modelcontextprotocol/sdk", TRANSITIVE_FLOORS["@modelcontextprotocol/sdk"]);
  assertAllAtLeast("hono", TRANSITIVE_FLOORS.hono);
  assertAllAtLeast("ip-address", TRANSITIVE_FLOORS["ip-address"]);
  assertAllAtLeast("fast-uri", TRANSITIVE_FLOORS["fast-uri"]);
  assertAllAtLeast("@hono/node-server", TRANSITIVE_FLOORS["@hono/node-server"]);

  // undici exists at several majors; the firebase-tools copy is the 6.x line.
  const undiciSix = installedOutside("undici", ["jsdom", "node-gyp"]);
  assert.ok(undiciSix.length > 0, "the firebase-tools undici copy must exist");
  for (const entry of undiciSix) {
    assert.ok(
      atLeast(entry.version, TRANSITIVE_FLOORS.undici),
      `${entry.path} undici ${entry.version} below ${TRANSITIVE_FLOORS.undici}`,
    );
  }

  // body-parser at 1.x must clear 1.20.9; the express 5 copy is a separate 2.x line.
  const bodyParserOne = installedVersions("body-parser").filter(
    (version) => parseVersion(version).major === 1,
  );
  assert.ok(bodyParserOne.length > 0, "a body-parser 1.x copy must exist");
  for (const version of bodyParserOne) {
    assert.ok(atLeast(version, TRANSITIVE_FLOORS["body-parser"]), `body-parser ${version} below floor`);
  }
});

// ------------------------------------------------------------- must-not-move

test("no @grpc/grpc-js override exists outside Firestore's own range", () => {
  const overrides = pkg.overrides ?? {};
  assert.equal(overrides["@grpc/grpc-js"], undefined, "grpc override is out of Firestore's range");
  assert.equal(lock.packages?.[""]?.overrides?.["@grpc/grpc-js"], undefined, "lock must not carry it");
});

test("no overrides block at all is introduced by this slice", () => {
  // Reaching a floor through `overrides` would hide a genuinely incompatible
  // parent range. Every floor above must be reachable from a real parent.
  assert.equal(pkg.overrides, undefined, "this slice must not add an overrides block");
});

test("Firebase versions and its grpc pin are untouched", () => {
  assert.equal(declaredRange(deps, "firebase"), "^12.16.0");
  const firestore = packages["node_modules/@firebase/firestore"];
  assert.ok(firestore, "@firebase/firestore must be installed");
  assert.match(String(firestore.dependencies?.["@grpc/grpc-js"]), /^~1\.9\./);
});

test("the ESLint nested minimatch residual is still present and NOT claimed fixed", () => {
  const residual = KNOWN_RESIDUALS.find((entry) => entry.node === "minimatch");
  assert.ok(residual, "the minimatch residual must stay documented");

  // eslint's own caret is ^10.2.x, which cannot reach 11.0.1. If a future
  // eslint starts admitting 11.x this case should be revisited — not silently
  // reported as already fixed.
  const eslintEntry = packages["node_modules/eslint"];
  assert.ok(eslintEntry, "eslint must be installed");
  const eslintMinimatch = eslintEntry.dependencies?.minimatch;
  assert.ok(eslintMinimatch, "eslint must still depend on minimatch");
  assert.ok(
    !atLeast(rangeFloor(eslintMinimatch), TRANSITIVE_FLOORS.minimatch),
    `eslint's minimatch range ${eslintMinimatch} now reaches the fix floor; update the residual instead of keeping a stale claim`,
  );

  // And the vulnerable nested copy is really still installed under eslint.
  const nested = packages["node_modules/eslint/node_modules/minimatch"];
  assert.ok(nested, "eslint's nested minimatch must still be present (residual, not fixed)");
  assert.ok(
    !atLeast(nested.version, TRANSITIVE_FLOORS.minimatch),
    `eslint nested minimatch unexpectedly reached the floor; the residual note is now wrong`,
  );
});

test("ESLint major is preserved, not downgraded", () => {
  assert.equal(parseVersion(declaredRange(devDeps, "eslint")).major, 10);
});

test("firebase-tools root and the CI ephemeral pin agree on one exact version", () => {
  // One CLI version must be authoritative. A root/pin mismatch means the lane
  // tests a different CLI than the app's lock resolves.
  const rootRange = declaredRange(devDeps, "firebase-tools");
  assert.ok(rootRange, "firebase-tools must stay a devDependency");
  const rootMajor = parseVersion(rootRange).major;
  assert.equal(rootMajor, 15, `firebase-tools root left the approved major: ${rootRange}`);

  const cli = packages["node_modules/firebase-tools"];
  assert.ok(cli, "firebase-tools must be installed");

  const workflow = readFileSync(
    path.join(root, ".github/workflows/customer-emulator-lane.yml"),
    "utf8",
  );
  const pin = workflow.match(/firebase-tools@(\d+\.\d+\.\d+)/);
  assert.ok(pin, "the lane must pin firebase-tools exactly");

  assert.equal(
    pin[1],
    cli.version,
    `CI pins firebase-tools ${pin[1]} but the lock resolves ${cli.version}; they must match`,
  );

  const occurrences = [...workflow.matchAll(/firebase-tools@(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
  // Every assertion site must name the same version, not just the install line —
  // a stale header or node -e check would silently allow drift. Only
  // firebase-tools references are compared; Playwright is a separate pin.
  const pinAssertions = [
    ...workflow.matchAll(/versionOf\('firebase-tools'\)!=='(\d+\.\d+\.\d+)'/g),
  ].map((m) => m[1]);
  assert.ok(pinAssertions.length > 0, "the lane must assert the firebase-tools version in node -e");
  for (const version of [...occurrences, ...pinAssertions]) {
    assert.equal(
      version,
      cli.version,
      `lane references firebase-tools ${version} while the lock resolves ${cli.version}`,
    );
  }
});

test("the lane's ephemeral workspace install disables lifecycle scripts", () => {
  const workflow = readFileSync(
    path.join(root, ".github/workflows/customer-emulator-lane.yml"),
    "utf8",
  );
  const installBlock = workflow.match(/npm install --prefix[^\n]*(?:\\\n[^\n]*)*/);
  assert.ok(installBlock, "the ephemeral prefix install must exist");
  assert.match(
    installBlock[0],
    /--ignore-scripts/,
    "the ephemeral toolchain install must not execute package lifecycle scripts",
  );
});

// ------------------------------------------------------------- package manager

test("npm 11.17.0 is the declared package manager (intent, not enforcement)", () => {
  // `packageManager` records intent; npm only enforces it under corepack or
  // with an engine-strict style check. It is not a runtime guarantee.
  assert.equal(pkg.packageManager, "npm@11.17.0");
});

test(".npmrc keeps legacy-peer-deps=true at the repository root", () => {
  // The committed root .npmrc is legitimate: npm requires the same flag used
  // to build the lock. It must not be removed or relocated.
  const npmrc = readFileSync(path.join(root, ".npmrc"), "utf8");
  assert.match(npmrc, /^legacy-peer-deps=true$/m);
});

test("js-yaml is a declared exact devDependency, not an implicit transitive", () => {
  assert.equal(declaredRange(devDeps, "js-yaml"), "4.3.2");
  assert.equal(declaredRange(deps, "js-yaml"), undefined, "js-yaml belongs in devDependencies");
  assert.equal(packages["node_modules/js-yaml"]?.version, "4.3.2");
});
