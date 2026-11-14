import fs from "fs";
import path from "path";

/*
 * capacitor-swift-pm pinning (repair; supersedes the old 8.5.0 rewrite)
 * ---------------------------------------------------------------------
 * The previous version of this script rewrote the CLI-generated app
 * aggregator and EVERY plugin manifest to `exact: "8.5.0"`, justified by the
 * claim that @capacitor/push-notifications 8.1.2 ships an exact 8.5.0 pin.
 * That claim is false. Byte-identical Package.swift
 * (sha256 098e90d1...) measured from this install, the partner install and the
 * public 8.1.2 tarball all declare:
 *
 *     .package(url: ".../capacitor-swift-pm.git", from: "8.0.0")
 *
 * Every plugin constraint is `from: "8.0.0"` — a range that already admits the
 * installed 8.6.0 runtime. So the blanket rewrite was not only unnecessary, it
 * DOWNGRADED the native runtime to 8.5.0 while @capacitor/ios and the CLI were
 * newer, and it mutated node_modules in a way no lockfile records.
 *
 * This script therefore never rewrites a plugin manifest. It requires a
 * matched core/cli/ios graph and validates, read-only, that the app pin and
 * every plugin constraint admit the installed @capacitor/ios — failing closed
 * BEFORE any write on a conflicting exact pin or a from:/different major.
 *
 * `npx cap sync ios` regenerates the app aggregator pin, so a stale pin means
 * "sync first", never "hand-edit". Cross-range forcing is out of scope.
 */

// 1. Validate the app SPM aggregator against the installed native graph.
//
// This step is read-only for capacitor-swift-pm. The only edit it still makes
// is the deployment-target normalisation that other reviewed tooling expects.
const SPM_RELATIVE = "ios/App/CapApp-SPM/Package.swift";
const spmFile = path.resolve(SPM_RELATIVE);

/**
 * Read an installed package version, or null when the package is absent.
 * A missing package is a hard error for the callers below: silently skipping
 * would let the script "pass" on an uninstalled or misconfigured tree.
 */
function installedVersion(name) {
  const manifest = path.resolve("node_modules", name, "package.json");
  if (!fs.existsSync(manifest)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifest, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

/** Parse `major.minor.patch` and keep the prerelease flag. */
function parseVersion(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
    raw: value.trim(),
  };
}

/**
 * The installed native graph must be internally consistent before any pin is
 * compared: core, cli and ios must agree, and ios must be a stable triple.
 * Returns the parsed ios version used as the SPM target.
 */
function requireMatchedNativeGraph() {
  const core = installedVersion("@capacitor/core");
  const cli = installedVersion("@capacitor/cli");
  const ios = installedVersion("@capacitor/ios");
  const missing = Object.entries({ "@capacitor/core": core, "@capacitor/cli": cli, "@capacitor/ios": ios })
    .filter(([, version]) => !version)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `cannot pin capacitor-swift-pm: ${missing.join(", ")} not installed. ` +
        `Install the native graph before running this script.`,
    );
  }
  if (core !== ios || cli !== ios) {
    throw new Error(
      `mismatched native graph: @capacitor/core ${core}, @capacitor/cli ${cli}, ` +
        `@capacitor/ios ${ios}. Align them (same version) before pinning SPM.`,
    );
  }
  const parsed = parseVersion(ios);
  if (!parsed) throw new Error(`@capacitor/ios ${ios} is not a stable version`);
  if (parsed.prerelease) {
    throw new Error(`@capacitor/ios ${ios} is a prerelease; refusing to pin SPM to it`);
  }
  return parsed;
}

/** `A.B.C` textual comparison used only for `from:` lower bounds. */
function compareTriples(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Validate one `capacitor-swift-pm` requirement against the target version.
 * `from: X` admits anything >= X in the same major, so it passes when the
 * target is >= X and shares the major. `exact: X` must equal the target.
 * Anything else fails closed.
 */
function validateRequirement(kind, version, target, origin) {
  const parsed = parseVersion(version);
  if (!parsed) throw new Error(`${origin}: unparseable capacitor-swift-pm version "${version}"`);
  if (parsed.prerelease) {
    throw new Error(`${origin}: prerelease capacitor-swift-pm pin "${version}" is not supported`);
  }

  if (kind === "exact") {
    if (compareTriples(parsed, target) !== 0) {
      throw new Error(
        `${origin}: exact capacitor-swift-pm pin "${version}" conflicts with the installed ` +
          `@capacitor/ios ${target.raw}. Run "npx cap sync ios" to regenerate, or align the plugin.`,
      );
    }
    return;
  }

  if (kind === "from") {
    if (parsed.major !== target.major) {
      throw new Error(
        `${origin}: capacitor-swift-pm from: "${version}" is a different major than the ` +
          `installed @capacitor/ios ${target.raw}. This script will not force a cross-range upgrade.`,
      );
    }
    if (compareTriples(parsed, target) > 0) {
      throw new Error(
        `${origin}: capacitor-swift-pm from: "${version}" requires a version above the ` +
          `installed @capacitor/ios ${target.raw}. Upgrade the native graph instead of forcing a pin.`,
      );
    }
    return;
  }

  throw new Error(`${origin}: unrecognised capacitor-swift-pm requirement (${kind})`);
}

/** The only URL this script treats as the official Capacitor SPM package. */
const OFFICIAL_SWIFT_PM_URL = "https://github.com/ionic-team/capacitor-swift-pm.git";

/**
 * Match a requirement on exactly the official Capacitor SPM URL.
 *
 * A basename match is not enough: a URL like
 * `https://example.invalid/attacker/capacitor-swift-pm.git` ends the same way
 * and must not be mistaken for the real pin. The supported forms are the
 * literal ones Capacitor and its plugins emit:
 *
 *   .package(url: "<official>", exact: "8.6.0")
 *   .package(url: "<official>", from: "8.0.0")
 *
 * Any other requirement syntax for that URL fails closed rather than being
 * guessed at. No Swift parser is involved — only these literal shapes.
 */
function findOfficialRequirements(text, origin) {
  // Any mention of the official URL, with whatever follows it.
  const mentions = [
    ...text.matchAll(/\.package\(\s*url:\s*"([^"]+)"\s*,\s*([^)]*)\)/g),
  ].filter((match) => match[1] === OFFICIAL_SWIFT_PM_URL);

  if (mentions.length === 0) {
    // Distinguish "wrong URL that merely looks like ours" from "absent".
    if (/capacitor-swift-pm\.git/.test(text)) {
      throw new Error(
        `${origin}: only "${OFFICIAL_SWIFT_PM_URL}" counts as the Capacitor SPM pin; ` +
          `a different URL ending in capacitor-swift-pm.git is not official.`,
      );
    }
    throw new Error(`${origin}: no capacitor-swift-pm requirement found`);
  }

  if (mentions.length > 1) {
    throw new Error(
      `${origin}: ${mentions.length} capacitor-swift-pm requirements found; exactly one is ` +
        `supported (ambiguous pin).`,
    );
  }

  const [, , requirement] = mentions[0];
  const parsed = /^\s*(exact|from)\s*:\s*"([^"]+)"\s*$/.exec(requirement);
  if (!parsed) {
    throw new Error(
      `${origin}: unsupported capacitor-swift-pm requirement syntax "${requirement.trim()}". ` +
        `Only exact: "X.Y.Z" and from: "X.Y.Z" are supported.`,
    );
  }
  return { kind: parsed[1], version: parsed[2] };
}

