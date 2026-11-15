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
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const WORKFLOW_REL = ".github/workflows/customer-emulator-lane.yml";
const WORKFLOW = readFileSync(path.join(REPO_ROOT, WORKFLOW_REL), "utf8").replace(/\r\n?/g, "\n");

/** Values verified against the official actions repos via `gh api` (2026-10-27). */
export const PINNED_ACTIONS = {
  "actions/checkout": "11d5960a326750d5838078e36cf38b85af677262",
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
  for (const required of REQUIRED_PATHS)
    assert.ok(listed.includes(required), `missing path: ${required}`);
  assert.equal(
    listed.length,
    REQUIRED_PATHS.length,
    "path filter must be exactly the contract set",
  );
});

test("least privilege: contents read only; no pull_request_target; no secrets", () => {
  assert.match(WORKFLOW, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(
    CODE,
    /pull_request_target/i,
    "pull_request_target is forbidden (secrets on forks)",
  );
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
  assert.match(CODE, /firebase-tools@15\.35\.0/);
  assert.match(CODE, /@playwright\/test@1\.63\.0/);
  assert.doesNotMatch(CODE, /--legacy-peer-deps/);
  assert.doesNotMatch(CODE, /firebase-tools@\^[0-9]+/, "pin must be exact, not a caret range");
  assert.doesNotMatch(CODE, /firebase-tools@~[0-9]+/, "pin must be exact, not a tilde range");
  // The ephemeral workspace install must not execute package lifecycle scripts.
  assert.match(CODE, /npm install --prefix[^\n]*--ignore-scripts/);
  // No stale pin may survive in the header, the install line, the node -e
  // assertion or the success log.
  assert.doesNotMatch(CODE, /15\.32\.1/, "no 15.32.1 reference may remain");
});

test("both install paths in the lane disable package lifecycle scripts", () => {
  // The lane has TWO installs: the workspace `npm ci` (line ~80) and the
  // ephemeral `npm install --prefix` toolchain. Both must block hooks, or a
  // compromised/compromised-by-transitive package runs install scripts inside
  // CI where repository tokens and the emulator live.
  const workspaceInstall = CODE.match(/run:\s*npm ci[^\n]*/g) ?? [];
  assert.equal(workspaceInstall.length, 1, "exactly one workspace npm ci must exist");
  assert.match(
    workspaceInstall[0],
    /--ignore-scripts/,
    "the workspace npm ci must pass --ignore-scripts",
  );

  const ephemeralInstall = CODE.match(/npm install --prefix[^\n]*/g) ?? [];
  assert.equal(ephemeralInstall.length, 1, "exactly one ephemeral prefix install must exist");
  assert.match(
    ephemeralInstall[0],
    /--ignore-scripts/,
    "the ephemeral toolchain install must pass --ignore-scripts",
  );

  // No other npm install/ci invocation may exist that skips the flag.
  const allInstalls = [...CODE.matchAll(/npm (?:ci|install)(?![^\n]*--ignore-scripts)[^\n]*/g)].map(
    (m) => m[0],
  );
  assert.deepEqual(
    allInstalls,
    [],
    `every npm install/ci in the lane must disable lifecycle scripts; offenders: ${JSON.stringify(allInstalls)}`,
  );
});

test("lane invocation: real harness entrypoint, never --skip-negative, never a global CLI", () => {
  assert.match(CODE, /node tests\/emulator\/run-lane\.mjs/);
  assert.doesNotMatch(CODE, /--skip-negative/);
  assert.doesNotMatch(CODE, /npx firebase/, "npx firebase may pull an untagged CLI at runtime");
  assert.match(CODE, /EMULATOR_ALLOW_DOWNLOAD=1/, "emulator JAR bootstrap is allowed on hosted CI");
  assert.match(
    CODE,
    /EMULATOR_CANONICAL_RULES=\$GITHUB_WORKSPACE\/firestore\.rules/,
    "parity gate reads the actual checkout rules path",
  );
  assert.match(CODE, /EMULATOR_LANE_ARTIFACTS=\$RUNNER_TEMP\//, "artifacts live under RUNNER_TEMP");
  assert.match(CODE, /EMULATOR_JAVA_HOME=\$\{JAVA_HOME\}/, "explicit JDK21 for the emulator");
});

test("project isolation: demo project only, no real project ids/credentials", () => {
  assert.doesNotMatch(CODE, /burgonomics-live|burgonomics-[a-z]*[0-9a-f]{4}/);
  assert.doesNotMatch(CODE, /\bfirebase\s+deploy\b/);
  assert.doesNotMatch(
    CODE,
    /RAZORPAY|PETPOOJA|FIREBASE_TOKEN|SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS/i,
  );
  assert.match(
    CODE,
    /m\.env\.credentialValuesCopied===true/,
    "manifest credential leak guard present",
  );
});

test("upload artifacts even on failure, with if-no-files-found: error", () => {
  const artifactBlock = CODE.match(
    /- uses: actions\/upload-artifact@([0-9a-f]{40})[\s\S]*?retention-days: 7\n/,
  );
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
  assert.match(
    head,
    /if: always\(\)\n        run: \|/,
    "manifest guard must run even when the lane failed",
  );
});

// ---------------------------------------------------------------------------
// Pinned toolchain must be resolvable ON DISK, not through NODE_PATH.
//
// run-lane.mjs builds the lane child env from an explicit allowlist, so
// NODE_PATH never reaches lane.mjs; its `require.resolve("@playwright/test/cli")`
// therefore failed on CI with MODULE_NOT_FOUND after the routing step removed
// the checkout copies. The workflow must link the exact pinned packages back
// into this repo's node_modules, and it must fail closed.
//
// Two separate proofs: a static one over the real workflow text (does the step
// link both packages, from the pinned prefix, into this checkout?), and a
// runtime one in a synthetic tree (does a link from a nested module actually
// resolve with NODE_PATH absent, and fail without it?).
// ---------------------------------------------------------------------------

const REPO_NODE_MODULES = "node_modules";
const PINNED_PREFIX = "$RUNNER_TEMP/ci-tool/node_modules";
const LINK_STEP = "Link the pinned toolchain into node_modules";

/** Slices one workflow step by its `name:` marker, up to the next step. */
function stepBlock(name) {
  const marker = `      - name: ${name}\n`;
  const start = CODE.indexOf(marker);
  if (start < 0) return null;
  const rest = CODE.slice(start + marker.length);
  const next = rest.indexOf("\n      - ");
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * Pure text-level contract for the pinned links. Mirrored on the harness gate,
 * but with THIS checkout as the destination: the customer app has no
 * sub-harness, so the lane resolves from the repo root.
 */
function pinnedLinkProblems(text) {
  const problems = [];
  const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const pkg of ["firebase-tools", "@playwright/test"]) {
    const call = new RegExp(
      `link_pinned "\\$RUNNER_TEMP/ci-tool/node_modules/${escapeRe(pkg)}" "${escapeRe(REPO_NODE_MODULES)}/${escapeRe(pkg)}"`,
    );
    if (!call.test(text)) problems.push(`no checkout-local link from the pinned prefix for ${pkg}`);
  }
  if (!/ln -s "\$source_path" "\$target_path"/.test(text)) {
    problems.push("links are not created with ln -s from the checked source");
  }
  if (!text.includes(`mkdir -p "${REPO_NODE_MODULES}/@playwright"`)) {
    problems.push("the scoped @playwright parent directory is not created first");
  }
  if (!/\[ -e "\$target_path" \] \|\| \[ -L "\$target_path" \]/.test(text)) {
    problems.push("an unexpected existing link target is not rejected (fail-closed missing)");
  }
  if (!/\[ ! -e "\$source_path" \]/.test(text)) {
    problems.push("a missing pinned source is not rejected (fail-closed missing)");
  }
  if (/NODE_PATH/.test(text)) problems.push("the runtime link step must not depend on NODE_PATH");
  if (
    /npm root -g|npm prefix -g|npm ls -g|\.npm-global|\/usr\/local\/lib\/node_modules|\/usr\/lib\/node_modules/.test(
      text,
    )
  ) {
    problems.push("a global/ambient toolchain fallback is present");
  }
  const destinations = [...text.matchAll(/link_pinned\s+"([^"]+)"\s+"([^"]+)"/g)].map((m) => m[2]);
  if (destinations.some((destination) => !destination.startsWith(`${REPO_NODE_MODULES}/`))) {
    problems.push("every link destination must sit in this checkout's node_modules");
  }
  return problems;
}

test("static: the pinned toolchain is linked into this checkout's node_modules", () => {
  const block = stepBlock(LINK_STEP);
  assert.ok(block, `workflow must keep a step named "${LINK_STEP}"`);
  assert.equal(block.match(/npm ci/), null, "link step must not install anything");
  const problems = pinnedLinkProblems(block);
  assert.deepEqual(problems, [], problems.join("; "));
  assert.match(block, /node_modules\/firebase-tools/);
  assert.match(block, /node_modules\/@playwright\/test/);

  // Ordering: after the checkout copies are removed, before anything resolves
  // them (the version assertion) and before the lane runs.
  const at = (marker) => {
    const index = CODE.indexOf(marker);
    assert.ok(index > 0, `workflow must still contain: ${marker}`);
    return index;
  };
  const linkAt = at(`- name: ${LINK_STEP}`);
  const routeAt = at("rm -rf node_modules/firebase-tools node_modules/@playwright/test");
  const assertAt = at("- name: Assert exact pinned tool versions");
  const laneAt = at("run: node tests/emulator/run-lane.mjs");
  assert.ok(routeAt < linkAt, "links must be created after the checkout copies are removed");
  assert.ok(linkAt < assertAt, "links must exist before the pinned version assertion");
  assert.ok(linkAt < laneAt, "links must exist before the lane runs");
});

test("static: single-package, unpinned-prefix, ambient or NODE_PATH routing is rejected", () => {
  const block = stepBlock(LINK_STEP);
  assert.ok(block, "real link step must exist before its negative fixtures are meaningful");

  const onePackageOnly = block.replace(
    /\n\s*link_pinned "\$RUNNER_TEMP\/ci-tool\/node_modules\/@playwright\/test"[^\n]*/,
    "",
  );
  assert.notEqual(onePackageOnly, block, "fixture must remove the @playwright/test link");
  assert.ok(
    pinnedLinkProblems(onePackageOnly).includes(
      "no checkout-local link from the pinned prefix for @playwright/test",
    ),
    "one-package-only routing must be rejected",
  );

  const wrongPrefix = block.replaceAll(PINNED_PREFIX, "$RUNNER_TEMP/unpinned/node_modules");
  assert.notEqual(wrongPrefix, block);
  assert.deepEqual(
    pinnedLinkProblems(wrongPrefix).filter((problem) =>
      problem.startsWith("no checkout-local link"),
    ),
    [
      "no checkout-local link from the pinned prefix for firebase-tools",
      "no checkout-local link from the pinned prefix for @playwright/test",
    ],
    "an unpinned/wrong prefix must be rejected for both packages",
  );

  const globalFallback = `${block}\n          ln -s "$(npm root -g)/firebase-tools" "node_modules/firebase-tools"\n`;
  assert.ok(
    pinnedLinkProblems(globalFallback).includes("a global/ambient toolchain fallback is present"),
    "a global toolchain fallback must be rejected",
  );

  const nodePathDependency = `${block}\n          echo "NODE_PATH=$RUNNER_TEMP/ci-tool/node_modules"\n`;
  assert.ok(
    pinnedLinkProblems(nodePathDependency).includes(
      "the runtime link step must not depend on NODE_PATH",
    ),
    "a runtime link step that reintroduces NODE_PATH must be rejected",
  );

  const outsideDestination = `${block}\n          link_pinned "$RUNNER_TEMP/ci-tool/node_modules/firebase-tools" "/opt/tools/firebase-tools"\n`;
  assert.ok(
    pinnedLinkProblems(outsideDestination).includes(
      "every link destination must sit in this checkout's node_modules",
    ),
    "a link destination outside the checkout must be rejected",
  );

  const overwriteExisting = block.replace(
    /\[ -e "\$target_path" \] \|\| \[ -L "\$target_path" \]/g,
    "false",
  );
  assert.notEqual(overwriteExisting, block);
  assert.ok(
    pinnedLinkProblems(overwriteExisting).includes(
      "an unexpected existing link target is not rejected (fail-closed missing)",
    ),
    "dropping the existing-target guard must be rejected",
  );
});

/**
 * Runtime resolver proof. Builds a synthetic checkout with a nested module (the
 * lane's position), the pinned packages in an ephemeral prefix, and directory
 * links between them, then resolves BOTH paths from the child with NODE_PATH
 * absent. This proves the mechanism, not that the remote workflow executed it.
 */
test("runtime: a nested module resolves the pinned packages through links without NODE_PATH", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "customer-lane-links-"));
  const prefixModules = path.join(root, "prefix", "node_modules");
  const projectModules = path.join(root, "project", "node_modules");
  const nested = path.join(root, "project", "tests", "emulator");
  const probe = path.join(nested, "probe.cjs");

  const writePackage = (dir, name, files) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name, version: "1.0.0", main: "index.js" }, null, 2)}\n`,
    );
    writeFileSync(path.join(dir, "index.js"), "module.exports = {};\n");
    for (const [rel, body] of Object.entries(files ?? {})) {
      const file = path.join(dir, rel);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, body);
    }
  };

  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "NODE_PATH"),
  );

  try {
    writePackage(path.join(prefixModules, "firebase-tools"), "firebase-tools", {
      "lib/bin/firebase.js": "module.exports = 'firebase-cli';\n",
    });
    writePackage(path.join(prefixModules, "@playwright", "test"), "@playwright/test", {
      "cli.js": "module.exports = 'playwright-cli';\n",
    });

    mkdirSync(nested, { recursive: true });
    writeFileSync(
      probe,
      [
        "const out = { playwright: null, firebase: null, error: null };",
        "try {",
        '  out.playwright = require.resolve("@playwright/test/cli");',
        "} catch (err) {",
        "  out.error = err.code || err.message;",
        "}",
        "try {",
        '  out.firebase = require.resolve("firebase-tools/lib/bin/firebase.js");',
        "} catch (err) {",
        '  out.error = (out.error ? `${out.error}+` : "") + (err.code || err.message);',
        "}",
        "console.log(JSON.stringify(out));",
        "",
      ].join("\n"),
    );

    const runProbe = () => {
      const result = spawnSync(process.execPath, [probe], { encoding: "utf8", env });
      assert.equal(result.status, 0, `probe must run: ${result.stderr}`);
      return JSON.parse(result.stdout.trim());
    };

    // Without the links the lane fails exactly as the remote run did.
    const unlinked = runProbe();
    assert.equal(unlinked.playwright, null, "unlinked resolution must fail");
    assert.match(String(unlinked.error), /MODULE_NOT_FOUND/, "the failure is the CI failure");

    // Now link the pinned packages the way the workflow does.
    mkdirSync(path.join(projectModules, "@playwright"), { recursive: true });
    const linkDir = (source, target) => {
      symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
    };
    linkDir(
      path.join(prefixModules, "firebase-tools"),
      path.join(projectModules, "firebase-tools"),
    );
    linkDir(
      path.join(prefixModules, "@playwright", "test"),
      path.join(projectModules, "@playwright", "test"),
    );

    const linked = runProbe();
    assert.equal(linked.error, null, `linked resolution must succeed: ${linked.error}`);
    assert.ok(
      path.resolve(linked.playwright).startsWith(path.resolve(prefixModules)),
      `@playwright/test/cli must resolve inside the pinned prefix, got ${linked.playwright}`,
    );
    assert.ok(
      path.resolve(linked.firebase).startsWith(path.resolve(prefixModules)),
      `firebase-tools CLI must resolve inside the pinned prefix, got ${linked.firebase}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local parser: deep YAML syntax validation when an existing parser is resolvable", () => {
  const parser = loadYamlParser();
  if (!parser)
    console.warn(
      "[static test] no existing YAML parser resolvable — structure-only assertions ran",
    );
  test("parsed workflow yields the required top-level structure", () => {
    if (!parser) return;
    let doc;
    if (parser.name === "yaml") {
      doc = YAML_deepParseWithName(parser.mod, WORKFLOW);
    } else {
      doc = parser.mod.load(WORKFLOW, { schema: parser.mod.JSON_SCHEMA, json: true });
    }
    assert.ok(doc && typeof doc === "object");
    for (const key of ["name", "on", "permissions", "jobs"])
      assert.ok(Object.hasOwn(doc, key), `top-level key ${key}`);
    assert.equal(
      typeof doc.on,
      "object",
      "`on:` must remain a mapping (boolean塌陷 would break GitHub parsing)",
    );
    assert.ok(doc.jobs["emulator-lane"], "job id emulator-lane");
  });
});

function YAML_deepParseWithName(YAML, text) {
  // `yaml` v2 API: parse(src, options). Keep the default core schema (YAML 1.2)
  // so the `on:` key stays the string "on".
  return YAML.parse(text, { schema: "core", uniqueKeys: true });
}
