import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configurePackage } from './configure-ios-firebase.mjs';
test('Firebase products survive Capacitor sync without duplicate dependencies', () => {
 const fixture = '    dependencies: [\n            dependencies: [';
 const result = configurePackage(fixture);
 assert.match(result, /firebase-ios-sdk.git/);
 assert.match(result, /FirebaseMessaging/);
 assert.match(result, /FirebaseCore/);
 assert.equal(configurePackage(result), result);
});
