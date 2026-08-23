import { spawnSync } from 'child_process';

const env = {
  ...process.env,
  JAVA_HOME: 'C:\\Program Files\\Android\\Android Studio\\jbr',
  PATH: `C:\\Program Files\\Android\\Android Studio\\jbr\\bin;${process.env.PATH}`,
};

const result = spawnSync(
  'npx',
  ['firebase', 'emulators:exec', '--only', 'firestore', '\"npx vitest run tests/rules --reporter=verbose\"'],
  {
    env,
    stdio: 'inherit',
    shell: true,
  }
);

process.exit(result.status ?? 0);
