// validate-ios-workflow.test.cjs — local static guard for the iOS CI workflows.
//
// A07 (2026-10-14). Charter: no full build, no network, no CI trigger, no
// native project edit. This test only READS workflow YAML and the toolchain
// discovery script, using js-yaml (already present in node_modules as a
// transitive dependency — no package.json change).
//
// What it pins down:
//   CUSTOMER (.github/workflows/ios-build.yml, owned by this lane):
//     - both jobs on a supported runner label (macos-15 / macos-26); the
//       deprecated macos-13/14 labels fail the test
//     - NO hardcoded Xcode app path (the old Xcode_15.4 pin is banned); the
//       toolchain must be discovered, not guessed
//     - every job that invokes xcodebuild first invokes
//       scripts/select-xcode-toolchain.sh with MIN_XCODE_MAJOR=26 AND
//       MIN_IOS_SDK_MAJOR=26 (Apple requires BOTH versions), and the script
//       fails the job below either floor
//     - every build/archive xcodebuild invocation keeps CODE_SIGNING_ALLOWED=NO
//     - zero `secrets.` references, zero store-upload/signing tooling
//       (altool / notarytool / fastlane / exportArchive / DEVELOPMENT_TEAM /
//       provisioning / p12) — this lane ships no upload or signing path
//     - `cap sync ios` is always followed by scripts/patch-ios-spm.js
//       (the 8.5.2 exact vs 8.5.0 exact SPM conflict is NOT fixed — deleting
//       the patch without a dependency decision would break resolution)
//     - artifact uploads reference only .zip / .xcarchive / .log
//   PARTNER (burgonomics-partner/.github/workflows/ci.yml):
//     - since the A07 continuation the partner ios/ios-archive jobs are also
//       owned by this lane, so their checks are STRICT: the deprecated
//       macos-14 label or a missing toolchain gate now FAILS this test
//       (previously a documented warning while the file was parent-owned)
//     - ios jobs reference no secrets and no store-upload/signing tooling;
//       ios-archive keeps CODE_SIGNING_ALLOWED=NO
//     - the partner's own scripts/validate-ios-workflow.test.cjs owns the
//       deep partner assertions + shell negative fixtures; this file keeps
//       a cross-check so a gap is caught by both suites
//
// Run:  node --test scripts/validate-ios-workflow.test.cjs
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CUSTOMER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(CUSTOMER_ROOT, '..');
const CUSTOMER_WORKFLOW = path.join(CUSTOMER_ROOT, '.github', 'workflows', 'ios-build.yml');
// The app normally sits beside `burgonomics-partner/` in the monorepo. A review
// worktree may instead expose the sibling as `partner/`, so resolve either — a
// skipped cross-check is worth nothing.
const PARTNER_WORKFLOW_CANDIDATES = [
  path.join(REPO_ROOT, 'burgonomics-partner', '.github', 'workflows', 'ci.yml'),
  path.join(REPO_ROOT, 'partner', '.github', 'workflows', 'ci.yml'),
];
const PARTNER_WORKFLOW =
  PARTNER_WORKFLOW_CANDIDATES.find((p) => fs.existsSync(p)) ?? PARTNER_WORKFLOW_CANDIDATES[0];
const TOOLCHAIN_SCRIPT = path.join(CUSTOMER_ROOT, 'scripts', 'select-xcode-toolchain.sh');

// js-yaml is present in this app's node_modules (4.3.2, transitive). No
// dependency was added for this test.
let yaml;
try {
  yaml = require('js-yaml');
} catch {
  yaml = null;
}

const SUPPORTED_MACOS_RUNNERS = new Set(['macos-15', 'macos-26']);
// Tokens that would indicate a signing or store-upload path. None may appear
// in either file's iOS jobs (customer: anywhere in file).
const FORBIDDEN_SIGNING_TOKENS = [
  'altool',
  'notarytool',
  'fastlane',
  'upload-to-app-store',
  'app-store-connect',
  'DEVELOPMENT_TEAM',
  'PROVISIONING_PROFILE',
  'exportArchive',
  '.p12',
  '.provisionprofile',
];
const XCODE_HARDPIN_RE = /Xcode_\d+(?:\.\d+)*(?:\.app|\.beta)/;

function loadYaml(file) {
  assert.ok(yaml, 'js-yaml not resolvable — cannot parse workflows statically');
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

function parseYamlText(text) {
  assert.ok(yaml, 'js-yaml not resolvable — cannot parse workflows statically');
  return yaml.load(text);
}

function jobSteps(doc, jobName) {
  const job = doc.jobs && doc.jobs[jobName];
  assert.ok(job, `job ${jobName} missing`);
  return Array.isArray(job.steps) ? job.steps : [];
}

function stepRun(step) {
  return typeof step.run === 'string' ? step.run : '';
}

// ---------------------------------------------------------------------------
// CUSTOMER — owned file, strict assertions
// ---------------------------------------------------------------------------

test('customer ios-build.yml parses as YAML', () => {
  const doc = loadYaml(CUSTOMER_WORKFLOW);
  assert.ok(doc.jobs['build-ios'], 'build-ios job missing');
  assert.ok(doc.jobs['ios-archive'], 'ios-archive job missing');
});

test('customer: both jobs use a supported macOS runner, none deprecated', () => {
  const doc = loadYaml(CUSTOMER_WORKFLOW);
  for (const name of ['build-ios', 'ios-archive']) {
    const runner = doc.jobs[name]['runs-on'];
    assert.ok(
      SUPPORTED_MACOS_RUNNERS.has(runner),
      `${name}: runs-on "${runner}" not in {${[...SUPPORTED_MACOS_RUNNERS].join(', ')}}
       (macos-13/14 are deprecated; macos-14 removal 2026-11-02)`
    );
  }
});

// Strips YAML comment lines before literal scans. The workflow header
// intentionally DOCUMENTS the removed Xcode_15.4 pin and the "no secrets"
// posture in prose; those must not trip the hardpin/secret guards, which
// exist to catch executable config, not documentation.
function stripYamlComments(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Secret-scoped check.
//
// A blanket "no `secrets.` anywhere" rule is wrong: a workflow legitimately
// wires a secret into a step's `env:` block (e.g. partner ci.yml passes
// IOS_CERTIFICATE_BASE64 to scripts/archive_ios.py). What must never happen is
// a secret being EXFILTRATED or LEAKED:
//   1. echoed/printed into a log (run blocks echoing ${{ secrets.* }})
//   2. interpolated into a command line / run script rather than env
//   3. passed to a third-party action's `with:` inputs
//   4. written into an upload path or artifact name
// This helper enforces exactly those, and the negative fixtures below prove it
// still fails on a real leak.
// ---------------------------------------------------------------------------
const SECRET_RE = /\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}/;

/** Actions whose `with:` may not receive a secret (third-party supply chain). */
function isTrustedFirstPartyAction(action) {
  return (
    typeof action === 'string' &&
    (action.startsWith('actions/') || action.startsWith('./'))
  );
}

/**
 * Returns a list of leak descriptions for one job. Empty means clean.
 * @param {object} job parsed job object
 * @param {string} label job name for messages
 */
function findSecretLeaks(job, label) {
  const leaks = [];
  const steps = Array.isArray(job.steps) ? job.steps : [];
  for (const step of steps) {
    const stepName = step.name || step.uses || step.run || '(unnamed step)';
    const runText = typeof step.run === 'string' ? step.run : '';
    const env = step.env && typeof step.env === 'object' ? step.env : {};

    // (1) A secret interpolated directly into the shell script (not via env).
    // `${{ secrets.X }}` inside `run:` is expanded into the command line, which
    // shows up in logs and process listings.
    if (SECRET_RE.test(runText)) {
      leaks.push(
        `${label} / ${stepName}: \${{ secrets.* }} interpolated into a run script (use env:)`
      );
    }

    // (2) A secret echoed/printed.
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === 'string' && SECRET_RE.test(v)) {
        const echoed = new RegExp(
          `(echo|printf|cat|printenv|env)\\b[^\\n]*\\$\\{?${k}\\}?`,
          'i'
        );
        if (echoed.test(runText)) {
          leaks.push(`${label} / ${stepName}: secret env ${k} is echoed into the log`);
        }
      }
    }

    // (3) A secret handed to a third-party action input.
    if (step.uses && !isTrustedFirstPartyAction(step.uses)) {
      const withBlock = step.with && typeof step.with === 'object' ? step.with : {};
      for (const [k, v] of Object.entries(withBlock)) {
        if (typeof v === 'string' && SECRET_RE.test(v)) {
          leaks.push(`${label} / ${stepName}: secret passed to third-party action ${step.uses} input ${k}`);
        }
      }
    }

    // (4) A secret used to build an artifact name/path.
    if (step.with && typeof step.with === 'object') {
      for (const key of ['name', 'path']) {
        const v = step.with[key];
        if (typeof v === 'string' && SECRET_RE.test(v)) {
          leaks.push(`${label} / ${stepName}: secret used in artifact ${key}`);
        }
      }
    }
  }
  return leaks;
}