const target = requireMatchedNativeGraph();

if (!fs.existsSync(spmFile)) {
  console.error(`❌ SPM file not found at ${spmFile}`);
  process.exit(1);
}

const aggregatorText = fs.readFileSync(spmFile, "utf8");
// The aggregator is CLI-generated and pins `exact:` to the installed platform.
// A mismatch means the tree is stale — never hand-edit it here: `npx cap sync
// ios` regenerates it. Validating before any write keeps a stale tree intact.
// `findOfficialRequirements` also covers "dependency went missing", a look-alike
// URL and an ambiguous duplicate.
const aggregatorRequirement = findOfficialRequirements(aggregatorText, SPM_RELATIVE);
// A `from:` here would let the native SDK float past the tested 8.6.0, so the
// app aggregator must pin exactly. Only plugins legitimately declare ranges.
if (aggregatorRequirement.kind !== "exact") {
  throw new Error(
    `${SPM_RELATIVE}: aggregator must pin exact: "${target.raw}" (capacitor-swift-pm), ` +
      `found ${aggregatorRequirement.kind}: "${aggregatorRequirement.version}". ` +
      `Run "npx cap sync ios" — the CLI writes an exact pin.`,
  );
}
validateRequirement(
  aggregatorRequirement.kind,
  aggregatorRequirement.version,
  target,
  SPM_RELATIVE,
);

// Deployment target normalisation is deferred until every constraint has been
// validated, so a conflicting pin cannot leave a half-written tree behind.
const normalisedAggregator = aggregatorText.replace(/\.iOS\(\.v15\)/g, ".iOS(.v16)");

// 2. Validate every installed plugin manifest read-only.
//
// The old blanket rewrite is gone. Ordinary `from: "8.0.0"` already admits the
// installed runtime, and rewriting it to a fixed `exact:` was a downgrade.
// Nothing in node_modules is written; a conflicting constraint fails closed
// before any vendor file could be touched.
const pluginRoots = [
  path.resolve("node_modules/@capacitor"),
  path.resolve("node_modules/@aparajita"),
  path.resolve("node_modules/@capacitor-firebase"),
];

// The app may also vendor app-check at a fixed local alias path. It is a real
// graph member when present, so it is validated like any other manifest; when
// absent it is simply not configured yet and is not an error. The path is a
// fixed known project location, never derived from untrusted input.
const LOCAL_ALIAS_MANIFEST = path.resolve(
  "ios/App/LocalPackages/capacitor-firebase-app-check/Package.swift",
);

let validatedManifests = 0;
for (const baseDir of pluginRoots) {
  if (!fs.existsSync(baseDir)) continue;
  for (const pkg of fs.readdirSync(baseDir)) {
    const pkgSwift = path.join(baseDir, pkg, "Package.swift");
    if (!fs.existsSync(pkgSwift)) continue;
    const origin = path.relative(process.cwd(), pkgSwift).replace(/\\/g, "/");
    const requirement = findOfficialRequirements(fs.readFileSync(pkgSwift, "utf8"), origin);
    validateRequirement(requirement.kind, requirement.version, target, origin);
    validatedManifests += 1;
  }
}

if (fs.existsSync(LOCAL_ALIAS_MANIFEST)) {
  const origin = path.relative(process.cwd(), LOCAL_ALIAS_MANIFEST).replace(/\\/g, "/");
  const requirement = findOfficialRequirements(fs.readFileSync(LOCAL_ALIAS_MANIFEST, "utf8"), origin);
  validateRequirement(requirement.kind, requirement.version, target, origin);
  validatedManifests += 1;
}

// 3. Every constraint is compatible — only now may anything be written.
if (normalisedAggregator !== aggregatorText) {
  fs.writeFileSync(spmFile, normalisedAggregator, "utf8");
  console.log("✅ Set CapApp-SPM deployment target to iOS 16.0");
} else {
  console.log("✅ CapApp-SPM deployment target already iOS 16.0");
}

