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

/** The only URL this script treats as the official Capacitor SPM package. */
const OFFICIAL_SWIFT_PM_URL = 'https://github.com/ionic-team/capacitor-swift-pm.git';

/** Fixed project path for the locally-vendored app-check alias. */
const APP_CHECK_ALIAS = 'ios/App/LocalPackages/capacitor-firebase-app-check/Package.swift';

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

  // The script derives its SPM target from the INSTALLED native graph and
  // refuses to run on a mismatched or missing one, so the fixture must carry
  // real package.json metadata for core / cli / ios.
  writeNativeGraph(root, write, { core: '8.6.0', cli: '8.6.0', ios: '8.6.0' });

  // Step 1 target: needs .iOS(.v15) and the CLI-generated exact pin, which the
  // CLI writes to match the installed @capacitor/ios.
  write(
    'ios/App/CapApp-SPM/Package.swift',
    `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    dependencies: [
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "12.7.0")),
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.6.0"),
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

  // Step 2 targets: the real upstream shape is `from: "8.0.0"` (verified from
  // the public 8.1.2 tarball), which already admits 8.6.0. These must survive
  // the run byte-identical — the script validates them, never rewrites them.
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
  write(SPLASH_SOURCE, `import Foundation\nimport Capacitor\n\n${VULNERABLE_STUB}`);  write(STATUS_SOURCE, `import Foundation\nimport Capacitor\n\n${VULNERABLE_STUB}`);
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

  // @capacitor-firebase/app-check is a real graph member in its own namespace.
  write(
    'node_modules/@capacitor-firebase/app-check/Package.swift',
    `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorFirebaseAppCheck",
    platforms: [.iOS(.v15)],
    dependencies: [
        .package(url: "${OFFICIAL_SWIFT_PM_URL}", from: "8.0.0")
    ]
)
`,
  );

  return root;
}

/**
 * Seeds installed-graph metadata (`package.json` only, never the real tree).
 * The script reads these to derive the SPM target and to enforce a matched
 * core/cli/ios graph.
 */
function writeNativeGraph(_root, write, versions) {
  for (const [name, version] of Object.entries(versions)) {
    write(`node_modules/@capacitor/${name}/package.json`, JSON.stringify({
      name: `@capacitor/${name}`,
      version,
    }));
  }
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

/** Runs the patch script expecting a specific non-zero failure. */
function runPatchExpectFailure(root, reasonPattern) {
  const result = spawnSync(process.execPath, [PATCH_SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
  });
  assert.notEqual(result.status, 0, 'expected the patch script to fail closed');
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, reasonPattern, `failure message did not explain the refusal:\n${output}`);
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

test('app aggregator keeps the CLI-generated pin matching the installed @capacitor/ios', () => {
  const root = patchedFixture();
  const spm = readGenerated(root, 'ios/App/CapApp-SPM/Package.swift');
  assert.match(
    spm,
    /capacitor-swift-pm\.git", exact: "8\.6\.0"/,
    'app pin must stay at the installed @capacitor/ios version (CLI regenerates it)',
  );
  assert.doesNotMatch(spm, /exact: "8\.5\.[0-9]+"/, 'the old 8.5.x downgrade must not return');
  assert.match(spm, /\.iOS\(\.v16\)/, 'deployment target still normalised');
  assert.doesNotMatch(spm, /keychain-swift/, 'keychain is declared by secure-storage, not injected here');
});

test('plugin manifests are validated read-only and survive byte-identical', () => {
  const root = patchedFixture();
  for (const pkg of ['splash-screen', 'status-bar', 'push-notifications']) {
    const manifest = readGenerated(root, `node_modules/@capacitor/${pkg}/Package.swift`);
    // Upstream declares a range that already admits 8.6.0. Rewriting it was a
    // downgrade; the repair must leave it exactly as published.
    assert.match(manifest, /capacitor-swift-pm\.git", from: "8\.0\.0"/);
    assert.doesNotMatch(manifest, /exact:/, `${pkg} must not be re-pinned`);
    assert.ok(
      manifest.includes('.iOS(.v15)'),
      `${pkg} deployment target must not be rewritten by this script`,
    );
  }
});

test('an unrelated Swift package in the app aggregator is untouched', () => {
  const root = patchedFixture();
  const spm = readGenerated(root, 'ios/App/CapApp-SPM/Package.swift');
  // firebase-ios-sdk is a different package identity with its own pin. The
  // repair must not touch any requirement that is not capacitor-swift-pm.
  assert.match(
    spm,
    /firebase-ios-sdk\.git", \.upToNextMajor\(from: "12\.7\.0"\)/,
    'firebase-ios-sdk requirement must be preserved verbatim',
  );
});

// ---------------------------------------------------------------------------
// Fail-closed contract: a conflicting pin or mismatched graph must abort
// BEFORE any file is written.
// ---------------------------------------------------------------------------

/** Seeds a fixture with one overridden plugin constraint. */
function seedWithPluginPin(pkg, kind, version) {
  const root = seedFixture();
  const manifest = path.join(root, 'node_modules/@capacitor', pkg, 'Package.swift');
  fs.writeFileSync(
    manifest,
    fs.readFileSync(manifest, 'utf8').replace(
      /capacitor-swift-pm\.git", from: "[^"]+"/,
      `capacitor-swift-pm.git", ${kind}: "${version}"`,
    ),
    'utf8',
  );
  return root;
}

