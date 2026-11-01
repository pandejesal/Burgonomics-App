import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// SwiftPM names a path package after its last folder, so the plugin's "app-check"
// collides with github.com/google/app-check, which firebase-ios-sdk depends on, and
// the package graph cannot resolve. Build from a copy under a folder of its own.
const appCheckPlugin = 'node_modules/@capacitor-firebase/app-check';
const appCheckCopy = 'LocalPackages/capacitor-firebase-app-check';

export function configurePackage(source) {
  let result = source;
  if (!result.includes('firebase-ios-sdk.git')) result = result.replace('    dependencies: [', '    dependencies: [\n        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "12.7.0")),');
  for (const name of ['FirebaseCore', 'FirebaseMessaging']) {
    if (!result.includes(`.product(name: "${name}"`)) result = result.replace('            dependencies: [', `            dependencies: [\n                .product(name: "${name}", package: "firebase-ios-sdk"),`);
  }
  return result.replace(`path: "../../../${appCheckPlugin}"`, `path: "../${appCheckCopy}"`);
}

function copyAppCheckPlugin() {
  const target = `ios/App/${appCheckCopy}`;
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(`${appCheckPlugin}/Package.swift`, `${target}/Package.swift`);
  cpSync(`${appCheckPlugin}/ios`, `${target}/ios`, { recursive: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = 'ios/App/CapApp-SPM/Package.swift';
  writeFileSync(file, configurePackage(readFileSync(file, 'utf8')));
  copyAppCheckPlugin();
}