console.log(
  `✅ Validated ${validatedManifests} plugin manifest(s) against @capacitor/ios ${target.raw} ` +
    `(capacitor-swift-pm; no vendor files modified)`,
);

// 3. Patch @capacitor/status-bar
const statusBarColorSwift = path.resolve(
  "node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/UIColor.swift",
);
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
            return String(format: "#%02lX%02lX%02lX", Int(round(red * 255)), Int(round(green * 255)), Int(round(blue * 255)), Int(round(alpha * 255)))
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
  fs.writeFileSync(statusBarColorSwift, content, "utf8");
  console.log("✅ Overwritten StatusBarPlugin UIColor.swift");
}

const statusBarSwift = path.resolve(
  "node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift",
);
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
  fs.writeFileSync(statusBarSwift, content, "utf8");
  console.log("✅ Overwritten StatusBar.swift");
}

const statusBarPluginSwift = path.resolve(
  "node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBarPlugin.swift",
);
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
        // PluginConfig.config is private in @capacitor/ios, so KVC on it raises
        // NSUnknownKeyException at launch (CI run 41560001406). Read through the
        // public typed getters instead and let StatusBarConfig supply defaults.
        var config = StatusBarConfig()
        config.overlaysWebView = getConfig().getBoolean("overlaysWebView", config.overlaysWebView)
        if let colorConfig = getConfig().getString("backgroundColor"), let color = UIColor.fromHex(colorConfig) {
            config.backgroundColor = color
        }
        if let configStyle = getConfig().getString("style") {
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
  fs.writeFileSync(statusBarPluginSwift, content, "utf8");
  console.log("✅ Overwritten StatusBarPlugin.swift");
}

// 4. Patch @capacitor/splash-screen
const splashScreenPluginSwift = path.resolve(
  "node_modules/@capacitor/splash-screen/ios/Sources/SplashScreenPlugin/SplashScreenPlugin.swift",
);
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
        // PluginConfig.config is private in @capacitor/ios, so KVC on it raises
        // NSUnknownKeyException at launch (CI run 41560001406, this function).
        // Use the public typed getters; every default stays in SplashScreenConfig.
        var config = SplashScreenConfig()

        if let backgroundColor = getConfig().getString("backgroundColor"), let color = UIColor.fromHex(backgroundColor) {
            config.backgroundColor = color
        }
        if let spinnerStyle = getConfig().getString("iosSpinnerStyle") {
            switch spinnerStyle.lowercased() {
            case "small":
                config.spinnerStyle = .medium
            default:
                config.spinnerStyle = .large
            }
        }
        if let spinnerColor = getConfig().getString("spinnerColor"), let color = UIColor.fromHex(spinnerColor) {
            config.spinnerColor = color
        }
        config.showSpinner = getConfig().getBoolean("showSpinner", config.showSpinner)
        config.launchShowDuration = getConfig().getInt("launchShowDuration", config.launchShowDuration)
        config.launchAutoHide = getConfig().getBoolean("launchAutoHide", config.launchAutoHide)
        return config
    }
}
`;
  fs.writeFileSync(splashScreenPluginSwift, content, "utf8");
  console.log("✅ Overwritten SplashScreenPlugin.swift");
}

// 5. Patch @capacitor/push-notifications
const pushHandlerSwift = path.resolve(
  "node_modules/@capacitor/push-notifications/ios/Sources/PushNotificationsPlugin/PushNotificationsHandler.swift",
);
if (fs.existsSync(pushHandlerSwift)) {
  const content = `import Capacitor
import UserNotifications

public class PushNotificationsHandler: NSObject, NotificationHandlerProtocol {
    public weak var plugin: CAPPlugin?
    var notificationRequestLookup = [String: JSObject]()

    public func requestPermissions(with completion: ((Bool, Error?) -> Void)? = nil) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            completion?(granted, error)
        }
    }

    public func checkPermissions(with completion: ((UNAuthorizationStatus) -> Void)? = nil) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            completion?(settings.authorizationStatus)
        }
    }

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        let notificationData = makeNotificationRequestJSObject(notification.request)
        self.plugin?.notifyListeners("pushNotificationReceived", data: notificationData)

        if let options = notificationRequestLookup[notification.request.identifier] {
            let silent = options["silent"] as? Bool ?? false

            if silent {
                return UNNotificationPresentationOptions.init(rawValue: 0)
            }
        }

        // PluginConfig.config is private in @capacitor/ios, so KVC on it raises
        // NSUnknownKeyException (CI run 41560001406). getArray is the public
        // typed accessor for a JS array of strings.
        if let optionsArray = self.plugin?.getConfig().getArray("presentationOptions") as? [String] {
            var presentationOptions = UNNotificationPresentationOptions.init()

            optionsArray.forEach { option in
                switch option {
                case "banner":
                    presentationOptions.insert(.banner)
                case "list":
                    presentationOptions.insert(.list)
                case "alert":
                    presentationOptions.insert(.banner)
                    presentationOptions.insert(.list)
                case "badge":
                    presentationOptions.insert(.badge)
                case "sound":
                    presentationOptions.insert(.sound)
                default:
                    print("Unrecognized presentation option: \\(option)")
                }
            }

            return presentationOptions
        }

        return []
    }

    public func didReceive(response: UNNotificationResponse) {
        var data = JSObject()

        let originalNotificationRequest = response.notification.request
        let actionId = response.actionIdentifier

        if actionId == UNNotificationDefaultActionIdentifier {
            data["actionId"] = "tap"
        } else if actionId == UNNotificationDismissActionIdentifier {
            data["actionId"] = "dismiss"
        } else {
            data["actionId"] = actionId
        }

        if let inputType = response as? UNTextInputNotificationResponse {
            data["inputValue"] = inputType.userText
        }

        data["notification"] = makeNotificationRequestJSObject(originalNotificationRequest)

        self.plugin?.notifyListeners("pushNotificationActionPerformed", data: data, retainUntilConsumed: true)
    }

    func makeNotificationRequestJSObject(_ request: UNNotificationRequest) -> JSObject {
        return [
            "id": request.identifier,
            "title": request.content.title,
            "subtitle": request.content.subtitle,
            "badge": request.content.badge ?? 1,
            "body": request.content.body,
            "data": (request.content.userInfo as? JSObject) ?? [:]
        ]
    }
}
`;
  fs.writeFileSync(pushHandlerSwift, content, "utf8");
  console.log("✅ Overwritten PushNotificationsHandler.swift");
}

const pushPluginSwift = path.resolve(
  "node_modules/@capacitor/push-notifications/ios/Sources/PushNotificationsPlugin/PushNotificationsPlugin.swift",
);
if (fs.existsSync(pushPluginSwift)) {
  const content = `import Foundation
