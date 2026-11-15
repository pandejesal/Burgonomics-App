/**
 * Static (pure) contract test for the CI **unit / rules routing** in
 * .github/workflows/ci.yml — no emulator, no network, no installs.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ci.yml`'s `web` job used to run `npx vitest run`, which collects everything
 * under `vitest.config.ts`'s `include` — including `tests/rules/**`. Those nine
 * Firestore-rules files need a live Firestore emulator, so the unit job failed
 * them while the dedicated, emulator-backed `rules` job passed the very same
 * tests. The routing now is:
 *
 *   web   -> `npm test`      (= `vitest run --exclude "tests/rules/**"`)
 *   rules -> emulator + the FULL `tests/rules` directory
 *
 * Both halves are asserted, because either half alone is a regression:
 *   - if `web` runs rules again, the unit job fails without an emulator;
 *   - if `rules` narrows or becomes conditional, rules coverage silently drops
 *     while `web`'s exclude makes the suite look green.
 *
 * The exclude glob and the rules-job target must cover the same directory, which
 * is checked against the real filesystem, not against a hardcoded file list — so
 * a newly added `tests/rules/*.rules.test.ts` is covered by construction.
 *
 * Run: node --test tests/ci/customer-unit-rules-split.workflow.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const CI_REL = ".github/workflows/ci.yml";
const CLAIMED_RULES_DIR = "tests/rules";

const CI_TEXT = readFileSync(path.join(REPO_ROOT, CI_REL), "utf8").replace(/\r\n?/g, "\n");
const PACKAGE_JSON = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));

const WEB_JOB = "web";
const RULES_JOB = "rules";

/**
 * The exact `run:` sequence the `web` job must keep. Pinning the whole list (not
 * just the last step) is what makes "all gates unchanged except one invocation"
 * checkable: build, typecheck and lint must still gate the unit suite, and the
 * unit suite must be the package script rather than a hand-written vitest call.
 */
const EXPECTED_WEB_RUNS = [
  "npm ci",
  "node --test tests/ci/customer-unit-rules-split.workflow.test.mjs",
  "npm run build -- --mode staging",
  "npx tsc -p tsconfig.json --noEmit",
  "npm run lint",
  "npm test",
];

/** Tokens that must never appear in the web job: they mean rules leaked back in. */
const WEB_FORBIDDEN = ["vitest", "firebase", "emulator", "tests/rules", "--exclude"];

function loadYamlParser() {
  // Same policy as the sibling workflow guard: use an installed parser, never
  // install one. `yaml` is preferred; `js-yaml` is a declared devDependency.
  const req = createRequire(import.meta.url);
  const paths = [path.join(REPO_ROOT, "node_modules")];
  for (const name of ["yaml", "js-yaml"]) {
    try {
      const pkgPath = req.resolve(`${name}/package.json`, { paths }).split("\\").join("/");
      const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8"));
      const mod = req(pkgPath.replace(/package\.json$/, "index.js"), { paths });
      return { name: pkgJson.name, version: pkgJson.version, mod };
    } catch {
      /* next candidate */
    }
  }
  return null;
}

const parser = loadYamlParser();

function loadCi() {
  assert.ok(parser, "a local YAML parser (yaml or js-yaml) must be resolvable — no installs");
  if (parser.name === "yaml") return parser.mod.parse(CI_TEXT);
  return parser.mod.load(CI_TEXT);
}

function jobSteps(document, jobName) {
  const job = document?.jobs?.[jobName];
  assert.ok(job, `ci.yml must define the "${jobName}" job`);
  return Array.isArray(job.steps) ? job.steps : [];
}