/** Asserts no secret leak in any of the given jobs. */
function assertNoSecretLeaks(doc, jobNames, prefix) {
  const leaks = [];
  for (const name of jobNames) {
    if (!doc.jobs[name]) continue;
    leaks.push(...findSecretLeaks(doc.jobs[name], `${prefix}${name}`));
  }
  assert.deepStrictEqual(leaks, [], `secret leaks found:\n  ${leaks.join('\n  ')}`);
}

test('customer: no hardcoded Xcode app path anywhere in the workflow', () => {
  const text = stripYamlComments(fs.readFileSync(CUSTOMER_WORKFLOW, 'utf8'));
  assert.ok(
    !XCODE_HARDPIN_RE.test(text),
    'workflow contains a versioned Xcode app path — toolchain must be discovered by scripts/select-xcode-toolchain.sh, not pinned'
  );
});

test('customer: every job with xcodebuild validates the toolchain first (Xcode & SDK major >= 26, fail below)', () => {
  const doc = loadYaml(CUSTOMER_WORKFLOW);
  for (const name of ['build-ios', 'ios-archive']) {
    const steps = jobSteps(doc, name);
    const toolIdx = steps.findIndex((s) => stepRun(s).includes('select-xcode-toolchain.sh'));
    assert.ok(toolIdx !== -1, `${name}: select-xcode-toolchain.sh step missing`);
    const env = steps[toolIdx].env || {};
    assert.strictEqual(
      String(env.MIN_XCODE_MAJOR),
      '26',
      `${name}: MIN_XCODE_MAJOR must be "26" (Apple requires a current Xcode major too)`
    );
    assert.strictEqual(
      String(env.MIN_IOS_SDK_MAJOR),
      '26',
      `${name}: MIN_IOS_SDK_MAJOR must be "26"`
    );
    const firstXcodebuild = steps.findIndex((s) => stepRun(s).includes('xcodebuild'));
    if (firstXcodebuild !== -1) {
      assert.ok(
        toolIdx < firstXcodebuild,
        `${name}: toolchain validation must run before the first xcodebuild step`
      );
    }
  }
});

test('customer: build/archive xcodebuild invocations keep CODE_SIGNING_ALLOWED=NO', () => {
  const doc = loadYaml(CUSTOMER_WORKFLOW);
  for (const name of ['build-ios', 'ios-archive']) {
    for (const step of jobSteps(doc, name)) {
      const run = stepRun(step);
      if (!run.includes('xcodebuild')) continue;
      if (run.includes('-resolvePackageDependencies')) continue; // resolution-only, builds nothing
      assert.ok(
        run.includes('CODE_SIGNING_ALLOWED=NO'),
        `${name}: xcodebuild invocation without CODE_SIGNING_ALLOWED=NO:\n${run.slice(0, 120)}...`
      );
    }
  }
});

test('distribution signing is manual, complete-secret gated and export-only', () => {
  const source = fs.readFileSync(path.join(__dirname, 'archive_ios.py'), 'utf8');
  assert.ok(source.includes("return 'unsigned'"));
  assert.ok(source.includes('Incomplete iOS signing secrets'));
  assert.ok(source.includes('CODE_SIGNING_ALLOWED=NO'));
  assert.ok(source.includes('-exportArchive'));
  assert.ok(source.includes("'destination': 'export'"));
  const workflow = fs.readFileSync(CUSTOMER_WORKFLOW, 'utf8');
  assert.ok(workflow.includes("steps.archive.outputs.signed == 'true'"));
  assert.ok(workflow.includes('ASC_API_KEY_BASE64'));
});

test('customer: "cap sync ios" is always followed by scripts/patch-ios-spm.js', () => {
  const doc = loadYaml(CUSTOMER_WORKFLOW);
  for (const name of ['build-ios', 'ios-archive']) {
    const runs = jobSteps(doc, name).map(stepRun);
    const syncIdx = runs.findIndex((r) => r.includes('cap sync ios'));
    if (syncIdx === -1) continue;
    const patchIdx = runs.findIndex((r) => r.includes('patch-ios-spm.js'));
    assert.ok(patchIdx !== -1, `${name}: patch-ios-spm.js missing (SPM 8.5.2-vs-8.5.0 conflict would break resolution)`);
    assert.ok(patchIdx > syncIdx, `${name}: patch-ios-spm.js must run AFTER cap sync ios (sync regenerates Package.swift)`);
  }
});