import Capacitor
import UserNotifications

enum PushNotificationError: Error {
    case tokenParsingFailed
    case tokenRegistrationFailed
}

enum PushNotificationsPermissions: String {
    case prompt
    case denied
    case granted
}

@objc(PushNotificationsPlugin)
public class PushNotificationsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PushNotificationsPlugin"
    public let jsName = "PushNotifications"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unregister", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDeliveredNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeAllDeliveredNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeDeliveredNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createChannel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listChannels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteChannel", returnType: CAPPluginReturnPromise)
    ]
    private let notificationDelegateHandler = PushNotificationsHandler()
    private var appDelegateRegistrationCalled: Bool = false

    override public func load() {
        self.bridge?.notificationRouter.pushNotificationHandler = self.notificationDelegateHandler
        self.notificationDelegateHandler.plugin = self

        NotificationCenter.default.addObserver(self,
                                               selector: #selector(self.didRegisterForRemoteNotificationsWithDeviceToken(notification:)),
                                               name: .capacitorDidRegisterForRemoteNotifications,
                                               object: nil)

        NotificationCenter.default.addObserver(self,
                                               selector: #selector(self.didFailToRegisterForRemoteNotificationsWithError(notification:)),
                                               name: .capacitorDidFailToRegisterForRemoteNotifications,
                                               object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func register(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
        call.resolve()
    }

    @objc func unregister(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.unregisterForRemoteNotifications()
            call.resolve()
        }
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        self.notificationDelegateHandler.requestPermissions { granted, error in
            guard error == nil else {
                if let err = error {
                    call.unavailable(err.localizedDescription)
                    return
                }

                call.unavailable("unknown error in permissions request")
                return
            }

            var result: PushNotificationsPermissions = .denied

            if granted {
                result = .granted
            }

            call.resolve(["receive": result.rawValue])
        }
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        self.notificationDelegateHandler.checkPermissions { status in
            var result: PushNotificationsPermissions = .prompt

            switch status {
            case .notDetermined:
                result = .prompt
            case .denied:
                result = .prompt
            case .ephemeral, .authorized, .provisional:
                result = .granted
            @unknown default:
                result = .prompt
            }

            call.resolve(["receive": result.rawValue])
        }
    }

    @objc func getDeliveredNotifications(_ call: CAPPluginCall) {
        if !appDelegateRegistrationCalled {
            call.unavailable("event capacitorDidRegisterForRemoteNotifications not called. Visit https://capacitorjs.com/docs/apis/push-notifications for more information")
            return
        }
        UNUserNotificationCenter.current().getDeliveredNotifications(completionHandler: { (notifications) in
            let ret = notifications.map({ (notification) -> [String: Any] in
                return self.notificationDelegateHandler.makeNotificationRequestJSObject(notification.request)
            })
            call.resolve([
                "notifications": ret
            ])
        })
    }

    @objc func removeDeliveredNotifications(_ call: CAPPluginCall) {
        if !appDelegateRegistrationCalled {
            call.unavailable("event capacitorDidRegisterForRemoteNotifications not called. Visit https://capacitorjs.com/docs/apis/push-notifications for more information")
            return
        }
        guard let notifications = (call.options["notifications"] as? [JSObject]) ?? (call.options["notifications"] as? [[String: Any]]) else {
            call.unavailable("Must supply notifications to remove")
            return
        }

        let ids = notifications.map { $0["id"] as? String ?? "" }
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
        call.resolve()
    }

    @objc func removeAllDeliveredNotifications(_ call: CAPPluginCall) {
        if !appDelegateRegistrationCalled {
            call.unavailable("event capacitorDidRegisterForRemoteNotifications not called. Visit https://capacitorjs.com/docs/apis/push-notifications for more information")
            return
        }
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        DispatchQueue.main.async(execute: {
            UIApplication.shared.applicationIconBadgeNumber = 0
        })
        call.resolve()
    }

    @objc func createChannel(_ call: CAPPluginCall) {
        call.unimplemented("Not available on iOS")
    }

    @objc func deleteChannel(_ call: CAPPluginCall) {
        call.unimplemented("Not available on iOS")
    }

    @objc func listChannels(_ call: CAPPluginCall) {
        call.unimplemented("Not available on iOS")
    }

    @objc public func didRegisterForRemoteNotificationsWithDeviceToken(notification: NSNotification) {
        appDelegateRegistrationCalled = true
        if let deviceToken = notification.object as? Data {
            let deviceTokenString = deviceToken.reduce("", {$0 + String(format: "%02X", $1)})
            notifyListeners("registration", data: [
                "value": deviceTokenString
            ])
        } else if let stringToken = notification.object as? String {
            notifyListeners("registration", data: [
                "value": stringToken
            ])
        } else {
            notifyListeners("registrationError", data: [
                "error": PushNotificationError.tokenParsingFailed.localizedDescription
            ])
        }
    }

    @objc public func didFailToRegisterForRemoteNotificationsWithError(notification: NSNotification) {
        appDelegateRegistrationCalled = true
        guard let error = notification.object as? Error else {
            return
        }
        notifyListeners("registrationError", data: [
            "error": error.localizedDescription
        ])
    }
}
`;
  fs.writeFileSync(pushPluginSwift, content, "utf8");
  console.log("✅ Overwritten PushNotificationsPlugin.swift");
}

// 6. Patch @capacitor/preferences
const prefPluginSwift = path.resolve(
  "node_modules/@capacitor/preferences/ios/Sources/PreferencesPlugin/PreferencesPlugin.swift",
);
if (fs.existsSync(prefPluginSwift)) {
  const content = `import Foundation
