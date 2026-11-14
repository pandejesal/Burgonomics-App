/**
 * Customer dependency policy — the single source of truth for the guards in
 * `customer-dependency-guards.test.mjs`.
 *
 * This module holds the *decision*, not a snapshot of any machine. It never
 * reads an evidence directory, a workstation path, or a previous audit file:
 * the guards compare `package.json` / `package-lock.json` against these values
 * only. The accompanying prose lives in `docs/customer-dependency-policy.md`.
 *
 * Advisory floors below are the authoritative stable releases that CLOSE a
 * finding. They are deliberately not "the newest version" and not the lowest
 * version that merely contains a fix commit:
 * - `glob` 14.0.2 — 14.0.0/14.0.1 are in the advisory range `<=14.0.1`.
 * - `minimatch` 11.0.1 — 11.0.0 is inside `7.0.0 - 11.0.0`.
 * A prerelease such as `14.0.2-alpha` is BELOW `14.0.2` and must not satisfy a
 * floor; see `compareVersions`.
 */

/** Direct dependency floors (C3). */
export const DIRECT_FLOORS = Object.freeze({
  zod: "4.6.6",
  vite: "8.3.3",
  vitest: "5.0.3",
  "@capacitor/core": "8.6.0",
  "@capacitor/android": "8.6.0",
  "@capacitor/ios": "8.6.0",
  "@capacitor/cli": "8.6.0",
});

/**
 * Transitive floors reachable through a legitimate parent range. No `overrides`
 * entry may be used to reach any of these.
 */
export const TRANSITIVE_FLOORS = Object.freeze({
  re2js: "2.8.7",
  seroval: "1.6.11",
  "source-map-js": "1.2.2",
  rimraf: "6.1.4",
  glob: "14.0.2",
  minimatch: "11.0.1",
  "brace-expansion": "5.0.12",
  // firebase-tools 15.30.2 graph only — each parent's own range admits these.
  "@modelcontextprotocol/sdk": "1.32.0",
  undici: "6.29.1",
  "body-parser": "1.20.9",
  "fast-uri": "3.1.9",
  qs: "6.16.1",
  hono: "4.13.11",
  "ip-address": "10.7.4",
  "@hono/node-server": "2.1.3",
});

/** Packages that must not be declared at all (proven unused, C1/C2). */
export const REMOVED_PACKAGES = Object.freeze([
  "@tanstack/react-start",
  "@capacitor/assets",
  "nitro",
]);

/**
 * Range-residual findings that this slice does NOT fix. Listing them here keeps
 * them explicit and falsifiable rather than silently absent from the guard.
 */
export const KNOWN_RESIDUALS = Object.freeze([
  {
    node: "minimatch",
    detail:
      "eslint 10.x / @eslint/config-array 0.23.5 / typescript-eslint 8.x all declare ^10.2.x. " +
      "minimatch 10.2.6 is vulnerable (range 7.0.0-11.0.0) and 11.0.1 is outside those carets. " +
      "Only the rimraf -> glob 14 chain reaches 11.0.1 legitimately; the ESLint nested copy is " +
      "NOT remediated and must not be reported as fixed.",
  },
  {
    node: "@grpc/grpc-js",
    detail:
      "Firestore pins ~1.9.0; the fix needs >=1.13.6, outside the parent range. No override is " +
      "applied. Browser builds load the `browser` export condition, so a WebView does not load " +
      "gRPC — that is exposure evidence, not a closure of the finding.",
  },
  {
    node: "stream-json",
    detail:
      "Resolved by the approved firebase-tools 15.35.0 parent: it declares ^3.6.0 " +
      "(installed 3.9.0) with stream-chain ^4.2.5. Kept here as history; the guard " +
      "asserts the installed floor, so this entry failing means the parent regressed.",
  },
  {
    node: "basic-ftp",
    detail:
      "Resolved by firebase-tools 15.35.0, which dropped proxy-agent/get-uri/pac-proxy-agent " +
      "and therefore the basic-ftp chain entirely. Absence is asserted by the guard.",
  },
  {
    node: "csv-parse",
    detail:
      "Resolved by firebase-tools 15.35.0: it declares ^7.0.2 (installed 7.0.3). " +
      "The earlier ^5.0.4 constraint no longer applies.",
  },
  {
    node: "@opentelemetry/core",
    detail: "@google-cloud/pubsub 5.3.1 declares ^1.30.1; the fix needs 2.8.0, a major migration.",
  },
  {
    node: "archiver",
    detail: "firebase-tools 15.30.2 declares ^7.0.0; 7.0.0-7.0.1 are the advisory range and no 7.0.2 exists.",
  },
]);

const PRERELEASE_AGGREGATE = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

/**
 * Parse a version or a range's leading version, preserving the prerelease tag.
 *
 * Range operators are tolerated on purpose: `^4.6.7` and `4.6.7` must yield the
 * same triple, and `>=11.0.1` must not silently become unparsable.
 */
export function parseVersion(version) {
  const match = String(version).match(PRERELEASE_AGGREGATE);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/**
 * Semver precedence for the subset the guards need: -1, 0 or 1.
 *
 * A prerelease ranks BELOW the same triple released, so
 * `11.0.0-alpha.1 < 11.0.0 < 11.0.1`. Stripping the tag would turn a
 * prerelease into a false pass against a stable floor.
 */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;

  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;

  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

/** True when `installed` is at or above `floor`; prereleases never satisfy it falsely. */
export function atLeast(installed, floor) {
  const result = compareVersions(installed, floor);
  return result === null ? false : result >= 0;
}

/** The lowest version in `range` as a comparable string, or null if unparsable. */
export function rangeFloor(range) {
  const match = String(range).match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  return match ? match[1] : null;
}
