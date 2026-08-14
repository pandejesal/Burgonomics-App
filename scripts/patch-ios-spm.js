import fs from 'fs';
import path from 'path';

const spmFile = path.resolve('ios/App/CapApp-SPM/Package.swift');

if (fs.existsSync(spmFile)) {
  let content = fs.readFileSync(spmFile, 'utf8');

  // 1. Convert Windows backslashes to POSIX forward slashes
  content = content.replace(/\\/g, '/');

  // 2. Set deployment target to iOS 16.0
  content = content.replace(/\.iOS\(\.v15\)/g, '.iOS(.v16)');

  // 3. Pin capacitor-swift-pm to 8.4.2 to maintain compatibility with plugin APIs
  content = content.replace(/exact:\s*"8\.[0-9]+\.[0-9]+"/g, 'exact: "8.4.2"');

  // 4. Inject keychain-swift dependency if missing
  if (!content.includes('keychain-swift')) {
    content = content.replace(
      /(\.package\(url:\s*"https:\/\/github\.com\/ionic-team\/capacitor-swift-pm\.git",\s*exact:\s*"8\.4\.2"\),)/,
      '$1\n        .package(url: "https://github.com/evgenyneu/keychain-swift.git", exact: "21.0.0"),'
    );
    if (!content.includes('KeychainSwift')) {
      content = content.replace(
        '.product(name: "Capacitor", package: "capacitor-swift-pm"),',
        '.product(name: "Capacitor", package: "capacitor-swift-pm"),\n                .product(name: "KeychainSwift", package: "keychain-swift"),'
      );
    }
  }

  fs.writeFileSync(spmFile, content, 'utf8');
  console.log('✅ Successfully patched ios/App/CapApp-SPM/Package.swift');
  console.log(content);
} else {
  console.error(`❌ SPM file not found at ${spmFile}`);
  process.exit(1);
}
