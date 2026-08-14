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

// 3. Patch @capacitor/status-bar
const statusBarColorSwift = path.resolve('node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/UIColor.swift');
if (fs.existsSync(statusBarColorSwift)) {
  const content = `import Capacitor
import UIKit

public extension UIColor {
    static func fromHex(_ hex: String) -> UIColor? {
        let hexString = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        var argb: UInt64 = 0
        guard Scanner(string: hexString).scanHexInt64(&argb) else { return nil }
        if hexString.count == 6 {
            return UIColor(
                red: CGFloat((argb & 0xFF0000) >> 16) / 255.0,
                green: CGFloat((argb & 0x00FF00) >> 8) / 255.0,
                blue: CGFloat(argb & 0x0000FF) / 255.0,
                alpha: 1.0
            )
        } else if hexString.count == 8 {
            return UIColor(
                red: CGFloat((argb & 0xFF000000) >> 24) / 255.0,
                green: CGFloat((argb & 0x00FF0000) >> 16) / 255.0,
                blue: CGFloat((argb & 0x0000FF00) >> 8) / 255.0,
                alpha: CGFloat(argb & 0x000000FF) / 255.0
            )
        }
        return nil
    }

    func toHex() -> String? {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        guard self.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return nil }
        if alpha == 1.0 {
            return String(format: "#%02lX%02lX%02lX", Int(round(red * 255)), Int(round(green * 255)), Int(round(blue * 255)))
        } else {
            return String(format: "#%02lX%02lX%02lX%02lX", Int(round(red * 255)), Int(round(green * 255)), Int(round(blue * 255)), Int(round(alpha * 255)))
        }
    }
}

public extension CapacitorExtensionTypeWrapper where T: UIColor {
    static func color(fromHex: String) -> UIColor? {
        return UIColor.fromHex(fromHex)
    }
    static func hex(fromColor: UIColor) -> String? {
        return fromColor.toHex()
    }
}
`;
  fs.writeFileSync(statusBarColorSwift, content, 'utf8');
  console.log('✅ Overwritten StatusBarPlugin UIColor.swift');
}

const statusBarSwift = path.resolve('node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift');
if (fs.existsSync(statusBarSwift)) {
  const content = `import Foundation
import Capacitor
import UIKit
import WebKit

public class StatusBar {

    private var bridge: CAPBridgeProtocol
    private var isOverlayingWebview = true
    private var backgroundColor = UIColor.black
    private var backgroundView: UIView?
    private var observers: [NSObjectProtocol] = []

    private var webView: WKWebView? {
        return (bridge as? NSObject)?.value(forKey: "webView") as? WKWebView
    }

    private var viewController: UIViewController? {
        return (bridge as? NSObject)?.value(forKey: "viewController") as? UIViewController
    }

    init(bridge: CAPBridgeProtocol, config: StatusBarConfig) {
        self.bridge = bridge
        setupObservers(with: config)
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    private func setupObservers(with config: StatusBarConfig) {
        observers.append(NotificationCenter.default.addObserver(forName: .capacitorViewDidAppear, object: .none, queue: .none) { [weak self] _ in
            self?.handleViewDidAppear(config: config)
        })
        observers.append(NotificationCenter.default.addObserver(forName: .capacitorStatusBarTapped, object: .none, queue: .none) { [weak self] _ in
            self?.bridge.triggerJSEvent(eventName: "statusTap", target: "window")
        })
        observers.append(NotificationCenter.default.addObserver(forName: .capacitorViewWillTransition, object: .none, queue: .none) { [weak self] _ in
            self?.handleViewWillTransition()
        })
    }

    private func handleViewDidAppear(config: StatusBarConfig) {
        setStyle(config.style)
        setBackgroundColor(config.backgroundColor)
        setOverlaysWebView(config.overlaysWebView)
    }

    private func handleViewWillTransition() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.resizeStatusBarBackgroundView()
            self?.resizeWebView()
        }
    }

    func setStyle(_ style: UIStatusBarStyle) {
        bridge.statusBarStyle = style
    }

    func setBackgroundColor(_ color: UIColor) {
        backgroundColor = color
        backgroundView?.backgroundColor = color
    }

    func setAnimation(_ animation: String) {
        if animation == "SLIDE" {
            bridge.statusBarAnimation = .slide
        } else if animation == "NONE" {
            bridge.statusBarAnimation = .none
        } else {
            bridge.statusBarAnimation = .fade
        }
    }

    func hide(animation: String) {
        setAnimation(animation)
        if bridge.statusBarVisible {
            bridge.statusBarVisible = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.resizeWebView()
                self?.backgroundView?.removeFromSuperview()
                self?.backgroundView?.isHidden = true
            }
        }
    }

    func show(animation: String) {
        setAnimation(animation)
        if !bridge.statusBarVisible {
            bridge.statusBarVisible = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [self] in
                resizeWebView()
                if !isOverlayingWebview {
                    resizeStatusBarBackgroundView()
                    webView?.superview?.addSubview(backgroundView!)
                }
                backgroundView?.isHidden = false
            }
        }
    }

    func getInfo() -> StatusBarInfo {
        let style: String
        switch bridge.statusBarStyle {
        case .default:
            style = "DEFAULT"
        case .lightContent:
            style = "DARK"
        case .darkContent:
            style = "LIGHT"
        @unknown default:
            style = "DEFAULT"
        }

        return StatusBarInfo(
            overlays: isOverlayingWebview,
            visible: bridge.statusBarVisible,
            style: style,
            color: backgroundColor.toHex(),
            height: getStatusBarFrame().size.height
        )
    }

    func setOverlaysWebView(_ overlay: Bool) {
        if overlay == isOverlayingWebview { return }
        isOverlayingWebview = overlay
        if overlay {
            backgroundView?.removeFromSuperview()
        } else {
            initializeBackgroundViewIfNeeded()
            webView?.superview?.addSubview(backgroundView!)
        }
        resizeWebView()
    }

    private func resizeWebView() {
        let bounds: CGRect? = viewController?.view.window?.windowScene?.keyWindow?.bounds

        guard
            let webView = webView,
            let bounds = bounds
        else { return }
        viewController?.view.frame = bounds
        webView.frame = bounds
        let statusBarHeight = getStatusBarFrame().size.height
        var webViewFrame = webView.frame

        if isOverlayingWebview {
            let safeAreaTop = webView.safeAreaInsets.top
            if statusBarHeight >= safeAreaTop && safeAreaTop > 0 {
                webViewFrame.origin.y = safeAreaTop == 40 ? 20 : statusBarHeight - safeAreaTop
            } else {
                webViewFrame.origin.y = 0
            }
        } else {
            webViewFrame.origin.y = statusBarHeight
        }
        webViewFrame.size.height -= webViewFrame.origin.y
        webView.frame = webViewFrame
    }

    private func resizeStatusBarBackgroundView() {
        backgroundView?.frame = getStatusBarFrame()
    }

    private func getStatusBarFrame() -> CGRect {
        return viewController?.view.window?.windowScene?.statusBarManager?.statusBarFrame ?? .zero
    }

    private func initializeBackgroundViewIfNeeded() {
        if backgroundView == nil {
            backgroundView = UIView(frame: getStatusBarFrame())
            backgroundView!.backgroundColor = backgroundColor
            backgroundView!.autoresizingMask = [.flexibleWidth, .flexibleBottomMargin]
            backgroundView!.isHidden = !bridge.statusBarVisible
        }
    }
}
`;
  fs.writeFileSync(statusBarSwift, content, 'utf8');
  console.log('✅ Overwritten StatusBar.swift');
}

