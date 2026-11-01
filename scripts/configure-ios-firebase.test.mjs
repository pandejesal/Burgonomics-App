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
test('the App Check plugin gets a package identity of its own', () => {
 const fixture = '        .package(name: "CapacitorFirebaseAppCheck", path: "../../../node_modules/@capacitor-firebase/app-check"),';
 const result = configurePackage(fixture);
 assert.ok(!result.includes('node_modules/@capacitor-firebase/app-check'));
 assert.match(result, /path: "\.\.\/LocalPackages\/capacitor-firebase-app-check"/);
 assert.equal(configurePackage(result), result);
});
