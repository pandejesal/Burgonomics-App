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
const PARTNER_WORKFLOW = path.join(REPO_ROOT, 'burgonomics-partner', '.github', 'workflows', 'ci.yml');
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

test('customer: zero secrets references and zero signing/store-upload tooling', () => {
  const text = stripYamlComments(fs.readFileSync(CUSTOMER_WORKFLOW, 'utf8'));
  assert.ok(!text.includes('secrets.'), 'workflow must reference no secrets (credential-free lane)');
  for (const token of FORBIDDEN_SIGNING_TOKENS) {
    assert.ok(!text.includes(token), `forbidden signing/store token in workflow: ${token}`);
  }
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
        /\.(zip|xcarchive|log)$/i.test(p.trim()),
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
    assert.ok(!jobText.includes('secrets.'), `partner ${name}: references secrets`);
    for (const token of FORBIDDEN_SIGNING_TOKENS) {
      assert.ok(!jobText.includes(token), `partner ${name}: forbidden signing/store token: ${token}`);
    }
  }
  const archiveRuns = jobSteps(doc, 'ios-archive').map(stepRun).join('\n');
  assert.ok(
    archiveRuns.includes('CODE_SIGNING_ALLOWED=NO'),
    'partner ios-archive must keep CODE_SIGNING_ALLOWED=NO'
  );
  assert.ok(!text.includes('Xcode_15'), 'partner: stale Xcode 15 reference');
});