const statusBarPluginSwift = path.resolve('node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBarPlugin.swift');
if (fs.existsSync(statusBarPluginSwift)) {
  const content = `import Foundation
import Capacitor
import UIKit

@objc(StatusBarPlugin)
public class StatusBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StatusBarPlugin"
    public let jsName = "StatusBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackgroundColor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOverlaysWebView", returnType: CAPPluginReturnPromise)
    ]
    private var statusBar: StatusBar?

    override public func load() {
        guard let bridge = bridge else { return }
        statusBar = StatusBar(bridge: bridge, config: statusBarConfig())
    }

    private func statusBarConfig() -> StatusBarConfig {
        var config = StatusBarConfig()
        let rawConfig = (getConfig().value(forKey: "config") as? [String: Any]) ?? [:]
        if let overlays = rawConfig["overlaysWebView"] as? Bool {
            config.overlaysWebView = overlays
        }
        if let colorConfig = rawConfig["backgroundColor"] as? String, let color = UIColor.fromHex(colorConfig) {
            config.backgroundColor = color
        }
        if let configStyle = rawConfig["style"] as? String {
            config.style = style(fromString: configStyle)
        }
        return config
    }

    private func style(fromString: String) -> UIStatusBarStyle {
        switch fromString.lowercased() {
        case "dark", "lightcontent":
            return .lightContent
        case "light", "darkcontent":
            return .darkContent
        case "default":
            return .default
        default:
            return .default
        }
    }

    @objc public func setStyle(_ call: CAPPluginCall) {
        let style = call.getString("style", "DEFAULT")
        statusBar?.setStyle(self.style(fromString: style))
        call.resolve()
    }

    @objc public func setBackgroundColor(_ call: CAPPluginCall) {
        let color = call.getString("color", "")
        guard !color.isEmpty, let hexColor = UIColor.fromHex(color) else {
            call.unavailable("Color is missing or invalid")
            return
        }
        statusBar?.setBackgroundColor(hexColor)
        call.resolve()
    }

    @objc public func hide(_ call: CAPPluginCall) {
        let animation = call.getString("animation", "FADE")
        statusBar?.hide(animation: animation)
        call.resolve()
    }

    @objc public func show(_ call: CAPPluginCall) {
        let animation = call.getString("animation", "FADE")
        statusBar?.show(animation: animation)
        call.resolve()
    }

    @objc public func getInfo(_ call: CAPPluginCall) {
        if let info = statusBar?.getInfo() {
            call.resolve([
                "overlays": info.overlays,
                "visible": info.visible,
                "style": info.style,
                "color": info.color ?? "",
                "height": info.height
            ])
        } else {
            call.unavailable("Status bar not initialized")
        }
    }

    @objc public func setOverlaysWebView(_ call: CAPPluginCall) {
        let overlay = call.getBool("overlay", false)
        statusBar?.setOverlaysWebView(overlay)
        call.resolve()
    }
}
`;
  fs.writeFileSync(statusBarPluginSwift, content, 'utf8');
  console.log('✅ Overwritten StatusBarPlugin.swift');
}