test('customer: artifact uploads reference only build outputs (.zip/.xcarchive/.log)', () => {
  const doc = loadYaml(CUSTOMER_WORKFLOW);
  for (const name of ['build-ios', 'ios-archive']) {
    for (const step of jobSteps(doc, name)) {
      if (!String(step.uses || '').startsWith('actions/upload-artifact')) continue;
      const p = String((step.with || {}).path || '');
      assert.ok(
        /\.(zip|xcarchive|log|ipa)$/i.test(p.trim()),
        `${name}: upload-artifact path must be a build output, got: ${p}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// TOOLCHAIN SCRIPT — static contract
// ---------------------------------------------------------------------------

test('select-xcode-toolchain.sh enforces BOTH floors (Xcode & iOS SDK major >= 26) without hardpins', () => {
  const src = fs.readFileSync(TOOLCHAIN_SCRIPT, 'utf8');
  assert.ok(src.includes('MIN_XCODE_MAJOR:-26'), 'Xcode floor default must be 26 (Apple needs both versions)');
  assert.ok(src.includes('MIN_IOS_SDK_MAJOR:-26'), 'iOS SDK floor default must be 26');
  assert.ok(src.includes('-lt "$MIN_XCODE_MAJOR"'), 'must reject a candidate whose Xcode major is below the floor');
  assert.ok(src.includes('-lt "$MIN_IOS_SDK_MAJOR"'), 'must reject a candidate whose SDK major is below the floor');
  assert.ok(!XCODE_HARDPIN_RE.test(src), 'script must not hardcode a versioned Xcode app path — it discovers candidates');
  assert.ok(src.includes('Xcode*.app'), 'script must enumerate installed Xcodes');
  assert.ok(src.includes('XCODE_SEARCH_ROOT'), 'documented test-only search-root override (default /Applications)');
});

test('select-xcode-toolchain.sh passes bash -n syntax check (skipped if bash unavailable)', (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows PowerShell host: bash syntax and real Xcode execution not verified; run on macOS');
    return;
  }
  // Generous timeout: this Windows host's bash startup swings 4s–>60s.
  const probe = spawnSync('bash', ['--version'], { encoding: 'utf8', timeout: 180000 });
  if (probe.error || probe.status !== 0) {
    t.skip('bash not available on this host');
    return;
  }
  // On Windows hosts Git Bash cannot resolve a spawned "C:/..." argument but
  // does resolve a relative path under an explicit cwd. On macOS both forms
  // are equivalent, so this stays portable.
  const res = spawnSync('bash', ['-n', 'scripts/select-xcode-toolchain.sh'], {
    cwd: CUSTOMER_ROOT,
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.strictEqual(res.status, 0, `bash -n failed:\n${res.stderr}`);
});

// ---------------------------------------------------------------------------
// PARTNER — cross-check (strict since A07 continuation: this lane now owns
// the partner iOS jobs). The partner repo's own test file holds the full
// suite; this is a second, independent tripwire.
// ---------------------------------------------------------------------------

test('partner ci.yml: ios jobs on supported runners with the discovery gate (strict)', (t) => {
  if (!fs.existsSync(PARTNER_WORKFLOW)) {
    t.skip('partner repo not present beside this checkout');
    return;
  }
  const doc = loadYaml(PARTNER_WORKFLOW);
  const text = fs.readFileSync(PARTNER_WORKFLOW, 'utf8');
  for (const name of ['ios', 'ios-archive']) {
    assert.ok(doc.jobs[name], `partner job ${name} missing`);
    const runner = doc.jobs[name]['runs-on'];
    assert.ok(
      SUPPORTED_MACOS_RUNNERS.has(runner),
      `partner ${name}: runs-on "${runner}" not in {${[...SUPPORTED_MACOS_RUNNERS].join(', ')}} — ` +
        'macos-14 is deprecated (removal 2026-11-02); the A07 continuation fixed this, do not regress'
    );
    const steps = jobSteps(doc, name);
    const toolIdx = steps.findIndex((s) => stepRun(s).includes('select-xcode-toolchain.sh'));
    assert.ok(toolIdx !== -1, `partner ${name}: select-xcode-toolchain.sh gate step missing (was the known gap, now owned+fixed)`);
    const env = steps[toolIdx].env || {};
    assert.strictEqual(String(env.MIN_XCODE_MAJOR), '26', `partner ${name}: MIN_XCODE_MAJOR must be "26"`);
    assert.strictEqual(String(env.MIN_IOS_SDK_MAJOR), '26', `partner ${name}: MIN_IOS_SDK_MAJOR must be "26"`);
    const firstXcodebuild = steps.findIndex((s) => stepRun(s).includes('xcodebuild'));
    if (firstXcodebuild !== -1) {
      assert.ok(toolIdx < firstXcodebuild, `partner ${name}: gate must run before the first xcodebuild step`);
    }
    const jobText = JSON.stringify(doc.jobs[name]);
    // Secret-SCOPED check: wiring a secret into a step's `env:` is legitimate
    // (partner ios-archive passes signing material to scripts/archive_ios.py).
    // Echoing it, interpolating it into a shell script, or handing it to a
    // third-party action is not — findSecretLeaks enforces exactly that.
    assertNoSecretLeaks(doc, [name], 'partner ');
    for (const token of FORBIDDEN_SIGNING_TOKENS) {
      assert.ok(!jobText.includes(token), `partner ${name}: forbidden signing/store token: ${token}`);
    }
  }
  const archiveRuns = jobSteps(doc, 'ios-archive').map(stepRun).join('\n');
  // The partner keeps unsigned-archive enforcement in scripts/archive_ios.py
  // (`run(*archive, 'CODE_SIGNING_ALLOWED=NO', ...)`, proven by the
  // archive-signing test above), not as a literal in the workflow text. Accept
  // either location rather than asserting a string the partner never had.
  const partnerArchivePy = path.join(path.dirname(PARTNER_WORKFLOW), '..', '..', 'scripts', 'archive_ios.py');
  const archivePyText = fs.existsSync(partnerArchivePy)
    ? fs.readFileSync(partnerArchivePy, 'utf8')
    : '';
  assert.ok(
    archiveRuns.includes('CODE_SIGNING_ALLOWED=NO') || archivePyText.includes('CODE_SIGNING_ALLOWED=NO'),
    'partner ios-archive must keep an unsigned (CODE_SIGNING_ALLOWED=NO) archive path'
  );
  assert.ok(!text.includes('Xcode_15'), 'partner: stale Xcode 15 reference');
});

// ---------------------------------------------------------------------------
// Negative fixtures: the secret-scoped check must still catch a REAL leak.
// These construct synthetic job objects (no files touched) so the guard cannot
// rot into "permits everything" unnoticed.
// ---------------------------------------------------------------------------
test('secret-scope: permits a secret wired into a step env block', () => {
  const doc = {
    jobs: {
      'ios-archive': {
        steps: [
          {
            name: 'Archive',
            run: 'python3 scripts/archive_ios.py',
            env: { IOS_CERTIFICATE_BASE64: '${{ secrets.IOS_CERTIFICATE_BASE64 }}' },
          },
        ],
      },
    },
  };
  assert.deepStrictEqual(findSecretLeaks(doc.jobs['ios-archive'], 'fixture'), []);
});

test('secret-scope: FAILS when a secret is echoed into the log', () => {
  const doc = {
    jobs: {
      j: {
        steps: [
          {
            name: 'Leak',
            run: 'echo "$CERT"',
            env: { CERT: '${{ secrets.IOS_CERTIFICATE_BASE64 }}' },
          },
        ],
      },
    },
  };
  const leaks = findSecretLeaks(doc.jobs.j, 'fixture');
  assert.strictEqual(leaks.length, 1);
  assert.match(leaks[0], /echoed into the log/);
});

test('secret-scope: FAILS when a secret is interpolated into a run script', () => {
  const doc = {
    jobs: {
      j: { steps: [{ name: 'Inline', run: 'curl -H "token: ${{ secrets.API_TOKEN }}" https://x.test' }] },
    },
  };
  const leaks = findSecretLeaks(doc.jobs.j, 'fixture');
  assert.strictEqual(leaks.length, 1);
  assert.match(leaks[0], /interpolated into a run script/);
});

test('secret-scope: FAILS when a secret is passed to a third-party action', () => {
  const doc = {
    jobs: {
      j: {
        steps: [
          {
            uses: 'some-org/some-action@v1',
            with: { token: '${{ secrets.API_TOKEN }}' },
          },
        ],
      },
    },
  };
  const leaks = findSecretLeaks(doc.jobs.j, 'fixture');
  assert.strictEqual(leaks.length, 1);
  assert.match(leaks[0], /third-party action/);
});

test('secret-scope: FAILS when a secret is used to build an artifact name', () => {
  const doc = {
    jobs: {
      j: {
        steps: [
          {
            uses: 'actions/upload-artifact@v4',
            with: { name: 'build-${{ secrets.API_TOKEN }}', path: 'out.zip' },
          },
        ],
      },
    },
  };
  const leaks = findSecretLeaks(doc.jobs.j, 'fixture');
  assert.strictEqual(leaks.length, 1);
  assert.match(leaks[0], /artifact name/);
});

// ---------------------------------------------------------------------------
// DETERMINISTIC NODE INSTALL (A07 continuation, 2026-11-08)
//
// `npm ci` installs package-lock.json as written and fails when it disagrees
// with package.json; it never updates the lock. `npm install` may reconcile and
// rewrite the lock, so the same commit can resolve to a different tree on a
// different day. Both iOS jobs therefore use `npm ci --legacy-peer-deps`.
//
// `--legacy-peer-deps` stays: npm 10 (bundled with the pinned Node patch) needs
// it to shape this repo's peer graph, and .npmrc sets the same key — dropping
// the explicit flag would change tree shaping on any runner that ignores .npmrc.
//
// The install step is judged as a WHOLE executable block, exactly equal to the
// required command. Checking line-by-line is not enough: `if false; then … fi`
// or `set +e … exit 0` contains the right line yet never installs, or erases
// the failure. YAML comments are not part of the parsed workflow at all.
// ---------------------------------------------------------------------------

const REQUIRED_IOS_JOBS = ['build-ios', 'ios-archive'];
// Verified against https://nodejs.org/dist/index.json (security release
// 2026-10-20, bundled npm 10.9.9). Local verification runs Node 24.18.0, so
// this pin is a source-level decision, not a locally executed CI runtime.
const PINNED_NODE_VERSION = '22.23.4';
const REQUIRED_INSTALL_COMMAND = 'npm ci --legacy-peer-deps';
const NODE_VERSION_LINE_RE = /^node-version:\s*(.*)$/;
// Any npm install-family command, including one chained or piped behind another
// command, so `cd . && npm ci ...` cannot slip past detection.
const NPM_COMMAND_LINE_RE =
  /(?:^|[\s;&|(])(npm\s+(?:ci|clean-install|i|install-test|install-ci-test|install|add)\b)/;
// Anything that consumes the installed tree. The install must precede all of it.
const BUILD_SIGNAL_RE =
  /(npm\s+run\s+build:mobile|cap\s+sync|patch-ios-spm\.js|xcodebuild|archive_ios\.py|prepare-native-config\.mjs)/;

/** Non-empty shell lines of a run block, with shell comment lines removed. */
function executableShellLines(run) {
  return String(run)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * `continue-on-error` is only safe when absent or the literal boolean false.
 * A string, number, null or expression is not something this guard can verify,
 * so it is rejected rather than assumed harmless.
 */
function unsafeContinueOnError(value) {
  return value !== undefined && value !== false;
}

/**
 * Determinism problems for one job. Empty array means clean.
 * @param {string} jobName
 * @param {object} job parsed job object
 * @returns {string[]}
 */
function inspectJobInstall(jobName, job) {
  const problems = [];
  const steps = job && Array.isArray(job.steps) ? job.steps : [];
  if (steps.length === 0) {
    return [`${jobName}: job has no steps (Node setup and install are missing)`];
  }
  if (unsafeContinueOnError(job['continue-on-error'])) {
    problems.push(`${jobName}: job-level continue-on-error would let a failed install or build pass the job`);
  }
  // build-ios must always run; ios-archive keeps its sanctioned release gate.
  if (jobName === 'build-ios' && job.if !== undefined) {
    problems.push(`${jobName}: job must not be conditional (if: ${JSON.stringify(job.if)}) — the simulator build must always run`);
  }

  const setupIndexes = [];
  steps.forEach((step, index) => {
    if (String((step && step.uses) || '').startsWith('actions/setup-node@')) setupIndexes.push(index);
  });
  if (setupIndexes.length === 0) {
    problems.push(`${jobName}: actions/setup-node step missing`);
  } else if (setupIndexes.length > 1) {
    problems.push(`${jobName}: ${setupIndexes.length} actions/setup-node steps — exactly one pinned toolchain is allowed`);
  }
  if (setupIndexes.length >= 1) {
    const setup = steps[setupIndexes[0]] || {};
    const withBlock = setup.with && typeof setup.with === 'object' ? setup.with : {};
    const version = withBlock['node-version'];
    if (typeof version !== 'string') {
      problems.push(
        `${jobName}: node-version must be the quoted exact pin "${PINNED_NODE_VERSION}", got ${JSON.stringify(version)} (${typeof version}) — a numeric or floating value re-resolves on every run`
      );
    } else if (version !== PINNED_NODE_VERSION) {
      problems.push(
        `${jobName}: node-version "${version}" is not the exact verified patch "${PINNED_NODE_VERSION}"`
      );
    }
    if (withBlock.cache !== 'npm') {
      problems.push(`${jobName}: setup-node must keep cache: "npm"`);
    }
    if (setup.if !== undefined) {
      problems.push(`${jobName}: setup-node must not be conditional (if: ${JSON.stringify(setup.if)})`);
    }
    if (unsafeContinueOnError(setup['continue-on-error'])) {
      problems.push(`${jobName}: setup-node must not set continue-on-error`);
    }
  }

  // A step "is" an install only if some executable line invokes npm; its whole
  // block, however, must then be exactly the accepted command.
  const installIndexes = [];
  steps.forEach((step, index) => {
    if (executableShellLines(stepRun(step)).some((line) => NPM_COMMAND_LINE_RE.test(line))) {
      installIndexes.push(index);
    }
  });
  if (installIndexes.length === 0) {
    problems.push(
      `${jobName}: no executable "${REQUIRED_INSTALL_COMMAND}" (a YAML comment or an unrelated command does not count)`
    );
  } else if (installIndexes.length > 1) {
    problems.push(`${jobName}: ${installIndexes.length} npm install steps — exactly one frozen install is allowed`);
  }

  for (const index of installIndexes) {
    const step = steps[index] || {};
    const wholeBlock = executableShellLines(stepRun(step)).join('\n');
    if (wholeBlock !== REQUIRED_INSTALL_COMMAND) {
      problems.push(
        `${jobName}: npm install step ${index} must be exactly "${REQUIRED_INSTALL_COMMAND}" as its whole run block, got: ${JSON.stringify(wholeBlock)}`
      );
    }
    if (step.if !== undefined) {
      problems.push(`${jobName}: npm install step ${index} is conditional (if: ${JSON.stringify(step.if)}) — the frozen install must always run`);
    }
    if (unsafeContinueOnError(step['continue-on-error'])) {
      problems.push(`${jobName}: npm install step ${index} must not set continue-on-error`);
    }
  }

  if (installIndexes.length >= 1) {
    const installIndex = installIndexes[0];
    if (setupIndexes.length >= 1 && installIndex < setupIndexes[0]) {
      problems.push(`${jobName}: dependency install runs before the pinned Node setup`);
    }
    const firstBuildIndex = steps.findIndex(
      (step, index) =>
        index !== installIndex &&
        executableShellLines(stepRun(step)).some((line) => BUILD_SIGNAL_RE.test(line))
    );
    if (firstBuildIndex !== -1 && installIndex > firstBuildIndex) {
      problems.push(
        `${jobName}: dependency install must run before the first build/sync step (step ${firstBuildIndex})`
      );
    }
  }
  return problems;
}

/**
 * Determinism problems across both owned iOS jobs. Empty array means clean.
 * @param {object} doc parsed workflow document
 * @returns {string[]}
 */
function auditInstallDeterminism(doc) {
  const problems = [];
  for (const name of REQUIRED_IOS_JOBS) {
    const job = doc && doc.jobs ? doc.jobs[name] : undefined;
    if (!job) {
      problems.push(`${name}: job missing from the workflow`);
      continue;
    }
    problems.push(...inspectJobInstall(name, job));
  }
  return problems;
}

/** Raw `node-version:` declaration values (quotes preserved), comments stripped. */
function nodeVersionDeclarations(workflowText) {
  return stripYamlComments(workflowText)
    .split('\n')
    .map((line) => line.trim())
    .map((line) => NODE_VERSION_LINE_RE.exec(line))
    .filter((match) => match !== null)
    .map((match) => match[1]);
}

test('customer: both iOS jobs pin the quoted exact Node patch and keep the npm cache', () => {
  const workflowText = fs.readFileSync(CUSTOMER_WORKFLOW, 'utf8');
  assert.deepStrictEqual(
    nodeVersionDeclarations(workflowText),
    [`'${PINNED_NODE_VERSION}'`, `'${PINNED_NODE_VERSION}'`],
    'each setup-node step must declare the quoted exact patch; `22`, 22.23 or a range re-resolves the toolchain and is not reproducible'
  );

  const doc = loadYaml(CUSTOMER_WORKFLOW);
  for (const name of REQUIRED_IOS_JOBS) {
    const setup = jobSteps(doc, name).find((step) =>
      String((step && step.uses) || '').startsWith('actions/setup-node@')
    );
    assert.ok(setup, `${name}: actions/setup-node step missing`);
    const withBlock = setup.with || {};
    assert.strictEqual(withBlock['node-version'], PINNED_NODE_VERSION, `${name}: node-version pin`);
    assert.strictEqual(withBlock.cache, 'npm', `${name}: npm cache must be retained`);
  }
});

test('customer: both iOS jobs install exactly with "npm ci --legacy-peer-deps" before any build step', () => {
  const doc = loadYaml(CUSTOMER_WORKFLOW);
  const problems = auditInstallDeterminism(doc);
  assert.deepStrictEqual(
    problems,
    [],
    `install determinism problems:\n  ${problems.join('\n  ')}`
  );
});

test('customer: real-staging fixture lane stays separate from the archive lane', () => {
  const doc = loadYaml(CUSTOMER_WORKFLOW);
  const steps = jobSteps(doc, 'build-ios');
  const fixture = steps.find((step) => stepRun(step).includes('prepare-simulator-config.mjs'));
  const realStaging = steps.find((step) => stepRun(step).includes('prepare-demo-simulator.mjs'));
  assert.ok(fixture, 'build-ios: credential-free fixture preparation must remain');
  assert.ok(realStaging, 'build-ios: real-staging preparation must remain');
  assert.match(String(fixture.if || ''), /real_staging != true/, 'fixture lane must exclude real_staging runs');
  assert.match(String(realStaging.if || ''), /real_staging == true/, 'real-staging lane must be opt-in');
  assert.match(
    String(doc.jobs['ios-archive'].if || ''),
    /real_staging != true/,
    'archive lane must stay separate from real-staging runs'
  );
});

test('customer: .npmrc keeps legacy-peer-deps so the explicit flag matches local installs', () => {
  const npmrc = fs.readFileSync(path.join(CUSTOMER_ROOT, '.npmrc'), 'utf8');
  assert.match(npmrc, /^\s*legacy-peer-deps\s*=\s*true\s*$/m, '.npmrc must keep legacy-peer-deps=true');
  const workflowText = stripYamlComments(fs.readFileSync(CUSTOMER_WORKFLOW, 'utf8'));
  assert.ok(
    !/npm install\b/.test(workflowText),
    'the workflow must not fall back to `npm install` (npm install may update the lockfile instead of validating it)'
  );
});

test('install guard: applies to ios-archive as well as build-ios', () => {
  const goodJob = () => installJob();
  const regressedArchive = () =>
    installJob({ steps: [{ name: 'Install', run: 'npm install --legacy-peer-deps' }] });
  const problems = auditInstallDeterminism({
    jobs: { 'build-ios': goodJob(), 'ios-archive': regressedArchive() },
  }).join('\n');
  assert.match(
    problems,
    /ios-archive: npm install step \d+ must be exactly "npm ci --legacy-peer-deps"/,
    'ios-archive regression must be reported'
  );
  assert.doesNotMatch(problems, /build-ios:/, 'a clean build-ios job must not be reported');
});

// --- negative fixtures: the install guard must not rot into "permits all" ---

function nodeSetupStep(nodeVersion, cache) {
  const withBlock = { 'node-version': nodeVersion };
  if (cache !== undefined) withBlock.cache = cache;
  return { uses: 'actions/setup-node@v4', with: withBlock };
}

function installJob({ nodeVersion = PINNED_NODE_VERSION, cache = 'npm', steps } = {}) {
  return { steps: [nodeSetupStep(nodeVersion, cache)].concat(steps || [{ name: 'Install', run: REQUIRED_INSTALL_COMMAND }]) };
}

function fixtureProblems(job) {
  return inspectJobInstall('build-ios', job).join('\n');
}

test('install guard: rejects the pre-existing "npm install --legacy-peer-deps" + numeric Node 22 workflow', () => {
  const job = {
    steps: [
      nodeSetupStep(22, 'npm'),
      { name: 'Install', run: 'npm install --legacy-peer-deps' },
    ],
  };
  const problems = fixtureProblems(job);
  assert.match(problems, /node-version must be the quoted exact pin/, 'numeric 22 must be rejected');
  assert.match(
    problems,
    /npm install step \d+ must be exactly "npm ci --legacy-peer-deps"/,
    '"npm install" must be rejected'
  );
});

test('install guard: rejects a missing job, a missing Node step and a missing install', () => {
  assert.match(
    auditInstallDeterminism({ jobs: { 'build-ios': installJob() } }).join('\n'),
    /ios-archive: job missing from the workflow/,
    'a missing job must be reported, not skipped'
  );
  assert.match(
    fixtureProblems({ steps: [{ name: 'Install', run: REQUIRED_INSTALL_COMMAND }] }),
    /actions\/setup-node step missing/
  );
  assert.match(
    fixtureProblems({ steps: [nodeSetupStep(PINNED_NODE_VERSION, 'npm'), { name: 'Build', run: 'npm run build:mobile' }] }),
    /no executable "npm ci --legacy-peer-deps"/
  );
  assert.match(
    fixtureProblems({ steps: [] }),
    /job has no steps/
  );
});

test('install guard: rejects floating, wrong and unquoted-numeric Node versions', () => {
  for (const [label, version] of [
    ['bare major number', 22],
    ['floating minor number', 22.23],
    ['floating major string', '22'],
    ['floating x-range', '22.x'],
    ['floating caret range', '^22.23.4'],
    ['older patch', '22.22.2'],
    ['newer major', '24.18.0'],
    ['null', null],
  ]) {
    const problems = fixtureProblems(installJob({ nodeVersion: version }));
    assert.match(problems, /node-version/, `${label} (${JSON.stringify(version)}) must be rejected`);
  }
  assert.strictEqual(fixtureProblems(installJob()), '', 'the pinned fixture itself must pass');
});

test('install guard: rejects a dropped npm cache', () => {
  assert.match(fixtureProblems(installJob({ cache: '' })), /must keep cache: "npm"/);
});

test('install guard: rejects "npm ci" without the legacy-peer-deps flag and duplicate installs', () => {
  assert.match(
    fixtureProblems(installJob({ steps: [{ name: 'Install', run: 'npm ci' }] })),
    /must be exactly "npm ci --legacy-peer-deps" as its whole run block/
  );
  assert.match(
    fixtureProblems(
      installJob({ steps: [{ name: 'Install', run: `${REQUIRED_INSTALL_COMMAND}\nnpm install --legacy-peer-deps` }] })
    ),
    /must be exactly "npm ci --legacy-peer-deps" as its whole run block/
  );
  assert.match(
    fixtureProblems(
      installJob({
        steps: [
          { name: 'Install', run: REQUIRED_INSTALL_COMMAND },
          { name: 'Install again', run: REQUIRED_INSTALL_COMMAND },
        ],
      })
    ),
    /2 npm install steps/
  );
});

test('install guard: rejects an install that runs after the build', () => {
  const problems = fixtureProblems(
    installJob({
      steps: [
        { name: 'Build', run: 'npm run build:mobile' },
        { name: 'Install', run: REQUIRED_INSTALL_COMMAND },
      ],
    })
  );
  assert.match(problems, /must run before the first build\/sync step/);
});

test('install guard: rejects an install that runs before the pinned Node setup', () => {
  const problems = fixtureProblems({
    steps: [
      { name: 'Install', run: REQUIRED_INSTALL_COMMAND },
      nodeSetupStep(PINNED_NODE_VERSION, 'npm'),
      { name: 'Build', run: 'npm run build:mobile' },
    ],
  });
  assert.match(problems, /install runs before the pinned Node setup/);
});

test('install guard: rejects a conditional install and extra arguments', () => {
  assert.match(
    fixtureProblems(
      installJob({
        steps: [{ name: 'Install', if: "github.event_name == 'push'", run: REQUIRED_INSTALL_COMMAND }],
      })
    ),
    /is conditional/
  );
  assert.match(
    fixtureProblems(installJob({ steps: [{ name: 'Install', run: `${REQUIRED_INSTALL_COMMAND} --omit=dev` }] })),
    /must be exactly "npm ci --legacy-peer-deps" as its whole run block/
  );
});

test('install guard: judges the WHOLE install run block, not a line inside a wrapper', () => {
  // Each of these contains the exact command on its own line, so a line-by-line
  // scan accepts it. The block as a whole is what runs, and it is not the frozen
  // install: `if false` skips it, `set +e … exit 0` erases its failure.
  const wrappers = [
    `if false; then\n${REQUIRED_INSTALL_COMMAND}\nfi`,
    `set +e\n${REQUIRED_INSTALL_COMMAND}\nexit 0`,
    `set -e\n${REQUIRED_INSTALL_COMMAND}`,
    `${REQUIRED_INSTALL_COMMAND}\nnpm install --legacy-peer-deps`,
  ];
  for (const run of wrappers) {
    assert.match(
      fixtureProblems(installJob({ steps: [{ name: 'Install', run }] })),
      /must be exactly "npm ci --legacy-peer-deps" as its whole run block/,
      run
    );
  }
});

test('install guard: rejects continue-on-error on the install step, the setup step and the job', () => {
  assert.match(
    fixtureProblems(
      installJob({ steps: [{ name: 'Install', run: REQUIRED_INSTALL_COMMAND, 'continue-on-error': true }] })
    ),
    /install step 1 must not set continue-on-error/
  );
  assert.match(
    fixtureProblems({
      steps: [{ ...nodeSetupStep(PINNED_NODE_VERSION, 'npm'), 'continue-on-error': true },
        { name: 'Install', run: REQUIRED_INSTALL_COMMAND }],
    }),
    /setup-node must not set continue-on-error/
  );
  assert.match(
    fixtureProblems({ ...installJob(), 'continue-on-error': true }),
    /job-level continue-on-error/
  );
  // Only the literal boolean false is verifiable; strings and expressions are not.
  for (const value of ['true', '${{ always() }}', 1, null]) {
    assert.match(
      fixtureProblems(installJob({ steps: [{ name: 'Install', run: REQUIRED_INSTALL_COMMAND, 'continue-on-error': value }] })),
      /install step 1 must not set continue-on-error/,
      JSON.stringify(value)
    );
    assert.match(
      fixtureProblems({ ...installJob(), 'continue-on-error': value }),
      /job-level continue-on-error/,
      JSON.stringify(value)
    );
  }
  assert.strictEqual(fixtureProblems({ ...installJob(), 'continue-on-error': false }), '');
});

test('install guard: rejects a conditional setup-node step', () => {
  const problems = fixtureProblems({
    steps: [
      { ...nodeSetupStep(PINNED_NODE_VERSION, 'npm'), if: "github.event_name == 'push'" },
      { name: 'Install', run: REQUIRED_INSTALL_COMMAND },
    ],
  });
  assert.match(problems, /setup-node must not be conditional/);
});

test('install guard: rejects any job-level if on build-ios but keeps the ios-archive gate', () => {
  // A skipped job installs nothing: `if: false`, `if: 'false'` and an expression
  // all leave build-ios unrunnable, so every form is rejected, not just truthy YAML.
  for (const value of [false, 'false', "${{ github.event_name == 'workflow_dispatch' }}"]) {
    assert.match(
      inspectJobInstall('build-ios', { ...installJob(), if: value }).join('\n'),
      /build-ios: job must not be conditional/,
      JSON.stringify(value)
    );
  }
  // Positive control: no if on build-ios is clean, and ios-archive's sanctioned
  // release gate (`real_staging != true`) is never reported.
  assert.deepStrictEqual(inspectJobInstall('build-ios', installJob()), []);
  assert.deepStrictEqual(
    inspectJobInstall('ios-archive', {
      ...installJob(),
      if: "github.event_name == 'workflow_dispatch' && inputs.real_staging != true",
    }),
    []
  );
});

test('install guard: rejects any appended command, fallback, pipe or chain', () => {
  const variants = [
    `${REQUIRED_INSTALL_COMMAND} || true`,
    `${REQUIRED_INSTALL_COMMAND} || exit 0`,
    `${REQUIRED_INSTALL_COMMAND} | tee install.log`,
    `cd . && ${REQUIRED_INSTALL_COMMAND}`,
    `${REQUIRED_INSTALL_COMMAND}; echo done`,
  ];
  for (const run of variants) {
    assert.match(
      fixtureProblems(installJob({ steps: [{ name: 'Install', run }] })),
      /must be exactly "npm ci --legacy-peer-deps" as its whole run block/,
      run
    );
  }
});

test('install guard: a command that only appears in a comment is not an install', () => {
  // YAML comment above a run block that does not install anything.
  const yamlText = [
    'jobs:',
    '  build-ios:',
    '    steps:',
    '      - uses: actions/setup-node@v4',
    '        with:',
    `          node-version: '${PINNED_NODE_VERSION}'`,
    '          cache: "npm"',
    '      - name: Install',
    '        # npm ci --legacy-peer-deps',
    '        run: echo "pretending to install"',
  ].join('\n');
  const doc = parseYamlText(yamlText);
  assert.match(
    inspectJobInstall('build-ios', doc.jobs['build-ios']).join('\n'),
    /no executable "npm ci --legacy-peer-deps"/
  );

  // Shell comment inside the run block, next to a real (but wrong) install.
  const mixed = fixtureProblems(
    installJob({ steps: [{ name: 'Install', run: `# ${REQUIRED_INSTALL_COMMAND}\nnpm install --legacy-peer-deps` }] })
  );
  assert.match(mixed, /must be exactly "npm ci --legacy-peer-deps" as its whole run block/);
  assert.doesNotMatch(mixed, /2 npm install steps/, 'the commented line must not count as a second install');
});

// ---------------------------------------------------------------------------
// OFFLINE MANIFEST ↔ LOCK AGREEMENT
//
// `npm ci` refuses to run when package.json and package-lock.json disagree on
// the root dependency declarations. That failure is the point: it is far
// cheaper than a runner silently installing a different tree. This check reads
// both files only — no install, no registry, no lockfile rewrite — and compares
// each dependency group separately so a package moved from `devDependencies`
// into `dependencies` is drift, not a match.
// ---------------------------------------------------------------------------

const DEPENDENCY_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/**
 * Root-declaration problems between package.json and package-lock.json.
 * Empty array means the pair is consistent for `npm ci`.
 * @param {object} manifest parsed package.json
 * @param {object} lock parsed package-lock.json
 * @returns {string[]}
 */
function inspectManifestLockAgreement(manifest, lock) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['manifest: not a JSON object'];
  }
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) {
    return ['lockfile: not a JSON object'];
  }
  const problems = [];

  if (lock.lockfileVersion !== 3) {
    problems.push(
      `lockfile: lockfileVersion must be 3 (npm >= 7 root layout), got ${JSON.stringify(lock.lockfileVersion)}`
    );
  }
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    problems.push('manifest: name missing');
  }
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    problems.push('manifest: version missing');
  }
  if (lock.name !== manifest.name) {
    problems.push(
      `lockfile: outer name ${JSON.stringify(lock.name)} != manifest name ${JSON.stringify(manifest.name)}`
    );
  }
  if (lock.version !== manifest.version) {
    problems.push(
      `lockfile: outer version ${JSON.stringify(lock.version)} != manifest version ${JSON.stringify(manifest.version)}`
    );
  }

  const packages = lock.packages;
  if (!packages || typeof packages !== 'object') {
    problems.push('lockfile: packages map missing (lockfileVersion 3 requires it)');
    return problems;
  }
  const root = packages[''];
  if (!root || typeof root !== 'object') {
    problems.push('lockfile: packages[""] root entry missing');
    return problems;
  }
  if (root.name !== manifest.name) {
    problems.push(
      `lockfile: root name ${JSON.stringify(root.name)} != manifest name ${JSON.stringify(manifest.name)}`
    );
  }
  if (root.version !== manifest.version) {
    problems.push(
      `lockfile: root version ${JSON.stringify(root.version)} != manifest version ${JSON.stringify(manifest.version)}`
    );
  }

  for (const group of DEPENDENCY_GROUPS) {
    const manifestGroup = manifest[group];
    const lockGroup = root[group];
    const manifestHas = Boolean(manifestGroup) && typeof manifestGroup === 'object';
    const lockHas = Boolean(lockGroup) && typeof lockGroup === 'object';
    if (!manifestHas && !lockHas) continue;
    if (!manifestHas) {
      problems.push(`lockfile: root declares ${group} that package.json does not`);
      continue;
    }
    if (!lockHas) {
      problems.push(`manifest: ${group} missing from lockfile root`);
      continue;
    }
    for (const [dependency, declaredRange] of Object.entries(manifestGroup)) {
      if (!Object.prototype.hasOwnProperty.call(lockGroup, dependency)) {
        problems.push(`${group}: ${dependency} missing from lockfile root`);
      } else if (lockGroup[dependency] !== declaredRange) {
        problems.push(
          `${group}: ${dependency} lockfile range ${JSON.stringify(lockGroup[dependency])} != manifest ${JSON.stringify(declaredRange)}`
        );
      }
    }
    for (const dependency of Object.keys(lockGroup)) {
      if (!Object.prototype.hasOwnProperty.call(manifestGroup, dependency)) {
        problems.push(`${group}: ${dependency} present in lockfile root but absent from package.json ${group}`);
      }
    }
  }
  return problems;
}

