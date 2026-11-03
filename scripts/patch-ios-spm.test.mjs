// patch-ios-spm.test.mjs — regression guard for the iOS launch crash.
//
// Crash evidence (CI run 41560001406):
//   NSUnknownKeyException: "[<Capacitor.PluginConfig ...> valueForUndefinedKey:]:
//   this class is not key value coding-compliant for the key config."
//   → SplashScreenPlugin.splashScreenConfig()
//
// Root cause: scripts/patch-ios-spm.js rewrites three plugin sources and read
// the plugin config with KVC — `getConfig().value(forKey: "config")`. In
// @capacitor/ios (runtime 8.5.0) `PluginConfig.config` is a PRIVATE Swift
// property and is not KVC-visible, so the first read throws at launch. The
// supported API is the typed getter set on PluginConfig:
//   getString(_:_:), getBoolean(_:_:), getInt(_:_:), getDouble(_:_:),
//   getArray(_:_:), getObject(_:), getConfigJSON()
//
// This test therefore EXECUTES the patch script inside a throwaway fixture,
// then reads the GENERATED Swift files — asserting on the script's source text
// alone would not prove what actually lands in node_modules on macOS.
//
// The real node_modules tree is never written to: the fixture is a fresh
// mkdtemp directory passed as the script's cwd, and every path the script
// resolves is relative to that cwd.
//
// Run: node --test scripts/patch-ios-spm.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CUSTOMER_ROOT = path.resolve(HERE, '..');
const PATCH_SCRIPT = path.join(HERE, 'patch-ios-spm.js');

// Keys each patched plugin must read through a typed PluginConfig getter.
const SPLASH_SOURCE = 'node_modules/@capacitor/splash-screen/ios/Sources/SplashScreenPlugin/SplashScreenPlugin.swift';
const STATUS_SOURCE = 'node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBarPlugin.swift';
const PUSH_SOURCE = 'node_modules/@capacitor/push-notifications/ios/Sources/PushNotificationsPlugin/PushNotificationsHandler.swift';
const AFFECTED_SOURCES = [SPLASH_SOURCE, STATUS_SOURCE, PUSH_SOURCE];

// Any of these in generated Swift means the crash is back. `value(forKey:
// "config")` is the exact selector from the crash report; the broader
// `getConfig().value(` form catches a rename of the same private-property poke.
const PRIVATE_CONFIG_KVC = [
  /value\(forKey:\s*"config"\)/,
  /getConfig\(\)\s*\.\s*value\(/,
  /rawConfig/,
];

/** Pre-fix body of the vulnerable line, mirroring the crash trail. */
const VULNERABLE_STUB = `// FIXTURE_STUB_MARKER
private func fixturePlaceholder() {
    let rawConfig = (getConfig().value(forKey: "config") as? [String: Any]) ?? [:]
    _ = rawConfig
}
`;

/** Seeds a minimal but shape-correct tree for the patch script. */
function seedFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-ios-spm-'));

  const write = (relative, content) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  };

  // Step 1 target: needs .iOS(.v15) and an exact capacitor-swift-pm pin.
  write(
    'ios/App/CapApp-SPM/Package.swift',
    `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2"),
        .package(name: "CapacitorSplashScreen", path: "../../../node_modules/@capacitor/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../../../node_modules/@capacitor/status-bar"),
        .package(name: "CapacitorPushNotifications", path: "../../../node_modules/@capacitor/push-notifications")
    ],
    targets: [
        .target(name: "CapApp-SPM", dependencies: [
            .product(name: "Capacitor", package: "capacitor-swift-pm")
        ])
    ]
)
`,
  );

  // Step 2 targets: a plugin-declared lower bound the script must normalise.
  for (const pkg of ['splash-screen', 'status-bar', 'push-notifications']) {
    write(
      `node_modules/@capacitor/${pkg}/Package.swift`,
      `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Capacitor${pkg}",
    platforms: [.iOS(.v15)],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ]
)
`,
    );
  }

  // Vulnerable pre-patch sources. The stub marker proves the script rewrote
  // the file rather than the fixture already being clean.
  write(SPLASH_SOURCE, `import Foundation\nimport Capacitor\n\n${VULNERABLE_STUB}`);
  write(STATUS_SOURCE, `import Foundation\nimport Capacitor\n\n${VULNERABLE_STUB}`);
  write(
    PUSH_SOURCE,
    `import Capacitor\n\n${VULNERABLE_STUB.replace(
      'getConfig().value(forKey: "config")',
      'self.plugin?.getConfig().value(forKey: "config")',
    )}`,
  );

  // Non-config siblings the script also replaces when present.
  write(
    'node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift',
    '// FIXTURE_STUB_MARKER\n',
  );
  write(
    'node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/UIColor.swift',
    '// FIXTURE_STUB_MARKER\n',
  );
  write(
    'node_modules/@capacitor/push-notifications/ios/Sources/PushNotificationsPlugin/PushNotificationsPlugin.swift',
    '// FIXTURE_STUB_MARKER\n',
  );

  return root;
}