import Capacitor

@objc(PreferencesPlugin)
public class PreferencesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PreferencesPlugin"
    public let jsName = "Preferences"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keys", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "migrate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeOld", returnType: CAPPluginReturnPromise)
    ]
    private var preferences = Preferences(with: PreferencesConfiguration())

    @objc func configure(_ call: CAPPluginCall) {
        let group = call.options["group"] as? String
        let configuration: PreferencesConfiguration

        if let group = group {
            if group == "NativeStorage" {
                configuration = PreferencesConfiguration(for: .cordovaNativeStorage)
            } else {
                configuration = PreferencesConfiguration(for: .named(group))
            }
        } else {
            configuration = PreferencesConfiguration()
        }

        preferences = Preferences(with: configuration)
        call.resolve()
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.options["key"] as? String else {
            call.unavailable("Must provide a key")
            return
        }

        let value = preferences.get(by: key)

        call.resolve([
            "value": value as Any
        ])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.options["key"] as? String else {
            call.unavailable("Must provide a key")
            return
        }
        let value = call.getString("value", "")

        preferences.set(value, for: key)
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.options["key"] as? String else {
            call.unavailable("Must provide a key")
            return
        }

        preferences.remove(by: key)
        call.resolve()
    }

    @objc func keys(_ call: CAPPluginCall) {
        let keys = preferences.keys()

        call.resolve([
            "keys": keys
        ])
    }

    @objc func clear(_ call: CAPPluginCall) {
        preferences.removeAll()
        call.resolve()
    }

    @objc func migrate(_ call: CAPPluginCall) {
        var migrated: [String] = []
        var existing: [String] = []
        let oldPrefix = "_cap_"
        let oldKeys = UserDefaults.standard.dictionaryRepresentation().keys.filter { $0.hasPrefix(oldPrefix) }

        for oldKey in oldKeys {
            let key = String(oldKey.dropFirst(oldPrefix.count))
            let value = UserDefaults.standard.string(forKey: oldKey) ?? ""
            let currentValue = preferences.get(by: key)

            if currentValue == nil {
                preferences.set(value, for: key)
                migrated.append(key)
            } else {
                existing.append(key)
            }
        }

        call.resolve([
            "migrated": migrated,
            "existing": existing
        ])
    }

    @objc func removeOld(_ call: CAPPluginCall) {
        let oldPrefix = "_cap_"
        let oldKeys = UserDefaults.standard.dictionaryRepresentation().keys.filter { $0.hasPrefix(oldPrefix) }
        for oldKey in oldKeys {
            UserDefaults.standard.removeObject(forKey: oldKey)
        }
        call.resolve()
    }
}
`;
  fs.writeFileSync(prefPluginSwift, content, "utf8");
  console.log("✅ Overwritten PreferencesPlugin.swift");
}

// 7. Patch @capacitor/app
const appPluginSwift = path.resolve(
  "node_modules/@capacitor/app/ios/Sources/AppPlugin/AppPlugin.swift",
);
if (fs.existsSync(appPluginSwift)) {
  const content = `import Foundation
import Capacitor