/** A step's `run:` script, with shell line-continuations and blank lines removed. */
function stepRun(step) {
  const raw = typeof step?.run === "string" ? step.run : "";
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function runScripts(steps) {
  return steps.map(stepRun).filter(Boolean);
}

function isUnsafeValue(value) {
  // `continue-on-error: ${{ ... }}` is not a decision this guard can evaluate.
  return value !== undefined && value !== false && value !== null;
}

const document = loadCi();
const webSteps = jobSteps(document, WEB_JOB);
const rulesSteps = jobSteps(document, RULES_JOB);
const webRuns = runScripts(webSteps);
const rulesRuns = runScripts(rulesSteps);

// ---------------------------------------------------------------------------

test("ci.yml parses and both routing jobs exist", () => {
  assert.equal(parser !== null, true, "YAML parser resolved");
  assert.ok(document && typeof document === "object", "ci.yml must parse to a mapping");
  assert.ok(document.jobs && typeof document.jobs === "object", "ci.yml must define jobs");
  assert.ok(document.jobs[WEB_JOB], `"${WEB_JOB}" job missing`);
  assert.ok(document.jobs[RULES_JOB], `"${RULES_JOB}" job missing`);
  assert.ok(webRuns.length >= 5, `web job should keep its gates, saw ${webRuns.length} run steps`);
});

test("web job keeps build + typecheck + lint and runs the unit script, in order", () => {
  assert.deepEqual(
    webRuns,
    EXPECTED_WEB_RUNS,
    `web job run steps changed. Expected exactly:\n  ${EXPECTED_WEB_RUNS.join("\n  ")}\n` +
      `got:\n  ${webRuns.join("\n  ")}\n` +
      "Routing rule: the unit step must be `npm test` (package script excludes tests/rules/**), " +
      "and no other gate may be added, dropped or reordered.",
  );
});

test("web job runs no rules test and boots no emulator", () => {
  const serialized = JSON.stringify(webSteps);
  for (const token of WEB_FORBIDDEN) {
    assert.equal(
      serialized.toLowerCase().includes(token.toLowerCase()),
      false,
      `web job must not mention "${token}" — rules tests need the emulator and belong to the rules job`,
    );
  }
  // The unit step must be the package script, never a hand-rolled vitest call.
  assert.equal(
    webRuns.filter((run) => /^npm (run )?test\b/.test(run)).length,
    1,
    "exactly one unit-test invocation (`npm test`) must exist in the web job",
  );
});

test("package.json `test` really excludes the whole rules directory", () => {
  const script = PACKAGE_JSON?.scripts?.test;
  assert.equal(typeof script, "string", "package.json must keep a `test` script");
  assert.match(script, /\bvitest run\b/, "`test` must still be a vitest run");
  assert.match(
    script,
    /--exclude\s+"?tests\/rules\/(?:\*\*)?/,
    `\`test\` must exclude tests/rules/** so the web job cannot collect emulator-only tests; got: ${script}`,
  );
  assert.doesNotMatch(
    script,
    /--passWithNoTests/,
    "`test` must not be able to pass on an empty run",
  );
});

test("the exclude glob covers every rules test file on disk", () => {
  const script = PACKAGE_JSON?.scripts?.test ?? "";
  const match = script.match(/--exclude\s+"?([^"\s]+)"?/);
  assert.ok(match, "`test` must pass an --exclude glob");
  const glob = match[1];

  const rulesDir = path.join(REPO_ROOT, CLAIMED_RULES_DIR);
  const rulesFiles = readdirSync(rulesDir).filter((name) => /\.test\.tsx?$/.test(name));
  assert.ok(rulesFiles.length > 0, `${CLAIMED_RULES_DIR} must still contain rules tests`);

  // `tests/rules/**` covers `tests/rules/x.test.ts`: assert the glob's directory
  // prefix matches every real file, so a new rules file is covered automatically.
  const globPrefix = glob.replace(/\*+$/, "");
  for (const name of rulesFiles) {
    const rel = `${CLAIMED_RULES_DIR}/${name}`;
    assert.ok(
      rel.startsWith(globPrefix),
      `${rel} would still be collected by \`npm test\` (exclude glob: ${glob})`,
    );
  }
});

test("rules job is mandatory: no `if:`, no continue-on-error", () => {
  const job = document.jobs[RULES_JOB];
  assert.equal(
    job.if,
    undefined,
    "the rules job must not be conditional — a skipped job silently drops all rules coverage",
  );
  assert.equal(
    isUnsafeValue(job["continue-on-error"]),
    false,
    "the rules job must not set continue-on-error",
  );
  for (const step of rulesSteps) {
    assert.equal(
      step.if,
      undefined,
      `rules job step "${step.name || step.uses || step.run}" must not be conditional`,
    );
    assert.equal(
      isUnsafeValue(step["continue-on-error"]),
      false,
      `rules job step "${step.name || step.uses || step.run}" must not set continue-on-error`,
    );
  }
});

