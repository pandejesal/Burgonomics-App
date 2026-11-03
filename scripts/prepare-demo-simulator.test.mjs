import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareDemoConfig } from './prepare-demo-simulator.mjs';

const project = 'burgonomics-7faa8';
function fixture(bundle = 'com.burgonomics') {
  const values = {
    VITE_APP_ENV: 'staging', VITE_FIREBASE_PROJECT_ID: project,
    VITE_FIREBASE_API_KEY: 'A'.padEnd(39, 'x'),
    VITE_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
    VITE_FIREBASE_STORAGE_BUCKET: `${project}.firebasestorage.app`,
    VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
    VITE_FIREBASE_APP_ID: '1:1234567890:web:test',
    VITE_API_BASE_URL: `https://asia-south1-${project}.cloudfunctions.net/api`,
    VITE_RAZORPAY_KEY_ID: 'rzp_test_fixture',
  };
  const native = `<plist><dict><key>BUNDLE_ID</key><string>${bundle}</string><key>PROJECT_ID</key><string>${project}</string><key>API_KEY</key><string>${values.VITE_FIREBASE_API_KEY}</string><key>GCM_SENDER_ID</key><string>1234567890</string><key>GOOGLE_APP_ID</key><string>1:1234567890:ios:test</string></dict></plist>`;
  return { values, env: { MOBILE_STAGING_ENV: JSON.stringify(values), STAGING_GOOGLE_SERVICE_INFO_PLIST_BASE64: Buffer.from(native).toString('base64') }, native };
}
const withValues = (f, changes) => ({ ...f.env, MOBILE_STAGING_ENV: JSON.stringify({ ...f.values, ...changes }) });

test('real staging configuration is separate from fixture and production', () => {
  for (const bundle of ['com.burgonomics', 'com.burgonomics.partner']) {
    const f = fixture(bundle);
    const result = prepareDemoConfig(f.env, bundle);
    assert.equal(result.native, f.native);
    assert.match(result.dotenv, /VITE_APP_ENV="staging"/);
    assert.match(result.dotenv, /VITE_PUSH_ENABLED="false"/);
    assert.match(result.dotenv, /VITE_API_BASE="https:\/\/asia-south1-burgonomics-7faa8.cloudfunctions.net\/api"/);
  }
});
test('missing or malformed staging secrets fail closed', () => {
  assert.throws(() => prepareDemoConfig({}, 'com.burgonomics'), /MOBILE_STAGING_ENV/);
  assert.throws(() => prepareDemoConfig({ MOBILE_STAGING_ENV: '[]' }, 'com.burgonomics'), /JSON object/);
  const f = fixture();
  assert.throws(() => prepareDemoConfig({ ...f.env, MOBILE_STAGING_ENV: '{' }, 'com.burgonomics'), /JSON object/);
  assert.throws(() => prepareDemoConfig({ MOBILE_STAGING_ENV: f.env.MOBILE_STAGING_ENV }, 'com.burgonomics'), /PLIST_BASE64/);
});
test('production project, live money, foreign API and enabled mocks are refused', () => {
  const f = fixture();
  for (const changes of [
    { VITE_APP_ENV: 'production' }, { VITE_FIREBASE_PROJECT_ID: 'burgonomics-prod' },
    { VITE_RAZORPAY_KEY_ID: 'rzp_live_forbidden' },
    { VITE_API_BASE_URL: 'https://evil.example/api' },
    { VITE_API_BASE: 'https://production.example/api' },
    { VITE_MOCK_PAYMENTS: 'true' }, { VITE_USE_MOCKS: '1' },
    { VITE_API_BASE_URL: f.values.VITE_API_BASE_URL + '?token=not-allowed' },
  ]) assert.throws(() => prepareDemoConfig(withValues(f, changes), 'com.burgonomics'));
});
test('native bundle, project, API-key shape and sender must agree', () => {
  const f = fixture();
  for (const [before, after] of [
    ['com.burgonomics', 'com.foreign'], [project, 'burgonomics-prod'],
    [f.values.VITE_FIREBASE_API_KEY, 'bad-key'], ['1234567890', '9999999999'],
  ]) {
    const env = { ...f.env, STAGING_GOOGLE_SERVICE_INFO_PLIST_BASE64: Buffer.from(f.native.replaceAll(before, after)).toString('base64') };
    assert.throws(() => prepareDemoConfig(env, 'com.burgonomics'));
  }
});
test('required values and dotenv syntax are validated without printing their values', () => {
  const f = fixture();
  for (const changes of [
    { VITE_FIREBASE_APP_ID: '' }, { PRIVATE_SECRET: 'do-not-echo-me' },
    { VITE_LABEL: 'do-not-echo-me\nBAD=true' }, { VITE_LABEL: '$SECRET' },
  ]) {
    assert.throws(() => prepareDemoConfig(withValues(f, changes), 'com.burgonomics'), error => !error.message.includes('do-not-echo-me'));
  }
});
