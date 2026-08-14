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

  // Pin capacitor-swift-pm to 8.5.0
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
  console.log('✅ Successfully patched ios/App/CapApp-SPM/Package.swift');
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

// Shared helper code for UIColor and PluginConfig
const swiftSPMExtensions = `
import Capacitor
import UIKit

public extension CapacitorExtensionTypeWrapper where T: UIColor {
    static func color(fromHex: String) -> UIColor? {
        let hexString = fromHex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        var argb: UInt64 = 0
        guard Scanner(string: hexString).scanHexInt64(&argb) else { return nil }
        if hexString.count == 6 {
            return T(
                red: CGFloat((argb & 0xFF0000) >> 16) / 255.0,
                green: CGFloat((argb & 0x00FF00) >> 8) / 255.0,
                blue: CGFloat(argb & 0x0000FF) / 255.0,
                alpha: 1.0
            )
        } else if hexString.count == 8 {
            return T(
                red: CGFloat((argb & 0xFF000000) >> 24) / 255.0,
                green: CGFloat((argb & 0x00FF0000) >> 16) / 255.0,
                blue: CGFloat((argb & 0x0000FF00) >> 8) / 255.0,
                alpha: CGFloat(argb & 0x000000FF) / 255.0
            )
        }
        return nil
    }
}

extension PluginConfig {
    public func getString(_ key: String, _ defaultValue: String? = nil) -> String? {
        return (self.getValue(key) as? String) ?? defaultValue
    }
}
`;

// 3. Patch @capacitor/status-bar
const statusBarColorSwift = path.resolve('node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/UIColor.swift');
if (fs.existsSync(statusBarColorSwift)) {
  fs.writeFileSync(statusBarColorSwift, swiftSPMExtensions, 'utf8');
  console.log('✅ Patched StatusBarPlugin UIColor.swift');
}

const statusBarSwift = path.resolve('node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift');
if (fs.existsSync(statusBarSwift)) {
  let c = fs.readFileSync(statusBarSwift, 'utf8');
  c = c.replace(/bridge\.webView/g, '((bridge as AnyObject).webView as? WKWebView)');
  c = c.replace(/bridge\.viewController/g, '((bridge as AnyObject).viewController as? UIViewController)');
  fs.writeFileSync(statusBarSwift, c, 'utf8');
  console.log('✅ Patched bridge access in StatusBar.swift');
}

// 4. Patch @capacitor/splash-screen
const splashScreenPluginSwift = path.resolve('node_modules/@capacitor/splash-screen/ios/Sources/SplashScreenPlugin/SplashScreenPlugin.swift');
if (fs.existsSync(splashScreenPluginSwift)) {
  let c = fs.readFileSync(splashScreenPluginSwift, 'utf8');
  c = c.replace(/bridge\?\.viewController\?\.view/g, '((bridge as AnyObject).viewController as? UIViewController)?.view');
  if (!c.includes('color(fromHex:')) {
    c += `\n${swiftSPMExtensions}\n`;
  }
  fs.writeFileSync(splashScreenPluginSwift, c, 'utf8');
  console.log('✅ Patched SplashScreenPlugin.swift');
}