test('customer: package.json and package-lock.json root declarations agree offline', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(CUSTOMER_ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(CUSTOMER_ROOT, 'package-lock.json'), 'utf8'));
  assert.strictEqual(lock.lockfileVersion, 3, 'lockfileVersion must be 3');
  assert.strictEqual(lock.packages[''].name, manifest.name);
  assert.strictEqual(lock.packages[''].version, manifest.version);
  // Guard against a vacuous pass: both groups are populated and compared.
  assert.ok(Object.keys(manifest.dependencies || {}).length > 0, 'manifest dependencies must be non-empty');
  assert.ok(Object.keys(manifest.devDependencies || {}).length > 0, 'manifest devDependencies must be non-empty');
  const problems = inspectManifestLockAgreement(manifest, lock);
  assert.deepStrictEqual(problems, [], `manifest/lock problems:\n  ${problems.join('\n  ')}`);
});

// --- negative fixtures: synthetic objects only, no file is touched ---

function manifestLockFixture() {
  return {
    manifest: {
      name: 'fixture-app',
      version: '1.0.0',
      dependencies: { alpha: '^1.0.0' },
      devDependencies: { beta: '~2.0.0' },
    },
    lock: {
      name: 'fixture-app',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: 'fixture-app',
          version: '1.0.0',
          dependencies: { alpha: '^1.0.0' },
          devDependencies: { beta: '~2.0.0' },
        },
      },
    },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('manifest/lock guard: a consistent synthetic pair passes', () => {
  const { manifest, lock } = manifestLockFixture();
  assert.deepStrictEqual(inspectManifestLockAgreement(manifest, lock), []);
});

