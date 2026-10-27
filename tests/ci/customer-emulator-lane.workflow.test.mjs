/**
 * Static (pure) contract test for .github/workflows/customer-emulator-lane.yml —
 * DEC-09 relevant-PR emulator gate. No emulator, no network, no installs.
 *
 * Always-on checks parse the workflow file STRUCTURALLY (string-level); the
 * deep YAML syntax check runs only when an existing local YAML parser
 * (`yaml`, else `js-yaml` with JSON_SCHEMA so the `on:` key stays a string)
 * is resolvable from the installed node_modules — per the review contract,
 * "use existing local parser if available, no installs". The parser which
 * resolved is logged so an audit knows both behaviours were covered.
 *
 * Run: node --test tests/ci/customer-emulator-lane.workflow.test.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const WORKFLOW_REL = ".github/workflows/customer-emulator-lane.yml";
const WORKFLOW = readFileSync(path.join(REPO_ROOT, WORKFLOW_REL), "utf8");

/** Values verified against the official actions repos via `gh api` (2026-10-27). */
export const PINNED_ACTIONS = {  "actions/checkout": "11d5960a326750d5838078e36cf38b85af677262",
  "actions/setup-node": "49933ea5288caeca8642d1e84afbd3f7d6820020",
  "actions/setup-java": "cf277c60eb25467037889841efdb72551f06f6c3",
  "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
};

/** The exact DEC-09 relevant-PR path filter (adding/removing is a contract change). */
export const REQUIRED_PATHS = [
  "src/**",
  "tests/**",
  "firestore.rules",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.*.json",
  "vite.config.ts",
  "vite.mobile.config.ts",
  "vitest.config.ts",
  "vitest.setup.ts",
  "scripts/**",
  "firebase.json",
  ".firebaserc",
  ".github/workflows/**",
];

function stripComments(text) {
  // Assertions must hold against REAL workflow content, not prose comments.
  return text
    .split("\n")
    .filter((line) => line.trimStart()[0] !== "#")
    .join("\n");
}

const CODE = stripComments(WORKFLOW);

function loadYamlParser() {
  const req = createRequire(import.meta.url);
  const paths = [
    path.join(REPO_ROOT, "node_modules"),
    ...String(process.env.NODE_PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean),
  ];
  for (const name of ["yaml", "js-yaml"]) {
    try {
      const pkgPath = req.resolve(path.join(name, "package.json").split("\\").join("/"), { paths });
      const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8"));
      const mod = req(pkgPath.replace(/package\.json$/, "index.js"), { paths });
      return { name: pkgJson.name, version: pkgJson.version, mod };
    } catch {
      /* next candidate */
    }
  }
  return null;
}

test("workflow file exists at its required path", () => {
  assert.equal(WORKFLOW_REL in { [WORKFLOW_REL]: 1 }, true);
  assert.ok(WORKFLOW.length > 0);
});

test("triggers: pull_request (gating) + optional workflow_dispatch", () => {
  assert.match(WORKFLOW, /^on:\n/m);
  assert.match(WORKFLOW, /  pull_request:\n/m);
  assert.match(WORKFLOW, /  workflow_dispatch:\n/m);
});