/** Seeds a fixture with one overridden aggregator constraint. */
function seedWithAggregatorPin(kind, version, url = OFFICIAL_SWIFT_PM_URL) {
  const root = seedFixture();
  const manifest = path.join(root, 'ios/App/CapApp-SPM/Package.swift');
  fs.writeFileSync(
    manifest,
    fs.readFileSync(manifest, 'utf8').replace(
      /\.package\(url: "[^"]+", (?:from|exact): "[^"]+"\)/,
      `.package(url: "${url}", ${kind}: "${version}")`,
    ),
    'utf8',
  );
  return root;
}

/** Snapshot of every file the script could write, for before/after equality. */
function snapshotTree(root) {
  const watched = [
    'ios/App/CapApp-SPM/Package.swift',
    ...AFFECTED_SOURCES,
    'node_modules/@capacitor/splash-screen/Package.swift',
    'node_modules/@capacitor/status-bar/Package.swift',
    'node_modules/@capacitor/push-notifications/Package.swift',
  ];
  return new Map(watched.map((rel) => [rel, fs.readFileSync(path.join(root, rel), 'utf8')]));
}

function assertTreeUnchanged(root, before) {
  for (const [rel, content] of before) {
    assert.equal(
      fs.readFileSync(path.join(root, rel), 'utf8'),
      content,
      `${rel} was modified even though the run should have failed closed`,
    );
  }
}

