// validate-android-workflow.test.cjs — local static guard for the Android CI workflow.
//
// Charter: no build, no Gradle, no npm install, no network, no CI trigger, no
// credential read. This test READS .github/workflows/android-build.yml and
// .npmrc only, and builds synthetic fixtures (plain JS objects / YAML text) so
// the guards cannot rot into "permits everything". Nothing here executes a
// shell or a fixture command; hostile secret values are compared as data.
//
// Pinned policies:
//   A. RELEASE-SECRET PREFLIGHT
//      `${{ secrets.X }}` written straight into a `run:` block is substituted
//      before the shell starts, so a value containing quotes, `$(...)`,
//      backticks or newlines becomes script text and can rewrite the command.
//      GitHub's secure-use guidance is to pass secrets through an intermediate
//      `env:` mapping and quote the expansions. The preflight therefore
//      declares its four secrets only in env: and tests each with
//      `[ -z "${NAME:-}" ]`, failing closed with a field-name-only error. No
//      expression may appear in ANY run script in this workflow.
//   B. DETERMINISTIC NODE INSTALL
//      The job pins the exact Node patch '22.23.4' and the install step's whole
//      executable body is exactly `npm ci --legacy-peer-deps`, after setup-node
//      and before the web build. A command that merely appears on one line of a
//      longer, conditional or continue-on-error step is not a determined tree.
//
// Run:  node --test scripts/validate-android-workflow.test.cjs
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'android-build.yml');
const JOB = 'build-android';

let yaml;
try {
  yaml = require('js-yaml');
} catch {
  yaml = null;
}

function loadYaml(file) {
  assert.ok(yaml, 'js-yaml not resolvable — cannot parse workflows statically');
  return yaml.load(fs.readFileSync(file, 'utf8'));
}

function jobSteps(doc, jobName) {
  const job = doc && doc.jobs ? doc.jobs[jobName] : undefined;
  assert.ok(job, `job ${jobName} missing`);
  return Array.isArray(job.steps) ? job.steps : [];
}

function stepRun(step) {
  return step && typeof step.run === 'string' ? step.run : '';
}