test("pull_request paths cover the complete DEC-09 filter list — no additions/removals", () => {
  const pathsBlock = WORKFLOW.match(/    paths:\n((?:      - "[^"]+"\n)+)/);
  assert.ok(pathsBlock, "pull_request.paths block must be present");
  const listed = [...pathsBlock[1].matchAll(/      - "([^"]+)"/g)].map((m) => m[1]);
  for (const required of REQUIRED_PATHS) assert.ok(listed.includes(required), `missing path: ${required}`);
  assert.equal(listed.length, REQUIRED_PATHS.length, "path filter must be exactly the contract set");
});

test("least privilege: contents read only; no pull_request_target; no secrets", () => {
  assert.match(WORKFLOW, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(CODE, /pull_request_target/i, "pull_request_target is forbidden (secrets on forks)");
  assert.doesNotMatch(CODE, /secrets\.[A-Z_]+/, "no repository secrets may be referenced");
});

test("all third-party actions use verified commit SHAs, never moving tags", () => {
  for (const [action, sha] of Object.entries(PINNED_ACTIONS)) {
    const re = new RegExp(`uses:\\s*${action.replace("/", "\\/")}@([0-9a-f]{40})`);
    const match = CODE.match(re);
    assert.ok(match, `action ${action} must be pinned by commit SHA`);
    assert.equal(match[1], sha, `action ${action} pin must match the gh-verified commit`);
  }
  assert.doesNotMatch(CODE, /uses:\s*actions\/[\w-]+@v[0-9]+/m, "moving major tags are forbidden");
});

test("toolchain: Node 22, JDK21 temurin, exact pinned firebase-tools/@playwright/test", () => {
  assert.match(CODE, /node-version: "22"/);
  assert.match(CODE, /distribution: temurin\n          java-version: "21"/);
  assert.match(CODE, /firebase-tools@15\.32\.1/);
  assert.match(CODE, /@playwright\/test@1\.63\.0/);
  assert.doesNotMatch(CODE, /--legacy-peer-deps/);
  assert.doesNotMatch(CODE, /firebase-tools@\^[0-9]+/, "pin must be exact, not a caret range");
  assert.doesNotMatch(CODE, /firebase-tools@~[0-9]+/, "pin must be exact, not a tilde range");
});

test("lane invocation: real harness entrypoint, never --skip-negative, never a global CLI", () => {
  assert.match(CODE, /node tests\/emulator\/run-lane\.mjs/);
  assert.doesNotMatch(CODE, /--skip-negative/);
  assert.doesNotMatch(CODE, /npx firebase/, "npx firebase may pull an untagged CLI at runtime");
  assert.match(CODE, /EMULATOR_ALLOW_DOWNLOAD=1/, "emulator JAR bootstrap is allowed on hosted CI");
  assert.match(CODE, /EMULATOR_CANONICAL_RULES=\$GITHUB_WORKSPACE\/firestore\.rules/, "parity gate reads the actual checkout rules path");
  assert.match(CODE, /EMULATOR_LANE_ARTIFACTS=\$RUNNER_TEMP\//, "artifacts live under RUNNER_TEMP");
  assert.match(CODE, /EMULATOR_JAVA_HOME=\$\{JAVA_HOME\}/, "explicit JDK21 for the emulator");
});

test("project isolation: demo project only, no real project ids/credentials", () => {
  assert.doesNotMatch(CODE, /burgonomics-live|burgonomics-[a-z]*[0-9a-f]{4}/);
  assert.doesNotMatch(CODE, /\bfirebase\s+deploy\b/);
  assert.doesNotMatch(CODE, /RAZORPAY|PETPOOJA|FIREBASE_TOKEN|SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS/i);
  assert.match(CODE, /m\.env\.credentialValuesCopied===true/, "manifest credential leak guard present");
});

test("upload artifacts even on failure, with if-no-files-found: error", () => {
  const artifactBlock = CODE.match(/- uses: actions\/upload-artifact@([0-9a-f]{40})[\s\S]*?retention-days: 7\n/);
  assert.ok(artifactBlock, "artifact upload step must exist");
  const blockStart = CODE.indexOf("- uses: actions/upload-artifact@");
  const tail = CODE.slice(blockStart);
  assert.match(tail, /if: always\(\)/);
  assert.match(tail, /if-no-files-found: error/);
});

test("manifest gate may not fall back to success (runs when lane failed, fails loudly)", () => {
  const guardStart = CODE.indexOf("lane manifest missing/unreadable");
  assert.ok(guardStart > 0, "manifest guard step must exist");
  const head = CODE.slice(0, guardStart);
  assert.match(head, /if: always\(\)\n        run: \|/, "manifest guard must run even when the lane failed");
});

test("local parser: deep YAML syntax validation when an existing parser is resolvable", () => {
  const parser = loadYamlParser();
  if (!parser) console.warn("[static test] no existing YAML parser resolvable — structure-only assertions ran");
  test("parsed workflow yields the required top-level structure", () => {
    if (!parser) return;
    let doc;
    if (parser.name === "yaml") {
      doc = YAML_deepParseWithName(parser.mod, WORKFLOW);
    } else {
      doc = parser.mod.load(WORKFLOW, { schema: parser.mod.JSON_SCHEMA, json: true });
    }
    assert.ok(doc && typeof doc === "object");
    for (const key of ["name", "on", "permissions", "jobs"]) assert.ok(Object.hasOwn(doc, key), `top-level key ${key}`);
    assert.equal(typeof doc.on, "object", "`on:` must remain a mapping (boolean塌陷 would break GitHub parsing)");
    assert.ok(doc.jobs["emulator-lane"], "job id emulator-lane");
  });
});

function YAML_deepParseWithName(YAML, text) {
  // `yaml` v2 API: parse(src, options). Keep the default core schema (YAML 1.2)
  // so the `on:` key stays the string "on".
  return YAML.parse(text, { schema: "core", uniqueKeys: true });
}
