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
