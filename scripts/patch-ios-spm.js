import fs from 'fs';
import path from 'path';

// 1. Patch CapApp-SPM Package.swift
const spmFile = path.resolve('ios/App/CapApp-SPM/Package.swift');

if (fs.existsSync(spmFile)) {
  let content = fs.readFileSync(spmFile, 'utf8');

  // Convert Windows backslashes to POSIX forward slashes
  content = content.replace(/\\/g, '/');

  // Set deployment target to iOS 16.0
  content = content.replace(/\.iOS\(\.v15\)/g, '.iOS(.v16)');

  // Pin capacitor-swift-pm to 8.5.0 (matching installed @capacitor/ios 8.5.0)
  content = content.replace(/exact:\s*"8\.[0-9]+\.[0-9]+"/g, 'exact: "8.5.0"');
  content = content.replace(/from:\s*"8\.[0-9]+\.[0-9]+"/g, 'exact: "8.5.0"');

  // Inject keychain-swift dependency if missing
  if (!content.includes('keychain-swift')) {
    content = content.replace(
      /(\.package\(url:\s*"https:\/\/github\.com\/ionic-team\/capacitor-swift-pm\.git",\s*exact:\s*"8\.5\.0"\),)/,
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
  console.log('✅ Successfully patched ios/App/CapApp-SPM/Package.swift for Capacitor 8.5.0');
} else {
  console.error(`❌ SPM file not found at ${spmFile}`);
  process.exit(1);
}

// 2. Patch all capacitor plugins in node_modules to pin capacitor-swift-pm to 8.5.0
const nodeModulesDirs = [
  path.resolve('node_modules/@capacitor'),
  path.resolve('node_modules/@aparajita')
];

for (const baseDir of nodeModulesDirs) {
  if (!fs.existsSync(baseDir)) continue;
  const packages = fs.readdirSync(baseDir);
  for (const pkg of packages) {
    const pkgSwift = path.join(baseDir, pkg, 'Package.swift');
    if (fs.existsSync(pkgSwift)) {
      let c = fs.readFileSync(pkgSwift, 'utf8');
      c = c.replace(/url:\s*"https:\/\/github\.com\/ionic-team\/capacitor-swift-pm\.git",\s*from:\s*"[^"]+"/g, 'url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0"');
      c = c.replace(/url:\s*"https:\/\/github\.com\/ionic-team\/capacitor-swift-pm\.git",\s*exact:\s*"8\.[0-9]+\.[0-9]+"/g, 'url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.0"');
      fs.writeFileSync(pkgSwift, c, 'utf8');
      console.log(`✅ Pinned capacitor-swift-pm 8.5.0 in ${pkgSwift}`);
    }
  }
}
