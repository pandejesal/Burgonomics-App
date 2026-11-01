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
