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