@objc(AppPlugin)
public class AppPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppPlugin"
    public let jsName = "App"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "exitApp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAppLanguage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLaunchUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "minimizeApp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "toggleBackButtonHandler", returnType: CAPPluginReturnPromise)
    ]
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(self.handleUrlOpened(notification:)), name: Notification.Name.capacitorOpenURL, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(self.handleUniversalLink(notification:)), name: Notification.Name.capacitorOpenUniversalLink, object: nil)
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: OperationQueue.main) { [weak self] (_) in
            self?.notifyListeners("appStateChange", data: [
                "isActive": true
            ])
        })
        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: OperationQueue.main) { [weak self] (_) in
            self?.notifyListeners("appStateChange", data: [
                "isActive": false
            ])
        })

        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: OperationQueue.main) { [weak self] (_) in
            self?.notifyListeners("pause", data: nil)
        })

        observers.append(NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: OperationQueue.main) { [weak self] (_) in
            self?.notifyListeners("resume", data: nil)
        })

    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    @objc func handleUrlOpened(notification: NSNotification) {
        guard let object = notification.object as? [String: Any?] else {
            return
        }

        notifyListeners("appUrlOpen", data: makeUrlOpenObject(object), retainUntilConsumed: true)
    }

    @objc func handleUniversalLink(notification: NSNotification) {
        guard let object = notification.object as? [String: Any?] else {
            return
        }

        notifyListeners("appUrlOpen", data: makeUrlOpenObject(object), retainUntilConsumed: true)
    }

    func makeUrlOpenObject(_ object: [String: Any?]) -> JSObject {
        guard let url = object["url"] as? NSURL else {
            return [:]
        }

        let options = object["options"] as? [String: Any?] ?? [:]
        return [
            "url": url.absoluteString ?? "",
            "iosSourceApplication": options[UIApplication.OpenURLOptionsKey.sourceApplication.rawValue] as? String ?? "",
            "iosOpenInPlace": options[UIApplication.OpenURLOptionsKey.openInPlace.rawValue] as? String ?? ""
        ]
    }

    @objc func exitApp(_ call: CAPPluginCall) {
        call.unimplemented()
    }

    @objc func getInfo(_ call: CAPPluginCall) {
        if let info = Bundle.main.infoDictionary {
            call.resolve([
                "name": info["CFBundleDisplayName"] as? String ?? "",
                "id": info["CFBundleIdentifier"] as? String ?? "",
                "build": info["CFBundleVersion"] as? String ?? "",
                "version": info["CFBundleShortVersionString"] as? String ?? ""
            ])
        } else {
            call.unavailable("Unable to get App Info")
        }

    }

    @objc func getLaunchUrl(_ call: CAPPluginCall) {
        if let lastUrl = ApplicationDelegateProxy.shared.lastURL {
            let urlValue = lastUrl.absoluteString
            call.resolve([
                "url": urlValue
            ])
        }
        call.resolve()
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "isActive": UIApplication.shared.applicationState == UIApplication.State.active
            ])
        }
    }

    @objc func minimizeApp(_ call: CAPPluginCall) {
        call.unimplemented()
    }

    @objc func getAppLanguage(_ call: CAPPluginCall) {
        call.resolve([
            "value": Bundle.main.preferredLocalizations.first
        ])
    }

    @objc func toggleBackButtonHandler(_ call: CAPPluginCall) {
        call.unimplemented()
    }
}
`;
  fs.writeFileSync(appPluginSwift, content, "utf8");
  console.log("✅ Overwritten AppPlugin.swift");
}

// 8. Patch @aparajita/capacitor-secure-storage
const keychainErrorSwift = path.resolve(
  "node_modules/@aparajita/capacitor-secure-storage/ios/Sources/SecureStoragePlugin/KeychainError.swift",
);
if (fs.existsSync(keychainErrorSwift)) {
  const content = `//
//  KeychainError.swift
//  @aparajita/capacitor-secure-storage
//

import Capacitor

public class KeychainError: Error {
  enum ErrorKind: String {
    case missingKey
    case invalidData
    case osError
    case unknownError
  }

  private static let errorMap: [KeychainError.ErrorKind: String] = [
    .missingKey: "Empty key",
    .invalidData: "The data is in an invalid format",
    .osError: "An OS error occurred (%d)",
    .unknownError: "An unknown error occurred"
  ]

  var message: String = ""
  var code: String = ""

  init(_ kind: ErrorKind) {
    _init(kind)
  }

  init(_ kind: ErrorKind, status: OSStatus) {
    _init(kind, status: status)
  }

  private func _init(_ kind: ErrorKind, status: OSStatus = 0) {
    if let message = KeychainError.errorMap[kind] {
      switch kind {
      case .osError:
        self.message = String(format: message, status)

      default:
        self.message = message
      }

      code = kind.rawValue
    }
  }

  public func rejectCall(_ call: CAPPluginCall) {
    call.unavailable("\\(code): \\(message)")
  }

  static func reject(call: CAPPluginCall, kind: ErrorKind, status: OSStatus = 0) {
    let err = KeychainError(kind, status: status)
    err.rejectCall(call)
  }
}
`;
  fs.writeFileSync(keychainErrorSwift, content, "utf8");
  console.log("✅ Overwritten KeychainError.swift");
}

const secureStoragePluginSwift = path.resolve(
  "node_modules/@aparajita/capacitor-secure-storage/ios/Sources/SecureStoragePlugin/Plugin.swift",
);
if (fs.existsSync(secureStoragePluginSwift)) {
  const content = `import Capacitor
import Foundation
import KeychainSwift