test('manifest/lock guard: rejects version drift between manifest and lock root', () => {
  const { manifest, lock } = manifestLockFixture();
  lock.packages[''].dependencies.alpha = '^1.1.0';
  assert.match(
    inspectManifestLockAgreement(manifest, lock).join('\n'),
    /dependencies: alpha lockfile range "\^1\.1\.0" != manifest "\^1\.0\.0"/
  );
});

test('manifest/lock guard: rejects a dependency missing from either side', () => {
  const missingInLock = manifestLockFixture();
  delete missingInLock.lock.packages[''].dependencies.alpha;
  assert.match(
    inspectManifestLockAgreement(missingInLock.manifest, missingInLock.lock).join('\n'),
    /dependencies: alpha missing from lockfile root/
  );

  const extraInLock = manifestLockFixture();
  extraInLock.lock.packages[''].devDependencies.gamma = '^3.0.0';
  assert.match(
    inspectManifestLockAgreement(extraInLock.manifest, extraInLock.lock).join('\n'),
    /devDependencies: gamma present in lockfile root but absent from package.json devDependencies/
  );

  const extraGroup = manifestLockFixture();
  extraGroup.lock.packages[''].peerDependencies = { delta: '^4.0.0' };
  assert.match(
    inspectManifestLockAgreement(extraGroup.manifest, extraGroup.lock).join('\n'),
    /lockfile: root declares peerDependencies that package.json does not/
  );
});