/** Non-empty, de-indented shell lines; shell comment lines dropped. */
function shellLines(run) {
  return String(run)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/**
 * `continue-on-error` is only safe when absent or the literal boolean false.
 * A string, a number or an expression is not a decision this guard can verify,
 * so it is rejected rather than assumed harmless.
 */
function unsafeFlag(value) {
  return value !== undefined && value !== false;
}

// ---------------------------------------------------------------------------
// A. Release-secret preflight
// ---------------------------------------------------------------------------

const REQUIRED_SECRETS = [
  'RELEASE_KEYSTORE_BASE64',
  'RELEASE_STORE_PASSWORD',
  'RELEASE_KEY_PASSWORD',
  'RELEASE_KEY_ALIAS',
];
const secretExpression = (name) => `\${{ secrets.${name} }}`;

/** Matches a shell reference to one variable, braced or bare, not a longer name. */
function variableRef(name) {
  return new RegExp(`\\$\\{${name}(?=[-:}])|\\$${name}(?![A-Za-z0-9_])`);
}

/**
 * One line in canonical form: trimmed, trailing `;` dropped, inner whitespace
 * collapsed. Indentation and the file's trailing semicolons are cosmetic.
 */
function normalizeShellLine(line) {
  return String(line).trim().replace(/[;\s]+$/, '').replace(/\s+/g, ' ');
}

/**
 * The accepted four-line fail-closed block for one secret, canonical form.
 * Exact lines, not a pattern: the check must be this `[ -z ... ]`, the error
 * must name the field, the exit must be a real `exit 1`, and `fi` must close it.
 */
function acceptedCheckBlock(name) {
  return [
    `if [ -z "\${${name}:-}" ]; then`,
    `echo "::error::${name} secret is empty or missing"`,
    'exit 1',
    'fi',
  ];
}

/**
 * Problems with the release-secret preflight step. Empty array means clean.
 * @param {object} job parsed job object
 * @returns {string[]}
 */
function inspectSecretPreflight(job) {
  const problems = [];
  const steps = Array.isArray(job && job.steps) ? job.steps : [];
  const preflights = steps.filter((step) => /preflight/i.test(String((step && step.name) || '')));
  if (preflights.length !== 1) {
    return [`expected exactly one release-secret preflight step, found ${preflights.length}`];
  }
  const step = preflights[0];
  const lines = shellLines(stepRun(step));
  if (lines.length === 0) problems.push('preflight step has no executable run script');
  const env = step.env && typeof step.env === 'object' && !Array.isArray(step.env) ? step.env : {};

  for (const name of REQUIRED_SECRETS) {
    if (!Object.prototype.hasOwnProperty.call(env, name)) {
      problems.push(`env.${name} missing — the secret must be mapped through env:, not interpolated into run:`);
    } else if (env[name] !== secretExpression(name)) {
      problems.push(`env.${name} must be exactly the ${name} secret expression (a literal or another secret is not the same value)`);
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (REQUIRED_SECRETS.includes(key)) continue;
    if (typeof value === 'string' && /\$\{\{\s*secrets\./.test(value)) {
      problems.push(`env.${key} maps an extra secret this step does not check`);
    }
  }

  // No GitHub expression may reach the script: it is expanded before the shell
  // parses, which is exactly the injection surface env: removes.
  const expressionLine = lines.find((line) => line.includes('${{'));
  if (expressionLine !== undefined) {
    problems.push(`run: script contains an unbounded expression (expanded before the shell; use env:): ${expressionLine}`);
  }

  // The preflight must also actually run: a skipped or non-blocking gate checks
  // nothing. Only absent or the literal boolean false is verifiable.
  if (step.if !== undefined) {
    problems.push(`preflight step must not be conditional (if: ${JSON.stringify(step.if)}) — a skipped gate checks nothing`);
  }
  if (unsafeFlag(step['continue-on-error'])) {
    problems.push('preflight step must not set continue-on-error — a failing gate must fail the job');
  }

  // Whole-body shape: exactly the four accepted blocks, in order, nothing else.
  // Line-by-line inspection is what let `echo -z "..."` look like a guard and
  // `echo "exit 1"` look like an exit; an exact block comparison cannot be
  // satisfied by text that merely resembles the commands.
  const normalized = lines.map(normalizeShellLine);
  const expected = REQUIRED_SECRETS.flatMap(acceptedCheckBlock);
  if (normalized.join('\n') !== expected.join('\n')) {
    const firstDiff = expected.findIndex((line, index) => normalized[index] !== line);
    const detail =
      firstDiff === -1
        ? `the body has ${normalized.length - expected.length} extra line(s) after the four accepted checks: ${JSON.stringify(
            normalized.slice(expected.length)
          )}`
        : `first mismatch at line ${firstDiff + 1}: expected ${JSON.stringify(
            expected[firstDiff]
          )}, got ${JSON.stringify(normalized[firstDiff] ?? '(end of script)')}`;
    problems.push(`preflight body must be exactly the four quoted env checks (fail-closed); ${detail}`);
  }

  for (const name of REQUIRED_SECRETS) {
    for (const line of normalized) {
      if (variableRef(name).test(line) && line !== normalizeShellLine(acceptedCheckBlock(name)[0])) {
        problems.push(`${name} value is referenced outside the quoted non-empty check: ${line}`);
        break;
      }
    }

    const testIndex = normalized.findIndex((line) => line.includes(`\${${name}:-}`));
    if (testIndex === -1) {
      problems.push(`missing non-empty check "[ -z "\${${name}:-}" ]"`);
      continue;
    }
    if (normalized[testIndex] !== normalizeShellLine(acceptedCheckBlock(name)[0])) {
      problems.push(`${name} expansion must be quoted as "\${${name}:-}" (unquoted or :? is not accepted)`);
    }
    const block = [];
    for (let index = testIndex; index < normalized.length && normalized[index] !== 'fi'; index += 1) {
      block.push(normalized[index]);
    }
    if (!block.includes('exit 1')) {
      problems.push(`the ${name} check does not exit non-zero — an empty secret must fail the job closed`);
    }
    const message = block.find((line) => line.startsWith('echo "::error::'));
    if (!message || !message.includes(name)) {
      problems.push(`the ${name} failure message must name the field, and only the field`);
    }
  }
  return problems;
}

/** Problems with every run block in the workflow (no expression may reach a shell). */
function inspectRunBlocks(doc) {
  const problems = [];
  for (const [jobName, job] of Object.entries((doc && doc.jobs) || {})) {
    for (const step of Array.isArray(job.steps) ? job.steps : []) {
      const bad = shellLines(stepRun(step)).find((line) => line.includes('${{'));
      if (bad !== undefined) {
        problems.push(`${jobName} / ${step.name || step.uses}: run: contains an unbounded expression: ${bad}`);
      }
    }
  }
  return problems;
}

// --- fixtures: plain data, never executed ---

const expressionEnv = () => Object.fromEntries(REQUIRED_SECRETS.map((name) => [name, secretExpression(name)]));

function preflightScript(names = REQUIRED_SECRETS, template = (name) => `"\${${name}:-}"`) {
  return names
    .map(
      (name) =>
        `if [ -z ${template(name)} ]; then\n  echo "::error::${name} secret is empty or missing"\n  exit 1\nfi`
    )
    .join('\n');
}

function preflightJob({ env = expressionEnv(), run = preflightScript() } = {}) {
  const step = { name: 'Preflight: Validate release secrets non-empty', run };
  if (env) step.env = env;
  return { steps: [step] };
}

const preflightProblems = (options) => inspectSecretPreflight(preflightJob(options)).join('\n');

// --- assertions against the real workflow ---

test('android-build.yml parses and keeps triggers, runner, Java/Gradle and artifact steps', () => {
  const doc = loadYaml(WORKFLOW);
  const job = doc.jobs[JOB];
  assert.ok(job, `${JOB} job missing`);
  assert.strictEqual(job['runs-on'], 'ubuntu-latest');
  assert.ok(!unsafeFlag(job['continue-on-error']), 'job-level continue-on-error would hide a failed job');

  const raw = fs.readFileSync(WORKFLOW, 'utf8');
  assert.ok(raw.includes('workflow_dispatch:'), 'workflow_dispatch trigger removed');
  assert.ok(/branches:\s*\[?main, master\]?/.test(raw), 'push/pull_request branch filters removed');

  const steps = jobSteps(doc, JOB);
  const serialized = JSON.stringify(steps);
  assert.ok(serialized.includes('java-version'), 'JDK setup removed');
  assert.ok(serialized.includes('gradle/actions/setup-gradle'), 'Gradle setup removed');
  assert.ok(steps.some((step) => stepRun(step).includes('base64 -d')), 'keystore decode step removed');
  assert.ok(steps.some((step) => stepRun(step).includes('assembleRelease')), 'Gradle assemble step removed');
  for (const artifact of ['apk/release/app-release.apk', 'bundle/release/app-release.aab']) {
    assert.ok(raw.includes(artifact), `artifact path ${artifact} removed`);
  }
});

test('android: the release-secret preflight maps the four secrets through env and quotes expansions', () => {
  const doc = loadYaml(WORKFLOW);
  const problems = inspectSecretPreflight(doc.jobs[JOB]);
  assert.deepStrictEqual(problems, [], `preflight problems:\n  ${problems.join('\n  ')}`);
});

test('android: no run: block anywhere interpolates a GitHub expression', () => {
  const problems = inspectRunBlocks(loadYaml(WORKFLOW));
  assert.deepStrictEqual(problems, [], `expression-in-script problems:\n  ${problems.join('\n  ')}`);
});

test('android: keystore decode and Gradle release steps still receive their secrets via env', () => {
  const steps = jobSteps(loadYaml(WORKFLOW), JOB);
  const decode = steps.find((step) => stepRun(step).includes('base64 -d'));
  assert.ok(decode, 'keystore decode step missing');
  assert.strictEqual((decode.env || {}).RELEASE_KEYSTORE_BASE64, secretExpression('RELEASE_KEYSTORE_BASE64'));
  const gradle = steps.find((step) => stepRun(step).includes('assembleRelease'));
  assert.ok(gradle, 'Gradle assemble step missing');
  for (const name of ['RELEASE_STORE_PASSWORD', 'RELEASE_KEY_ALIAS', 'RELEASE_KEY_PASSWORD']) {
    assert.strictEqual((gradle.env || {})[name], secretExpression(name), `${name} no longer reaches Gradle via env`);
  }
});

// --- negative fixtures: the preflight guard must still reject real regressions ---

test('preflight guard: permits the accepted env-mapped form', () => {
  assert.deepStrictEqual(inspectSecretPreflight(preflightJob()), []);
});

test('preflight guard: rejects an inline secrets expression in run:', () => {
  const inline = REQUIRED_SECRETS.map(
    (name) => `if [ -z "\${{ secrets.${name} }}" ]; then\n  echo "::error::${name} secret is empty or missing"\n  exit 1\nfi`
  ).join('\n');
  const problems = preflightProblems({ env: null, run: inline });
  assert.match(problems, /env\.RELEASE_KEYSTORE_BASE64 missing/, 'the inline form has no env mapping');
  assert.match(problems, /run: script contains an unbounded expression/, 'an expression in the script must be reported');
});

test('preflight guard: rejects a missing, swapped, literal or extra env mapping', () => {
  const missing = expressionEnv();
  delete missing.RELEASE_KEY_ALIAS;
  assert.match(preflightProblems({ env: missing }), /env\.RELEASE_KEY_ALIAS missing/);

  const swapped = expressionEnv();
  swapped.RELEASE_KEY_PASSWORD = secretExpression('RELEASE_STORE_PASSWORD');
  assert.match(preflightProblems({ env: swapped }), /env\.RELEASE_KEY_PASSWORD must be exactly/);

  const literal = expressionEnv();
  literal.RELEASE_STORE_PASSWORD = 'not-a-secret-expression';
  assert.match(preflightProblems({ env: literal }), /env\.RELEASE_STORE_PASSWORD must be exactly/);

  const extra = { ...expressionEnv(), UNCHECKED: secretExpression('SOME_OTHER_SECRET') };
  assert.match(preflightProblems({ env: extra }), /env\.UNCHECKED maps an extra secret/);

  assert.match(preflightProblems({ env: null }), /env\.RELEASE_KEYSTORE_BASE64 missing/);
});

test('preflight guard: rejects a missing, unquoted or non-failing non-empty check', () => {
  assert.match(
    preflightProblems({ run: preflightScript(REQUIRED_SECRETS.filter((name) => name !== 'RELEASE_KEY_PASSWORD')) }),
    /missing non-empty check .*RELEASE_KEY_PASSWORD/
  );
  assert.match(
    preflightProblems({ run: preflightScript(REQUIRED_SECRETS, (name) => `\${${name}:-}`) }),
    /must be quoted as/,
    'an unquoted expansion must not satisfy the check'
  );
  assert.match(
    preflightProblems({ run: preflightScript(REQUIRED_SECRETS).replace(/ {2}exit 1\n/g, '  echo "warn only"\n') }),
    /does not exit non-zero/
  );
  assert.match(
    preflightProblems({ run: preflightScript(REQUIRED_SECRETS).replace('::error::RELEASE_KEY_ALIAS secret', '::error::a secret') }),
    /failure message must name the field/
  );
});

test('preflight guard: rejects logging or re-consuming a secret value outside the check', () => {
  assert.match(
    preflightProblems({ run: `${preflightScript()}\necho "$RELEASE_STORE_PASSWORD"` }),
    /RELEASE_STORE_PASSWORD value is referenced outside/
  );
  assert.match(
    preflightProblems({ run: `${preflightScript()}\nbase64 -d <<< "\${RELEASE_KEYSTORE_BASE64:-}"` }),
    /RELEASE_KEYSTORE_BASE64 value is referenced outside/
  );
});

test('preflight guard: keeps hostile synthetic values as data, never echo or execute them', () => {
  // A value that would break out of unquoted interpolation. It is compared as a
  // string only: no shell, no child process, no signing, no output.
  const hostile = 'p@ss"w\'o$rd`id`; rm -rf / $(echo x)\nsecond line';
  const problems = preflightProblems({ env: { ...expressionEnv(), RELEASE_STORE_PASSWORD: hostile } });
  assert.match(problems, /env\.RELEASE_STORE_PASSWORD must be exactly/);
  assert.ok(!problems.includes('rm -rf'), 'the diagnostic must not echo a rejected value');
  assert.match(
    preflightProblems({ run: `${preflightScript()}\nprintf '%s' "\${RELEASE_STORE_PASSWORD:-}"` }),
    /RELEASE_STORE_PASSWORD value is referenced outside/
  );
});

test('preflight guard: rejects a body that only disguises the accepted checks', () => {
  // Positive control: the accepted env-mapped body must still pass.
  assert.deepStrictEqual(inspectSecretPreflight(preflightJob()), []);

  const cases = [
    [
      'logging disguised as a check',
      `${preflightScript()}\necho -z "\${RELEASE_STORE_PASSWORD:-}"`,
      /referenced outside|preflight body/,
    ],
    [
      'echoed exit text is not an exit',
      preflightScript().replace(/exit 1/g, 'echo "exit 1"'),
      /does not exit non-zero|preflight body/,
    ],
    ['whole preflight skipped', `if false; then\n${preflightScript()}\nfi`, /preflight body/],
  ];
  for (const [label, run, expected] of cases) {
    const problems = preflightProblems({ run });
    assert.ok(problems.length > 0, `${label} must be rejected`);
    assert.match(problems, expected, label);
  }
});

test('preflight guard: rejects a conditional or continue-on-error preflight step', () => {
  assert.deepStrictEqual(inspectSecretPreflight(preflightJob()), [], 'positive control');

  const cases = [
    ['conditional', { if: 'false' }, /must not be conditional/],
    ['continue-on-error', { 'continue-on-error': true }, /must not set continue-on-error/],
  ];
  for (const [label, extra, expected] of cases) {
    const job = preflightJob();
    Object.assign(job.steps[0], extra);
    assert.match(inspectSecretPreflight(job).join('\n'), expected, label);
  }
});

// ---------------------------------------------------------------------------
// B. Deterministic Node install
//
// `npm ci` installs package-lock.json as written and fails when it disagrees
// with package.json; it never updates the lock. `npm install` is allowed to
// reconcile and rewrite it, so the same commit can produce different trees on
// different days. `--legacy-peer-deps` stays because npm 10 needs it for this
// repo's peer graph and .npmrc sets it too. The install step is judged as a
// WHOLE block: a wrapper such as `if false; then … fi` or `set +e … exit 0`
// would otherwise hide the command from a line-by-line scan.
// ---------------------------------------------------------------------------

const PINNED_NODE_VERSION = '22.23.4';
const INSTALL_COMMAND = 'npm ci --legacy-peer-deps';
const NPM_INSTALL_RE = /\bnpm\s+(ci|clean-install|install|i|install-test|add)\b/;

/**
 * Problems with the pinned toolchain and frozen install. Empty means clean.
 * @param {object} job parsed job object
 * @returns {string[]}
 */
function inspectNodeInstall(job) {
  const problems = [];
  const steps = Array.isArray(job && job.steps) ? job.steps : [];
  if (unsafeFlag(job && job['continue-on-error'])) {
    problems.push('job-level continue-on-error would let a failed install or build pass the job');
  }

  const setupIndexes = steps
    .map((step, index) => (String((step && step.uses) || '').startsWith('actions/setup-node@') ? index : -1))
    .filter((index) => index !== -1);
  if (setupIndexes.length === 0) {
    problems.push('actions/setup-node step missing');
  } else if (setupIndexes.length > 1) {
    problems.push(`${setupIndexes.length} actions/setup-node steps — exactly one pinned toolchain is allowed`);
  }
  if (setupIndexes.length >= 1) {
    const setup = steps[setupIndexes[0]] || {};
    const withBlock = setup.with && typeof setup.with === 'object' ? setup.with : {};
    const version = withBlock['node-version'];
    if (typeof version !== 'string' || version !== PINNED_NODE_VERSION) {
      problems.push(
        `node-version must be the quoted exact pin "${PINNED_NODE_VERSION}", got ${JSON.stringify(version)} (${typeof version})`
      );
    }
    if (withBlock.cache !== 'npm') problems.push('setup-node must keep cache: "npm"');
    if (setup.if !== undefined) problems.push('setup-node must not be conditional');
    if (unsafeFlag(setup['continue-on-error'])) problems.push('setup-node must not set continue-on-error');
  }

  const installIndexes = steps
    .map((step, index) => (NPM_INSTALL_RE.test(stepRun(step)) ? index : -1))
    .filter((index) => index !== -1);
  if (installIndexes.length === 0) {
    problems.push(`no "${INSTALL_COMMAND}" step`);
  } else if (installIndexes.length > 1) {
    problems.push(`${installIndexes.length} npm install steps — exactly one frozen install is allowed`);
  }
  for (const index of installIndexes) {
    const step = steps[index] || {};
    if (stepRun(step).trim() !== INSTALL_COMMAND) {
      problems.push(
        `install step ${index} must be exactly "${INSTALL_COMMAND}" as its whole run block, got: ${JSON.stringify(stepRun(step).trim())}`
      );
    }
    if (step.if !== undefined) problems.push(`install step ${index} must not be conditional (if:)`);
    if (unsafeFlag(step['continue-on-error'])) problems.push(`install step ${index} must not set continue-on-error`);
  }

  if (installIndexes.length === 1) {
    const installIndex = installIndexes[0];
    if (setupIndexes.length >= 1 && installIndex < setupIndexes[0]) {
      problems.push('install runs before the pinned Node setup');
    }
    const buildIndex = steps.findIndex(
      (step, index) => index !== installIndex && /npm\s+run\s+build:mobile/.test(stepRun(step))
    );
    if (buildIndex !== -1 && installIndex > buildIndex) {
      problems.push('install must run before the web build / cap sync step');
    }
  }
  return problems;
}

/** Raw `node-version:` declaration values, quotes preserved, comments dropped. */
function nodeVersionDeclarations(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.trim())
    .map((line) => /^node-version:\s*(.*)$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => match[1]);
}

test('android: setup-node pins the quoted exact Node patch and keeps the npm cache', () => {
  const raw = fs.readFileSync(WORKFLOW, 'utf8');
  assert.deepStrictEqual(nodeVersionDeclarations(raw), [`'${PINNED_NODE_VERSION}'`]);
  const problems = inspectNodeInstall(loadYaml(WORKFLOW).jobs[JOB]);
  assert.deepStrictEqual(problems, [], `node/install problems:\n  ${problems.join('\n  ')}`);
});

test('android: .npmrc keeps legacy-peer-deps alongside the explicit flag', () => {
  const npmrc = fs.readFileSync(path.join(ROOT, '.npmrc'), 'utf8');
  assert.match(npmrc, /^\s*legacy-peer-deps\s*=\s*true\s*$/m);
});

// --- fixtures: synthetic job objects, nothing executed ---

const nodeSetupStep = (version = PINNED_NODE_VERSION, extra = {}) => ({
  uses: 'actions/setup-node@v4',
  with: { 'node-version': version, cache: 'npm' },
  ...extra,
});
const installStep = (run = INSTALL_COMMAND, extra = {}) => ({ name: 'Install Node Dependencies', run, ...extra });
const buildStep = () => ({ name: 'Build Web Bundle', run: 'npm run build:mobile\nnpx cap sync android' });

function androidJob({ setup = [nodeSetupStep()], install = [installStep()], build = [buildStep()], job = {} } = {}) {
  return { steps: [...setup, ...install, ...build], ...job };
}

const nodeProblems = (options) => inspectNodeInstall(androidJob(options)).join('\n');

test('install guard: permits the pinned fixture itself', () => {
  assert.deepStrictEqual(inspectNodeInstall(androidJob()), []);
});

test('install guard: rejects the pre-existing numeric Node 22 + "npm install" workflow', () => {
  const problems = nodeProblems({
    setup: [nodeSetupStep(22)],
    install: [installStep('npm install --legacy-peer-deps')],
  });
  assert.match(problems, /node-version must be the quoted exact pin/);
  assert.match(problems, /must be exactly "npm ci --legacy-peer-deps"/);
});

test('install guard: rejects floating or wrong Node versions', () => {
  for (const version of [22, 22.23, '22', '22.x', '^22.23.4', '22.22.2', '24.18.0', null]) {
    assert.match(nodeProblems({ setup: [nodeSetupStep(version)] }), /node-version/, JSON.stringify(version));
  }
});

test('install guard: judges the WHOLE install block, not a line inside a wrapper', () => {
  const wrappers = [
    `if false; then\n${INSTALL_COMMAND}\nfi`,
    `set +e\n${INSTALL_COMMAND}\nexit 0`,
    `set -e\n${INSTALL_COMMAND}`,
    `${INSTALL_COMMAND} || true`,
    `${INSTALL_COMMAND}\nnpm install`,
  ];
  for (const run of wrappers) {
    assert.match(
      nodeProblems({ install: [installStep(run)] }),
      /must be exactly "npm ci --legacy-peer-deps" as its whole run block/,
      run
    );
  }
});

test('install guard: rejects conditional or continue-on-error steps and job-level continue-on-error', () => {
  assert.match(nodeProblems({ install: [installStep(INSTALL_COMMAND, { if: 'false' })] }), /must not be conditional/);
  assert.match(
    nodeProblems({ install: [installStep(INSTALL_COMMAND, { 'continue-on-error': true })] }),
    /install step .* must not set continue-on-error/
  );
  assert.match(nodeProblems({ setup: [nodeSetupStep(PINNED_NODE_VERSION, { if: 'false' })] }), /setup-node must not be conditional/);
  assert.match(
    nodeProblems({ setup: [nodeSetupStep(PINNED_NODE_VERSION, { 'continue-on-error': true })] }),
    /setup-node must not set continue-on-error/
  );
  assert.match(nodeProblems({ job: { 'continue-on-error': true } }), /job-level continue-on-error/);
  // Anything but the literal boolean false is not verifiable, so it is unsafe.
  for (const value of ['true', '${{ always() }}', 1, null]) {
    assert.match(
      nodeProblems({ job: { 'continue-on-error': value } }),
      /job-level continue-on-error/,
      JSON.stringify(value)
    );
    assert.match(
      nodeProblems({ install: [installStep(INSTALL_COMMAND, { 'continue-on-error': value })] }),
      /must not set continue-on-error/,
      JSON.stringify(value)
    );
  }
  // An explicit false stays allowed.
  assert.deepStrictEqual(inspectNodeInstall(androidJob({ job: { 'continue-on-error': false } })), []);
});

test('install guard: rejects a dropped flag, extra arguments, duplicates and wrong ordering', () => {
  assert.match(nodeProblems({ install: [installStep('npm ci')] }), /must be exactly/);
  assert.match(nodeProblems({ install: [installStep(`${INSTALL_COMMAND} --omit=dev`)] }), /must be exactly/);
  assert.match(nodeProblems({ install: [installStep(), installStep()] }), /2 npm install steps/);
  assert.match(
    nodeProblems({ install: [], build: [buildStep(), installStep()] }),
    /install must run before the web build/
  );
  assert.match(
    nodeProblems({ setup: [], install: [installStep(), nodeSetupStep()] }),
    /install runs before the pinned Node setup/
  );
  assert.match(nodeProblems({ setup: [] }), /setup-node step missing/);
  assert.match(nodeProblems({ install: [] }), /no "npm ci --legacy-peer-deps" step/);
});

test('install guard: rejects a bare setup-node version declaration outside setup-node', () => {
  // Raw-text scan: a second numeric `node-version:` anywhere in the file fails,
  // so a comment cannot vouch for a pin the runner never sees.
  assert.deepStrictEqual(nodeVersionDeclarations("          node-version: '22.23.4'"), ["'22.23.4'"]);
  assert.deepStrictEqual(nodeVersionDeclarations('          # node-version: \'22.23.4\''), []);
});
