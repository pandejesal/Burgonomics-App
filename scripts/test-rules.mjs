import { spawnSync } from 'child_process';

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

const result = spawnSync(
  'npx',
  [
    'firebase',
    'emulators:exec',
    '--only',
    'firestore',
    '--project',
    'burgonomics-test-rules',
    '"npx vitest run tests/rules --reporter=verbose"',
  ],
  {
    env,
    stdio: 'inherit',
    shell: true,
  }
);

process.exit(result.status ?? 0);