@objc(SecureStorage)
public class SecureStorage: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "SecureStorage"
  public let jsName = "SecureStorage"
  public let pluginMethods: [CAPPluginMethod] = [
    .init(#selector(setSynchronizeKeychain)),
    .init(#selector(internalSetItem)),
    .init(#selector(internalGetItem)),
    .init(#selector(internalRemoveItem)),
    .init(#selector(clearItemsWithPrefix)),
    .init(#selector(getPrefixedKeys))
  ]

  let kKeyOption = "prefixedKey"
  let kDataOption = "data"
  let kSyncOption = "sync"
  let kAccessOption = "access"
  let keychain = KeychainSwift()

  @objc func setSynchronizeKeychain(_ call: CAPPluginCall) {
    keychain.synchronizable = getSyncParam(from: call)
    call.resolve()
  }

  @objc func internalSetItem(_ call: CAPPluginCall) {
    guard let key = getKeyParam(from: call),
          let data = getDataParam(from: call) else {
      return
    }

    let access = getAccessParam(from: call)

    tryKeychainOp(call, getSyncParam(from: call)) {
      try storeData(data, withKey: key, access: access)
      call.resolve()
    }
  }

  @objc func internalGetItem(_ call: CAPPluginCall) {
    guard let key = getKeyParam(from: call) else {
      return
    }

    tryKeychainOp(call, getSyncParam(from: call)) {
      let data = getData(withKey: key)
      call.resolve(["data": data])
    }
  }

  @objc func internalRemoveItem(_ call: CAPPluginCall) {
    guard let key = getKeyParam(from: call) else {
      return
    }

    tryKeychainOp(call, getSyncParam(from: call)) {
      let success = try deleteData(withKey: key)
      call.resolve(["success": success])
    }
  }

  @objc func clearItemsWithPrefix(_ call: CAPPluginCall) {
    tryKeychainOp(call, getSyncParam(from: call)) {
      let prefix = (call.options["prefix"] as? String) ?? ""
      try clearData(withPrefix: prefix)
      call.resolve()
    }
  }

  @objc func getPrefixedKeys(_ call: CAPPluginCall) {
    tryKeychainOp(call, getSyncParam(from: call)) {
      let prefix = (call.options["prefix"] as? String) ?? ""
      call.resolve(["keys": keychain.allKeys.filter { $0.starts(with: prefix) }])
    }
  }

  func getKeyParam(from call: CAPPluginCall) -> String? {
    if let key = call.options[kKeyOption] as? String, !key.isEmpty {
      return key
    }

    KeychainError.reject(call: call, kind: .missingKey)
    return nil
  }

  func getDataParam(from call: CAPPluginCall) -> String? {
    if let value = call.options[kDataOption] as? String {
      return value
    }

    KeychainError.reject(call: call, kind: .invalidData)
    return nil
  }

  func getSyncParam(from call: CAPPluginCall) -> Bool {
    if let value = call.options[kSyncOption] as? Bool {
      return value
    }

    return keychain.synchronizable
  }

  func getAccessParam(from call: CAPPluginCall) -> KeychainSwiftAccessOptions? {
    if let value = (call.options[kAccessOption] as? NSNumber)?.intValue {
      switch value {
      case 0:
        return KeychainSwiftAccessOptions.accessibleWhenUnlocked

      case 1:
        return KeychainSwiftAccessOptions.accessibleWhenUnlockedThisDeviceOnly

      case 2:
        return KeychainSwiftAccessOptions.accessibleAfterFirstUnlock

      case 3:
        return KeychainSwiftAccessOptions.accessibleAfterFirstUnlockThisDeviceOnly

      case 4:
        return KeychainSwiftAccessOptions.accessibleWhenPasscodeSetThisDeviceOnly

      default:
        return nil
      }
    }

    return nil
  }

  func tryKeychainOp(_ call: CAPPluginCall, _ sync: Bool, _ operation: () throws -> Void) {
    var err: KeychainError?

    let saveSync = keychain.synchronizable
    keychain.synchronizable = sync

    do {
      try operation()
    } catch let error as KeychainError {
      err = error
    } catch {
      err = KeychainError(.unknownError)
    }

    keychain.synchronizable = saveSync

    if let err = err {
      err.rejectCall(call)
    }
  }

  func storeData(_ data: String, withKey key: String, access: KeychainSwiftAccessOptions?) throws {
    let success = keychain.set(data, forKey: key, withAccess: access)

    if !success {
      throw KeychainError(.osError, status: keychain.lastResultCode)
    }
  }

  func getData(withKey key: String) -> Any {
    keychain.get(key) as Any
  }

  func deleteData(withKey key: String) throws -> Bool {
    let success = keychain.delete(key)

    if !success && keychain.lastResultCode != 0 && keychain.lastResultCode != errSecItemNotFound {
      throw KeychainError(.osError, status: keychain.lastResultCode)
    }

    return success
  }

  func clearData(withPrefix prefix: String) throws {
    for key in keychain.allKeys where key.starts(with: prefix) {
      if !keychain.delete(key) {
        throw KeychainError(.osError, status: keychain.lastResultCode)
      }
    }
  }
}
`;
  fs.writeFileSync(secureStoragePluginSwift, content, "utf8");
  console.log("✅ Overwritten Plugin.swift");
}

// 9. Patch @capacitor/geolocation
const geolocationCallbackManagerSwift = path.resolve(
  "node_modules/@capacitor/geolocation/ios/Sources/GeolocationPlugin/GeolocationCallbackManager.swift",
);
if (fs.existsSync(geolocationCallbackManagerSwift)) {
  const content = `import Capacitor
import IONGeolocationLib

private enum GeolocationCallbackType {
    case requestPermissions
    case location
    case watch

    var shouldKeepCallback: Bool {
        self == .watch
    }

    var shouldClearAfterSending: Bool {
        self == .location || self == .requestPermissions
    }
}

private struct GeolocationCallbackGroup {
    let ids: [CAPPluginCall]
    let type: GeolocationCallbackType
}

final class GeolocationCallbackManager {
    private(set) var requestPermissionsCallbacks: [CAPPluginCall]
    private(set) var locationCallbacks: [CAPPluginCall]
    private(set) var watchCallbacks: [String: CAPPluginCall]
    private(set) var timeout: Int?
    private let capacitorBridge: CAPBridgeProtocol?

    private var allCallbackGroups: [GeolocationCallbackGroup] {
        [
            .init(ids: requestPermissionsCallbacks, type: .requestPermissions),
            .init(ids: locationCallbacks, type: .location),
            .init(ids: Array(watchCallbacks.values), type: .watch)
        ]
    }
    private var requestPermissionsCallbackGroup: GeolocationCallbackGroup? {
        allCallbackGroups.first { $0.type == .requestPermissions }
    }

    init(capacitorBridge: CAPBridgeProtocol?) {
        self.capacitorBridge = capacitorBridge
        self.requestPermissionsCallbacks = []
        self.locationCallbacks = []
        self.watchCallbacks = [:]
    }

    func addRequestPermissionsCallback(capacitorCall call: CAPPluginCall) {
        capacitorBridge?.saveCall(call)
        requestPermissionsCallbacks.append(call)
    }

    func addLocationCallback(capacitorCall call: CAPPluginCall) {
        capacitorBridge?.saveCall(call)
        locationCallbacks.append(call)
        let timeout = (call.options[Constants.Arguments.timeout] as? NSNumber)?.intValue
        self.timeout = timeout
    }

    func addWatchCallback(_ watchId: String, capacitorCall call: CAPPluginCall) {
        capacitorBridge?.saveCall(call)
        watchCallbacks[watchId] = call
        let timeout = (call.options[Constants.Arguments.timeout] as? NSNumber)?.intValue
        self.timeout = timeout
    }

    func clearRequestPermissionsCallbacks() {
        requestPermissionsCallbacks.forEach {
            capacitorBridge?.releaseCall($0)
        }
        requestPermissionsCallbacks.removeAll()
    }

    func clearWatchCallbackIfExists(_ watchId: String) {
        if let callbackToRemove = watchCallbacks[watchId] {
            capacitorBridge?.releaseCall(callbackToRemove)
            watchCallbacks.removeValue(forKey: watchId)
        }
    }

    func clearLocationCallbacks() {
        locationCallbacks.forEach {
            capacitorBridge?.releaseCall($0)
        }
        locationCallbacks.removeAll()
    }

    func sendSuccess(_ call: CAPPluginCall) {
        call.resolve()
    }

    func sendSuccess(_ call: CAPPluginCall, with data: PluginCallResultData) {
        call.resolve(data)
    }

    func sendRequestPermissionsSuccess(_ permissionsResult: String) {
        if let group = requestPermissionsCallbackGroup {
            let data = [
                Constants.AuthorisationStatus.ResultKey.location: permissionsResult,
                Constants.AuthorisationStatus.ResultKey.coarseLocation: permissionsResult
            ]
            send(.success(data), to: group)
        }
    }

    func sendSuccess(with position: IONGLOCPositionModel) {
        createPluginResult(status: .success(position.toJSObject()))
    }

    func sendError(_ call: CAPPluginCall, error: GeolocationError) {
        let errorModel = error.toCodeMessagePair()
        call.unavailable("\\(errorModel.0): \\(errorModel.1)")
    }

    func sendError(_ error: GeolocationError) {
        createPluginResult(status: .error(error.toCodeMessagePair()))

        if case .timeout = error {
            watchCallbacks.keys.forEach { clearWatchCallbackIfExists($0) }
        }
    }
}

private enum CallResultStatus {
    typealias SuccessModel = JSObject
    typealias ErrorModel = (code: String, message: String)

    case success(_ data: SuccessModel)
    case error(_ codeAndMessage: ErrorModel)
}

private extension GeolocationCallbackManager {

    func createPluginResult(status: CallResultStatus) {
        allCallbackGroups.forEach {
            send(status, to: $0)
        }
    }

    func send(_ callResultStatus: CallResultStatus, to group: GeolocationCallbackGroup) {
        group.ids.forEach { call in
            call.keepAlive = group.type.shouldKeepCallback
            switch callResultStatus {
            case .success(let data):
                call.resolve(data)
            case .error(let error):
                call.unavailable("\\(error.code): \\(error.message)")
            }
        }

        if group.type.shouldClearAfterSending {
            clearCallbacks(for: group.type)
        }
    }

    func clearCallbacks(for type: GeolocationCallbackType) {
        if case .location = type {
            clearLocationCallbacks()
        } else if case .requestPermissions = type {
            clearRequestPermissionsCallbacks()
        }
    }
}
`;
  fs.writeFileSync(geolocationCallbackManagerSwift, content, "utf8");
  console.log("✅ Overwritten GeolocationCallbackManager.swift");
}

const geolocationPluginSwift = path.resolve(
  "node_modules/@capacitor/geolocation/ios/Sources/GeolocationPlugin/GeolocationPlugin.swift",
);
if (fs.existsSync(geolocationPluginSwift)) {
  let content = fs.readFileSync(geolocationPluginSwift, "utf8");
  content = content.replace(
    "guard let callbackId = call.getString(Constants.Arguments.id) else {",
    "guard let callbackId = call.options[Constants.Arguments.id] as? String else {",
  );
  fs.writeFileSync(geolocationPluginSwift, content, "utf8");
  console.log("✅ Overwritten GeolocationPlugin.swift");
}

// 10. AppDelegate.swift — REMOVED IN R18 (was: rewrite universal-link handling)
//
// This step used to replace
//   return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
// with a hand-rolled guard + NotificationCenter.post. That was a straight
// regression, and it silently reverted the deliberate fix recorded in
// references/verification/8.1-ios.md (Gap 4).
//
// Evidence from the installed native sources (@capacitor/ios 8.5.2):
//   node_modules/@capacitor/ios/Capacitor/Capacitor/CAPApplicationDelegateProxy.swift
//     application(_:continue:restorationHandler:) already performs the SAME guard
//     (activityType == NSUserActivityTypeBrowsingWeb, webpageURL != nil), posts the
//     SAME payload (["url": url]) on .capacitorOpenUniversalLink — and additionally
//     sets `lastURL = url`. `lastURL` is declared `public internal(set)`, so the app
//     target cannot set it itself; the proxy is the only writer.
//   node_modules/@capacitor/app/.../AppPlugin.swift:98 reads exactly that
//     `ApplicationDelegateProxy.shared.lastURL` for App.getLaunchUrl().
//
// So the old step kept appUrlOpen delivery working but made a cold-start universal
// link invisible to App.getLaunchUrl(). Nothing here is needed: do not re-add it.
// ios/App/App/AppDelegate.swift is a tracked file, so `cap sync` does not clobber it.
