import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareConfig } from './prepare-native-config.mjs';
test('missing CI environment secret fails without printing values', () => {
  assert.throws(() => prepareConfig({}, 'android'), /MOBILE_PRODUCTION_ENV/);
});
test('staging config is refused by native production preparation', () => {
  assert.throws(() => prepareConfig({ MOBILE_PRODUCTION_ENV: JSON.stringify({ VITE_APP_ENV: 'staging' }) }, 'ios'), /production/);
});
test('unknown platform is rejected', () => {
  assert.throws(() => prepareConfig({}, 'web'), /platform/);
});

const values = { VITE_APP_ENV: 'production', VITE_FIREBASE_API_KEY: 'ci-public-key', VITE_FIREBASE_AUTH_DOMAIN: 'ci.firebaseapp.com', VITE_FIREBASE_PROJECT_ID: 'ci-project', VITE_FIREBASE_STORAGE_BUCKET: 'ci-project.appspot.com', VITE_FIREBASE_MESSAGING_SENDER_ID: '123', VITE_FIREBASE_APP_ID: '1:123:web:abc', VITE_API_BASE_URL: 'https://api.burgonomics.com', VITE_API_BASE: 'https://api.burgonomics.com' };
function appleSecret(bundle, project = 'ci-project') { return Buffer.from(`<plist><dict><key>BUNDLE_ID</key><string>${bundle}</string><key>PROJECT_ID</key><string>${project}</string></dict></plist>`).toString('base64'); }
test('matching Apple config emits separate dotenv lines', () => {
 const result = prepareConfig({ MOBILE_PRODUCTION_ENV: JSON.stringify(values), GOOGLE_SERVICE_INFO_PLIST_BASE64: appleSecret('com.burgonomics') }, 'ios');
 assert.ok(result.dotenv.split('\n').length > 6);
});
test('Apple bundle matching is exact, not wildcard regex', () => {
 assert.throws(() => prepareConfig({ MOBILE_PRODUCTION_ENV: JSON.stringify(values), GOOGLE_SERVICE_INFO_PLIST_BASE64: appleSecret('comXburgonomics') }, 'ios'), /bundle|project/);
});
test('Apple project must match web project', () => {
  assert.throws(() => prepareConfig({ MOBILE_PRODUCTION_ENV: JSON.stringify(values), GOOGLE_SERVICE_INFO_PLIST_BASE64: appleSecret('com.burgonomics', 'different-project') }, 'ios'), /bundle|project/);
});

function androidEnv(overrides = {}, packageName = 'com.burgonomics', project = 'ci-project') {
  return {
    MOBILE_PRODUCTION_ENV: JSON.stringify({ ...values, ...overrides }),
    GOOGLE_SERVICES_JSON_BASE64: Buffer.from(JSON.stringify({
      project_info: { project_id: project },
      client: [{ client_info: { android_client_info: { package_name: packageName } } }],
    })).toString('base64'),
  };
}

test('matching Android project and package emit the exact native config and dotenv', () => {
  const env = androidEnv();
  const result = prepareConfig(env, 'android');
  assert.equal(result.nativePath, 'android/app/google-services.json');
  assert.equal(result.native, Buffer.from(env.GOOGLE_SERVICES_JSON_BASE64, 'base64').toString('utf8'));
  assert.ok(result.dotenv.includes('VITE_API_BASE_URL="https://api.burgonomics.com"\n'));
});

test('Android package matching is exact and project must match web config', () => {
  assert.throws(() => prepareConfig(androidEnv({}, 'comXburgonomics'), 'android'), /project\/package mismatch/);
  assert.throws(() => prepareConfig(androidEnv({}, 'com.burgonomics', 'other-project'), 'android'), /project\/package mismatch/);
});

test('missing or malformed Android native JSON fails closed', () => {
  const env = androidEnv();
  assert.throws(() => prepareConfig({ ...env, GOOGLE_SERVICES_JSON_BASE64: '' }, 'android'), /Missing.*GOOGLE_SERVICES/);
  assert.throws(() => prepareConfig({ ...env, GOOGLE_SERVICES_JSON_BASE64: Buffer.from('{').toString('base64') }, 'android'), /valid JSON/);
});

for (const url of [
  'http://api.burgonomics.com', 'https://localhost', 'https://localhost.',
  'https://127.0.0.1', 'https://127.1', 'https://[::1]', 'https://0.0.0.0',
  'https://api.example.com', 'https://user:password@api.burgonomics.com',
  'https://localhost..', 'https://api.example.com...',
]) {
  test(`production API refuses local, placeholder or credential-bearing URL: ${url}`, () => {
    assert.throws(() => prepareConfig(androidEnv({ VITE_API_BASE_URL: url }), 'android'), /Production API/);
    assert.throws(() => prepareConfig({
      ...androidEnv({ VITE_API_BASE_URL: url }),
      GOOGLE_SERVICE_INFO_PLIST_BASE64: appleSecret('com.burgonomics'),
    }, 'ios'), /Production API/);
  });
}

test('real HTTPS hosts are not rejected for merely containing example or localhost', () => {
  for (const url of ['https://example-api.burgonomics.com/v1', 'https://localhost-api.run.app']) {
    assert.equal(prepareConfig(androidEnv({ VITE_API_BASE_URL: url }), 'android').nativePath, 'android/app/google-services.json');
  }
});

test('dotenv syntax refuses newline, interpolation, invalid keys and non-string values', () => {
  for (const overrides of [{ VITE_EXTRA: 'one\ntwo' }, { VITE_EXTRA: '$TOKEN' }, { invalid_key: 'x' }, { VITE_EXTRA: 42 }]) {
    assert.throws(() => prepareConfig(androidEnv(overrides), 'android'), /unsupported key\/value syntax/);
  }
});
