import { spawnSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';

// Local runner for the Firestore rules suite (needs a Firestore emulator).
// Windows: reuse the Android Studio JBR when present; otherwise fall back to
// whatever java is on PATH. CI uses the `rules` job in .github/workflows/ci.yml
// (Linux + Temurin JDK) instead of this script.
const isWindows = process.platform === 'win32';
const windowsJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';

const env = { ...process.env };
if (isWindows) {
  try {
    const { existsSync } = await import('fs');
    if (existsSync(`${windowsJbr}\\bin\\java.exe`)) {
      env.JAVA_HOME = windowsJbr;
      env.PATH = `${windowsJbr}\\bin;${process.env.PATH}`;
    }
  } catch {
    // Fall through to PATH java.
  }
}

const resultFile = '.rules-gate-result.json';
try {
  if (existsSync(resultFile)) unlinkSync(resultFile);
} catch {
  // A stale result file is removed below; the JSON parse/integrity check fails closed.
}

const result = spawnSync(
  'npx',
  [
    'firebase',
    'emulators:exec',
    '--only',
    'firestore',
    '--project',
    'burgonomics-test-rules',
    // Lane 07: the rules dir now holds more than one file. Every rules test
    // calls clearFirestore() in beforeEach, so parallel files wipe each
    // other's seeds mid-test; run them sequentially (deterministic gate).
    // JSON reporter output is parsed below so an all-skipped run cannot look
    // green (vitest exits 0 when every test is skipped).
    `"npx vitest run tests/rules --reporter=json --outputFile=${resultFile} --hookTimeout=120000 --fileParallelism=false"`,
  ],
  {
    env,
    stdio: 'inherit',
    shell: true,
  }
);

let gateError = null;
try {
  if (!existsSync(resultFile)) {
    gateError = 'rules result JSON was not written';
  } else {
    const summary = JSON.parse(readFileSync(resultFile, 'utf8'));
    const passed = Number(summary.numPassedTests ?? 0);
    const pending = Number(summary.numPendingTests ?? 0);
    const failed = Number(summary.numFailedTests ?? 0);
    if (pending !== 0 || failed !== 0 || passed < 146) {
      gateError = `rules gate integrity failed: passed=${passed} failed=${failed} pending=${pending} (requires >=146 passed, 0 failed, 0 pending)`;
    }
  }
} catch (err) {
  gateError = `rules result JSON could not be parsed: ${err instanceof Error ? err.message : String(err)}`;
} finally {
  try {
    if (existsSync(resultFile)) unlinkSync(resultFile);
  } catch {
    // cleanup only
  }
}

if (gateError) {
  console.error(`RULES GATE RED: ${gateError}`);
  process.exit(1);
}
if (result.status === null || result.status !== 0) {
  console.error(`RULES GATE RED: emulator/vitest exited ${String(result.status)}`);
  process.exit(1);
}

console.log('RULES GATE GREEN: 146+ passed, 0 failed, 0 pending');
process.exit(0);