/** Runs the real patch script with the fixture as its working directory. */
function runPatch(root) {
  const result = spawnSync(process.execPath, [PATCH_SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.equal(
    result.status,
    0,
    `patch-ios-spm.js exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function readGenerated(root, relative) {
  const file = path.join(root, relative);
  assert.ok(fs.existsSync(file), `patch script did not write ${relative}`);
  return fs.readFileSync(file, 'utf8');
}

let cachedFixture = null;
/**
 * One patched fixture shared by the read-only assertions below. Each test that
 * needs it calls this; the first call seeds + patches, later calls reuse.
 */
function patchedFixture() {
  if (!cachedFixture) {
    const root = seedFixture();
    runPatch(root);
    cachedFixture = root;
  }
  return cachedFixture;
}

test.after(() => {
  if (cachedFixture) fs.rmSync(cachedFixture, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// RED-before-fix tripwire: no private-config KVC may reach native code.
// ---------------------------------------------------------------------------

test('patch script source no longer reads PluginConfig through KVC', () => {
  const script = fs.readFileSync(PATCH_SCRIPT, 'utf8');
  for (const pattern of PRIVATE_CONFIG_KVC) {
    assert.doesNotMatch(
      script,
      pattern,
      `patch-ios-spm.js still contains ${pattern} — PluginConfig.config is private and throws NSUnknownKeyException at launch`,
    );
  }
});

test('generated splash-screen plugin reads config through typed getters only', () => {
  const source = readGenerated(patchedFixture(), SPLASH_SOURCE);
  for (const pattern of PRIVATE_CONFIG_KVC) {
    assert.doesNotMatch(
      source,
      pattern,
      `generated SplashScreenPlugin.swift contains ${pattern}`,
    );
  }
  assert.doesNotMatch(source, /FIXTURE_STUB_MARKER/, 'stub was not replaced');
});

test('generated status-bar plugin reads config through typed getters only', () => {
  const source = readGenerated(patchedFixture(), STATUS_SOURCE);
  for (const pattern of PRIVATE_CONFIG_KVC) {
    assert.doesNotMatch(
      source,
      pattern,
      `generated StatusBarPlugin.swift contains ${pattern}`,
    );
  }
  assert.doesNotMatch(source, /FIXTURE_STUB_MARKER/, 'stub was not replaced');
});

test('generated push handler reads config through typed getters only', () => {
  const source = readGenerated(patchedFixture(), PUSH_SOURCE);
  for (const pattern of PRIVATE_CONFIG_KVC) {
    assert.doesNotMatch(
      source,
      pattern,
      `generated PushNotificationsHandler.swift contains ${pattern}`,
    );
  }
  assert.doesNotMatch(source, /FIXTURE_STUB_MARKER/, 'stub was not replaced');
});

// ---------------------------------------------------------------------------
// Typed getters + preserved semantics per plugin.
// ---------------------------------------------------------------------------

/** Asserts `config.<prop> = getConfig().<getter>("<key>", config.<prop>)`. */
function assertDefaultFlowsThrough(source, prop, getter, key) {
  const pattern = new RegExp(
    `config\\.${prop}\\s*=\\s*getConfig\\(\\)\\.${getter}\\("${key}",\\s*config\\.${prop}\\)`,
  );
  assert.match(
    source,
    pattern,
    `expected defaults to flow from SplashScreenConfig/StatusBarConfig: ` +
      `config.${prop} = getConfig().${getter}("${key}", config.${prop})`,
  );
}

test('splash-screen config uses supported getters and keeps struct defaults', () => {
  const source = readGenerated(patchedFixture(), SPLASH_SOURCE);

  // Strings: hex colours parse through UIColor.fromHex, spinner style mapping
  // stays intact (small -> .medium, everything else -> .large).
  assert.match(source, /getConfig\(\)\.getString\("backgroundColor"\)/);
  assert.match(source, /getConfig\(\)\.getString\("iosSpinnerStyle"\)/);
  assert.match(source, /getConfig\(\)\.getString\("spinnerColor"\)/);
  assert.match(source, /case "small":\s*\n\s*config\.spinnerStyle = \.medium/);

  // Defaults that existed before the rewrite: showSpinner=false,
  // launchShowDuration=500, launchAutoHide=true — all still sourced from the
  // SplashScreenConfig struct, never hardcoded in the plugin.
  assertDefaultFlowsThrough(source, 'showSpinner', 'getBoolean', 'showSpinner');
  assertDefaultFlowsThrough(source, 'launchShowDuration', 'getInt', 'launchShowDuration');
  assertDefaultFlowsThrough(source, 'launchAutoHide', 'getBoolean', 'launchAutoHide');
  assert.doesNotMatch(
    source,
    /getBoolean\("showSpinner",\s*(true|false)\)/,
    'showSpinner default must come from SplashScreenConfig, not a literal',
  );
  assert.doesNotMatch(
    source,
    /getInt\("launchShowDuration",\s*\d+\)/,
    'launchShowDuration default must come from SplashScreenConfig, not a literal',
  );
});

test('status-bar config uses supported getters and keeps struct defaults', () => {
  const source = readGenerated(patchedFixture(), STATUS_SOURCE);

  assertDefaultFlowsThrough(source, 'overlaysWebView', 'getBoolean', 'overlaysWebView');
  assert.match(source, /getConfig\(\)\.getString\("backgroundColor"\)/);
  assert.match(source, /getConfig\(\)\.getString\("style"\)/);

  // Behaviour preserved: the style table is unchanged.
  assert.match(source, /case "dark", "lightcontent":\s*\n\s*return \.lightContent/);
  assert.match(source, /case "light", "darkcontent":\s*\n\s*return \.darkContent/);
});

test('push handler reads presentationOptions through getArray', () => {
  const source = readGenerated(patchedFixture(), PUSH_SOURCE);

  assert.match(
    source,
    /self\.plugin\?\.getConfig\(\)\.getArray\("presentationOptions"\)/,
    'presentationOptions must be read with PluginConfig.getArray',
  );

  // Notification semantics preserved: silent short-circuit and every option
  // mapping (alert expands to banner + list) still present.
  assert.match(source, /let silent = options\["silent"\] as\? Bool \?\? false/);
  for (const option of ['banner', 'list', 'alert', 'badge', 'sound']) {
    assert.match(source, new RegExp(`case "${option}":`));
  }
  assert.match(source, /presentationOptions\.insert\(\.banner\)\s*\n\s*presentationOptions\.insert\(\.list\)/);
});

// ---------------------------------------------------------------------------
// Idempotence + untouched dependency pin.
// ---------------------------------------------------------------------------

test('re-running the patch produces byte-identical output (idempotent)', () => {
  const root = patchedFixture();
  const watched = [
    'ios/App/CapApp-SPM/Package.swift',
    ...AFFECTED_SOURCES,
    'node_modules/@capacitor/splash-screen/Package.swift',
    'node_modules/@capacitor/status-bar/Package.swift',
    'node_modules/@capacitor/push-notifications/Package.swift',
  ];

  const first = new Map(watched.map((rel) => [rel, readGenerated(root, rel)]));
  runPatch(root);

  for (const rel of watched) {
    assert.equal(readGenerated(root, rel), first.get(rel), `${rel} changed on the second run`);
  }
});

test('capacitor-swift-pm stays pinned to 8.5.0 (dependency decision untouched)', () => {
  const root = patchedFixture();
  const spm = readGenerated(root, 'ios/App/CapApp-SPM/Package.swift');
  assert.match(spm, /capacitor-swift-pm\.git", exact: "8\.5\.0"/);
  assert.doesNotMatch(spm, /exact: "8\.5\.2"/, 'CLI pin must be normalised to 8.5.0');
  assert.match(spm, /\.iOS\(\.v16\)/);

  for (const pkg of ['splash-screen', 'status-bar', 'push-notifications']) {
    const manifest = readGenerated(root, `node_modules/@capacitor/${pkg}/Package.swift`);
    assert.match(manifest, /capacitor-swift-pm\.git", exact: "8\.5\.0"/);
    assert.doesNotMatch(manifest, /from: "8\.0\.0"/);
  }
});

// ---------------------------------------------------------------------------
// Guard against inventing getters: every getter the generated code calls must
// exist on the installed PluginConfig. Skipped when node_modules is absent.
// ---------------------------------------------------------------------------

test('every typed getter used exists on the installed PluginConfig', (t) => {
  const pluginConfig = path.join(
    CUSTOMER_ROOT,
    'node_modules/@capacitor/ios/Capacitor/Capacitor/PluginConfig.swift',
  );
  if (!fs.existsSync(pluginConfig)) {
    t.skip('@capacitor/ios not installed — cannot cross-check PluginConfig API');
    return;
  }

  const api = fs.readFileSync(pluginConfig, 'utf8');
  const declared = new Set(
    [...api.matchAll(/func\s+(get\w+)\s*\(/g)].map((m) => m[1]),
  );
  assert.ok(declared.size > 0, 'could not parse any getters from PluginConfig.swift');

  // The premise of this whole fix: `config` is a PRIVATE Swift property, which
  // is exactly why KVC on it throws. If upstream ever makes it public, this
  // test should be revisited deliberately rather than silently keep passing.
  assert.match(
    api,
    /private\s+var\s+config\s*:\s*JSObject/,
    'PluginConfig.config is no longer `private var config: JSObject` — re-verify the KVC crash diagnosis',
  );
  assert.doesNotMatch(
    api,
    /@objc\s+public\s+var\s+config\b|\bpublic\s+var\s+config\b/,
    'PluginConfig.config must stay non-public: the typed getters are the supported path',
  );

  const root = patchedFixture();
  const script = fs.readFileSync(PATCH_SCRIPT, 'utf8');
  const used = new Set(
    [...script.matchAll(/getConfig\(\)\s*\.\s*(get[A-Za-z]+)\s*\(/g)].map((m) => m[1]),
  );
  assert.ok(used.size > 0, 'patch script uses no PluginConfig getters at all — did it regress to KVC?');

  for (const getter of used) {
    assert.ok(
      declared.has(getter),
      `generated Swift calls PluginConfig.${getter}, which the installed PluginConfig.swift does not declare`,
    );
  }
  // Sanity: the fixture really did produce files for the used getters.
  assert.ok(readGenerated(root, SPLASH_SOURCE).includes('getConfig().getString('));
});