// 4. Patch @capacitor/splash-screen
const splashScreenPluginSwift = path.resolve('node_modules/@capacitor/splash-screen/ios/Sources/SplashScreenPlugin/SplashScreenPlugin.swift');
if (fs.existsSync(splashScreenPluginSwift)) {
  const content = `import Foundation
import Capacitor
import UIKit

public extension UIColor {
    static func fromHex(_ hex: String) -> UIColor? {
        let hexString = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        var argb: UInt64 = 0
        guard Scanner(string: hexString).scanHexInt64(&argb) else { return nil }
        if hexString.count == 6 {
            return UIColor(
                red: CGFloat((argb & 0xFF0000) >> 16) / 255.0,
                green: CGFloat((argb & 0x00FF00) >> 8) / 255.0,
                blue: CGFloat(argb & 0x0000FF) / 255.0,
                alpha: 1.0
            )
        } else if hexString.count == 8 {
            return UIColor(
                red: CGFloat((argb & 0xFF000000) >> 24) / 255.0,
                green: CGFloat((argb & 0x00FF0000) >> 16) / 255.0,
                blue: CGFloat((argb & 0x0000FF00) >> 8) / 255.0,
                alpha: CGFloat(argb & 0x000000FF) / 255.0
            )
        }
        return nil
    }
}

@objc(SplashScreenPlugin)
public class SplashScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SplashScreenPlugin"
    public let jsName = "SplashScreen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise)
    ]
    private var splashScreen: SplashScreen?

    private var targetView: UIView? {
        if let vc = (self.bridge as? NSObject)?.value(forKey: "viewController") as? UIViewController {
            return vc.view
        }
        return (self.bridge as? NSObject)?.value(forKey: "webView") as? UIView
    }

    override public func load() {
        if let view = targetView {
            splashScreen = SplashScreen(parentView: view, config: splashScreenConfig())
            splashScreen?.showOnLaunch()
        }
    }

    // Show the splash screen
    @objc public func show(_ call: CAPPluginCall) {
        if let splash = splashScreen {
            let settings = splashScreenSettings(from: call)
            splash.show(settings: settings,
                        completion: {
                            call.resolve()
                        })
        } else {
            call.unavailable("Unable to show Splash Screen")
        }
    }

    // Hide the splash screen
    @objc public func hide(_ call: CAPPluginCall) {
        if let splash = splashScreen {
            let settings = splashScreenSettings(from: call)
            splash.hide(settings: settings)
            call.resolve()
        } else {
            call.unavailable("Unable to hide Splash Screen")
        }
    }

    private func splashScreenSettings(from call: CAPPluginCall) -> SplashScreenSettings {
        var settings = SplashScreenSettings()

        settings.showDuration = call.getInt("showDuration", settings.showDuration)
        settings.fadeInDuration = call.getInt("fadeInDuration", settings.fadeInDuration)
        settings.fadeOutDuration = call.getInt("fadeOutDuration", settings.fadeOutDuration)
        settings.autoHide = call.getBool("autoHide", settings.autoHide)
        return settings
    }

    private func splashScreenConfig() -> SplashScreenConfig {
        var config = SplashScreenConfig()
        let rawConfig = (getConfig().value(forKey: "config") as? [String: Any]) ?? [:]

        if let backgroundColor = rawConfig["backgroundColor"] as? String, let color = UIColor.fromHex(backgroundColor) {
            config.backgroundColor = color
        }
        if let spinnerStyle = rawConfig["iosSpinnerStyle"] as? String {
            switch spinnerStyle.lowercased() {
            case "small":
                config.spinnerStyle = .medium
            default:
                config.spinnerStyle = .large
            }
        }
        if let spinnerColor = rawConfig["spinnerColor"] as? String, let color = UIColor.fromHex(spinnerColor) {
            config.spinnerColor = color
        }
        if let showSpinner = rawConfig["showSpinner"] as? Bool {
            config.showSpinner = showSpinner
        }
        if let launchShowDuration = (rawConfig["launchShowDuration"] as? NSNumber)?.intValue {
            config.launchShowDuration = launchShowDuration
        }
        if let launchAutoHide = rawConfig["launchAutoHide"] as? Bool {
            config.launchAutoHide = launchAutoHide
        }
        return config
    }
}
`;
  fs.writeFileSync(splashScreenPluginSwift, content, 'utf8');
  console.log('✅ Overwritten SplashScreenPlugin.swift');
}