test("rules job boots a real Firestore emulator on JDK 21", () => {
  assert.ok(
    rulesSteps.some((step) => String(step.uses ?? "").startsWith("actions/setup-java@")),
    "rules job must set up a JDK (the emulator needs one)",
  );
  const javaSetup = rulesSteps.find((step) =>
    String(step.uses ?? "").startsWith("actions/setup-java@"),
  );
  assert.equal(
    javaSetup?.with?.["java-version"],
    "21",
    "the rules emulator is pinned to JDK 21, matching the lane",
  );

  const emulatorSteps = rulesRuns.filter((run) => /firebase\s+emulators:exec/.test(run));
  assert.equal(
    emulatorSteps.length,
    1,
    `the rules suite must be wrapped in exactly one \`firebase emulators:exec\`; saw ${emulatorSteps.length}`,
  );
  const invocation = emulatorSteps[0];
  assert.match(invocation, /--only\s+firestore\b/, "the emulator must be scoped to firestore");
  assert.match(
    invocation,
    /--project\s+\S+/,
    "the emulator must run against an explicit project id",
  );
  assert.doesNotMatch(invocation, /\bfirebase\s+deploy\b/, "the rules job must never deploy");
});

test("rules job runs the full suite: the directory, not a single file", () => {
  const invocation = rulesRuns.find((run) => /firebase\s+emulators:exec/.test(run));
  assert.ok(invocation, "rules job invocation not found");

  // The command must target the rules DIRECTORY, so newly added rules files are
  // covered without editing CI.
  assert.match(
    invocation,
    new RegExp(`(?:^|\\s)${CLAIMED_RULES_DIR.replace("/", "\\/")}(?![\\w./-])`),
    `the rules job must run the whole ${CLAIMED_RULES_DIR} directory so new rules files are covered`,
  );
  assert.doesNotMatch(
    invocation,
    new RegExp(`${CLAIMED_RULES_DIR.replace("/", "\\/")}\\/[\\w.$-]+\\.test\\.tsx?`),
    "the rules job must not be narrowed to a single rules file",
  );
  assert.doesNotMatch(invocation, /--passWithNoTests/, "an empty rules run must not look green");

  // Determinism: every rules file calls clearFirestore() in beforeEach, so
  // parallel files wipe each other's seeds. These flags are part of the gate.
  assert.match(invocation, /--fileParallelism=false/, "rules files must run sequentially");
  assert.match(invocation, /--hookTimeout=\d+/, "the emulator hook timeout must be explicit");
});

test("routing is total: excluded directory is exactly the rules job's target", () => {
  const script = PACKAGE_JSON?.scripts?.test ?? "";
  const excluded = (script.match(/--exclude\s+"?([^"\s]+)"?/)?.[1] ?? "").replace(/\*+$/, "");
  const invocation = rulesRuns.find((run) => /firebase\s+emulators:exec/.test(run)) ?? "";

  assert.equal(
    excluded.replace(/\/$/, ""),
    CLAIMED_RULES_DIR,
    `web excludes "${excluded}" but rules live in "${CLAIMED_RULES_DIR}" — coverage would fall in the gap`,
  );
  // `vitest run tests/rules` (no trailing slash) and `tests/rules/**` both name
  // the same directory; match on the path as a whole token.
  const coversDirectory = new RegExp(
    `(?:^|[\\s"'=:])${CLAIMED_RULES_DIR.replace("/", "\\/")}(?:\\/\\*\\*)?(?=[\\s"']|$)`,
  );
  assert.ok(
    coversDirectory.test(invocation) || /npm run test:?rules\b/.test(invocation),
    `rules job must cover ${CLAIMED_RULES_DIR} (directly or via the test:rules script); got: ${invocation}`,
  );

  // No other job may collect the rules suite: that is how the emulator-less
  // failure happened in the first place.
  for (const [name, job] of Object.entries(document.jobs)) {
    if (name === RULES_JOB) continue;
    const runs = runScripts(Array.isArray(job.steps) ? job.steps : []);
    for (const run of runs) {
      assert.doesNotMatch(
        run,
        new RegExp(`(?:^|[\\s"'=])${CLAIMED_RULES_DIR.replace("/", "\\/")}`),
        `job "${name}" must not run ${CLAIMED_RULES_DIR} — it has no emulator`,
      );
    }
  }
});