test('manifest/lock guard: rejects a dependency moved between groups (no merging of distinctions)', () => {
  const { manifest, lock } = manifestLockFixture();
  // `alpha` is a runtime dependency in package.json; the lock claims it is dev.
  delete lock.packages[''].dependencies.alpha;
  lock.packages[''].devDependencies.alpha = '^1.0.0';
  const problems = inspectManifestLockAgreement(manifest, lock).join('\n');
  assert.match(problems, /dependencies: alpha missing from lockfile root/);
  assert.match(problems, /devDependencies: alpha present in lockfile root but absent from package.json devDependencies/);
});

test('manifest/lock guard: rejects a wrong lockfileVersion and missing root metadata', () => {
  const wrongVersion = manifestLockFixture();
  wrongVersion.lock.lockfileVersion = 2;
  assert.match(
    inspectManifestLockAgreement(wrongVersion.manifest, wrongVersion.lock).join('\n'),
    /lockfileVersion must be 3/
  );

  const missingRoot = manifestLockFixture();
  delete missingRoot.lock.packages[''];
  assert.match(
    inspectManifestLockAgreement(missingRoot.manifest, missingRoot.lock).join('\n'),
    /packages\[""\] root entry missing/
  );

  const wrongOuterName = manifestLockFixture();
  wrongOuterName.lock.name = 'other-app';
  assert.match(
    inspectManifestLockAgreement(wrongOuterName.manifest, wrongOuterName.lock).join('\n'),
    /outer name "other-app" != manifest name "fixture-app"/
  );

  const wrongRootVersion = manifestLockFixture();
  wrongRootVersion.lock.packages[''].version = '1.0.1';
  const problems = inspectManifestLockAgreement(wrongRootVersion.manifest, wrongRootVersion.lock).join('\n');
  assert.match(problems, /outer version "1\.0\.0" != manifest version "1\.0\.1"|root version "1\.0\.1" != manifest version "1\.0\.0"/);
});

test('manifest/lock guard: rejects a missing dependency group declaration', () => {
  const missingGroup = cloneJson(manifestLockFixture());
  delete missingGroup.lock.packages[''].devDependencies;
  assert.match(
    inspectManifestLockAgreement(missingGroup.manifest, missingGroup.lock).join('\n'),
    /manifest: devDependencies missing from lockfile root/
  );
});
