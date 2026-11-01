import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function configurePackage(source) {
  let result = source;
  if (!result.includes('firebase-ios-sdk.git')) result = result.replace('    dependencies: [', '    dependencies: [\n        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "12.7.0")),');
  for (const name of ['FirebaseCore', 'FirebaseMessaging']) {
    if (!result.includes(`.product(name: "${name}"`)) result = result.replace('            dependencies: [', `            dependencies: [\n                .product(name: "${name}", package: "firebase-ios-sdk"),`);
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = 'ios/App/CapApp-SPM/Package.swift';
  writeFileSync(file, configurePackage(readFileSync(file, 'utf8')));
}