test('a conflicting exact plugin pin is refused before any file is written', () => {
  const root = seedWithPluginPin('push-notifications', 'exact', '8.5.0');
  try {
    // The aggregator still needs its deployment-target normalisation, which is
    // exactly the write that must NOT happen when validation fails.
    const before = snapshotTree(root);
    runPatchExpectFailure(root, /exact capacitor-swift-pm pin "8\.5\.0" conflicts/);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a from: range requiring a newer runtime is refused, not force-upgraded', () => {
  const root = seedWithPluginPin('status-bar', 'from', '8.7.0');
  try {
    const before = snapshotTree(root);
    runPatchExpectFailure(root, /requires a version above the installed/);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a different-major plugin range is refused instead of cross-range forced', () => {
  const root = seedWithPluginPin('splash-screen', 'from', '9.0.0');
  try {
    const before = snapshotTree(root);
    runPatchExpectFailure(root, /different major/);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a mismatched installed core/platform graph is rejected up front', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-ios-spm-mismatch-'));
  try {
    const write = (relative, content) => {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
    };
    // core/cli at 8.6.0 but ios lagging at 8.5.2.
    writeNativeGraph(root, write, { core: '8.6.0', cli: '8.6.0', ios: '8.5.2' });
    write('ios/App/CapApp-SPM/Package.swift', `// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.6.0")
    ],
    targets: []
)
`);
    runPatchExpectFailure(root, /mismatched native graph/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a missing installed native graph is rejected, never silently skipped', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-ios-spm-missing-'));
  try {
    const file = path.join(root, 'ios/App/CapApp-SPM/Package.swift');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.6.0")
    ],
    targets: []
)
`);
    runPatchExpectFailure(root, /not installed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Gap 1: the app aggregator is CLI-generated and must pin `exact:` to the
// installed platform. A `from:` here would let the native SDK float.
// ---------------------------------------------------------------------------

test('a from: aggregator pin is refused: the CLI writes exact, never a range', () => {
  const root = seedWithAggregatorPin('from', '8.0.0');
  try {
    const before = snapshotTree(root);
    runPatchExpectFailure(root, /aggregator must pin exact/i);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an aggregator pinning a different exact version is refused', () => {
  const root = seedWithAggregatorPin('exact', '8.5.2');
  try {
    const before = snapshotTree(root);
    runPatchExpectFailure(root, /exact capacitor-swift-pm pin "8\.5\.2" conflicts/);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Gap 2: @capacitor-firebase/app-check is a real graph member and may appear
// at its fixed vendored alias path. Both forms must be validated.
// ---------------------------------------------------------------------------

test('a conflicting exact pin in @capacitor-firebase/app-check is refused', () => {
  const root = seedFixture();
  const manifest = path.join(root, 'node_modules/@capacitor-firebase/app-check/Package.swift');
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(
    manifest,
    `// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "CapacitorFirebaseAppCheck",
    dependencies: [
        .package(url: "${OFFICIAL_SWIFT_PM_URL}", exact: "8.5.0")
    ]
)
`,
    'utf8',
  );
  try {
    const before = snapshotTree(root);
    runPatchExpectFailure(root, /app-check.*exact capacitor-swift-pm pin "8\.5\.0" conflicts/);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a conflicting exact pin at the vendored app-check alias is refused', () => {
  const root = seedFixture();
  const alias = path.join(root, APP_CHECK_ALIAS);
  fs.mkdirSync(path.dirname(alias), { recursive: true });
  fs.writeFileSync(
    alias,
    `// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "capacitor-firebase-app-check",
    dependencies: [
        .package(url: "${OFFICIAL_SWIFT_PM_URL}", exact: "8.5.0")
    ]
)
`,
    'utf8',
  );
  try {
    const before = snapshotTree(root);
    runPatchExpectFailure(root, /capacitor-firebase-app-check.*conflicts/);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an absent vendored alias is not an error (it is optional)', () => {
  // The default fixture seeds no LocalPackages directory; a successful run
  // proves absence is tolerated rather than treated as a missing requirement.
  const root = seedFixture();
  try {
    assert.equal(fs.existsSync(path.join(root, APP_CHECK_ALIAS)), false);
    runPatch(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Gap 3: only the FULL official URL counts as the Capacitor pin, and exactly
// one current requirement must exist.
// ---------------------------------------------------------------------------

test('an unrelated URL ending in capacitor-swift-pm.git is not treated as official', () => {
  const root = seedWithAggregatorPin(
    'exact',
    '8.0.0',
    'https://example.invalid/attacker/capacitor-swift-pm.git',
  );
  try {
    const before = snapshotTree(root);
    // The look-alike URL must be rejected *as unofficial*, not silently accepted
    // as the Capacitor pin and not silently ignored as if none existed.
    runPatchExpectFailure(root, /different URL ending in capacitor-swift-pm\.git is not official/);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('two competing capacitor-swift-pm requirements are refused as ambiguous', () => {
  const root = seedFixture();
  const manifest = path.join(root, 'ios/App/CapApp-SPM/Package.swift');
  fs.writeFileSync(
    manifest,
    fs
      .readFileSync(manifest, 'utf8')
      .replace(
        /(\.package\(url: "[^"]+", exact: "8\.6\.0"\),)/,
        `$1\n        .package(url: "${OFFICIAL_SWIFT_PM_URL}", from: "8.0.0"),`,
      ),
    'utf8',
  );
  try {
    const before = snapshotTree(root);
    runPatchExpectFailure(root, /ambiguous|more than one/i);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an unsupported requirement syntax fails closed instead of being guessed', () => {
  const root = seedWithAggregatorPin('branch', 'main');
  try {
    const before = snapshotTree(root);
    runPatchExpectFailure(root, /unsupported|unrecognised/i);
    assertTreeUnchanged(root, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// An unrelated SDK (e.g. Firebase) must survive untouched even when it uses a
// from: range that a former broad 8.x rewrite would have clobbered.
// ---------------------------------------------------------------------------

test('an unrelated SDK with a from: 8.1.2 range is left unchanged', () => {
  const root = seedFixture();
  const manifest = path.join(root, 'ios/App/CapApp-SPM/Package.swift');
  fs.writeFileSync(
    manifest,
    fs
      .readFileSync(manifest, 'utf8')
      .replace(
        /(\.package\(url: "[^"]+", exact: "8\.6\.0"\),)/,
        `$1\n        .package(url: "https://github.com/example/unrelated-sdk.git", from: "8.1.2"),`,
      ),
    'utf8',
  );
  try {
    const patched = path.join(root, 'ios/App/CapApp-SPM/Package.swift');
    const original = fs.readFileSync(patched, 'utf8');
    runPatch(root);
    const after = fs.readFileSync(patched, 'utf8');
    assert.match(
      after,
      /unrelated-sdk\.git", from: "8\.1\.2"/,
      'a broad 8.x rewrite must not touch an unrelated SDK range',
    );
    // Only the deployment target differs from the input.
    assert.equal(after, original.replace(/\.iOS\(\.v15\)/g, '.iOS(.v16)'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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
