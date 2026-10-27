/**
 * EMULATOR TEST LANE — the ONLY entrypoint.
 *
 *   node tests/emulator/run-lane.mjs            # positive + negative phases
 *   node tests/emulator/run-lane.mjs --skip-negative   # debugging only
 *
 * It does NOT call any production service. It:
 *   1. preflights ports 8099/5199/4400/4500 (abort on busy; never kills an unknown PID),
 *      Java >= 21 (ignores the machine's Java 8 default; prefers the installed JBR),
 *      the cached Firestore emulator JAR (no download unless explicitly allowed),
 *      and the canonical rules file (explicit BLOCKED when absent);
 *   2. strips credential-bearing env vars BY NAME (values are never read/logged) and
 *      sets only synthetic demo VITE_* flags;
 *   3. materializes an effective firebase config with an absolute, hash-verified
 *      rules path (firebase-tools rejects a `..` path and defaults to allow-all when
 *      the rules file is missing);
 *   4. runs the seeded browser lane inside `firebase emulators:exec`;
 *   5. tears the emulator down and runs the fail-closed negative phase;
 *   6. writes report.md, manifest.json, rawlogs/ and screenshot hashes under
 *      `%TEMP%/opencode/phase1-emulator-browser` (override: EMULATOR_LANE_ARTIFACTS).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { REQUIRED_POSITIVE_TESTS } from "./lane-gates.mjs";
import { captureStartToken, killTracked } from "./process-identity.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "../..");

const PROJECT_ID = "demo-burgonomics-emulator";
const FIRESTORE_PORT = 8099;
const VITE_PORT = 5199;
const HUB_PORT = 4400;
const LOGGING_PORT = 4500;
/** The Firestore emulator binds its own UI websocket here even with ui.enabled:false. */
const EMULATOR_WS_PORT = 9150;
const REQUIRED_JAVA_MAJOR = 21;

const SKIP_NEGATIVE = process.argv.includes("--skip-negative");
const ALLOW_DOWNLOAD = process.env.EMULATOR_ALLOW_DOWNLOAD === "1";

const ARTIFACTS_DIR =
  process.env.EMULATOR_LANE_ARTIFACTS ??
  path.join(os.tmpdir(), "opencode", "phase1-emulator-browser");
const RAWLOGS_DIR = path.join(ARTIFACTS_DIR, "rawlogs");
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, "screenshots");
const RUN_STARTED = Date.now();
const GLOBAL_DEADLINE_MS = 600_000;

const CUSTOMER_RULES_PATH = path.join(PROJECT_ROOT, "firestore.rules");
const CANONICAL_RULES_PATH =
  process.env.EMULATOR_CANONICAL_RULES ??
  path.resolve(PROJECT_ROOT, "..", "polish-backend-20261025", "firestore.rules");
const COMMITTED_EMULATOR_CONFIG = path.join(HERE, "firebase.emulator.json");
const EFFECTIVE_CONFIG = path.join(ARTIFACTS_DIR, "effective.firebase.json");
const LANE_SCRIPT = path.join(HERE, "lane.mjs");

const state = {
  phases: {},
  preflight: {},
  ports: {},
  problems: [],
};

/** Built once in preflight from allowlisted benign OS variables only. */
let CHILD_ENV = null;

/**
 * The child env is an ALLOWLIST, not a copy-then-delete. Credential-bearing
 * variables (VITE_*, FIREBASE_*, FIRESTORE_*, GOOGLE_*, GCLOUD_*, provider keys)
 * are never read, copied, logged or forwarded by this program.
 */
const CHILD_ENV_ALLOWLIST = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "windir",
  "SystemDrive",
  "ComSpec",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "LOCALAPPDATA",
  "APPDATA",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "OS",
  "USERNAME",
  "USERDOMAIN",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "SHELL",
  "USER",
  "LOGNAME",
  "TERM",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
];

function log(message) {
  process.stdout.write(`[run-lane] ${message}\n`);
}

function blocked(message, code = 3) {
  state.problems.push(message);
  process.stderr.write(`[run-lane] BLOCKED: ${message}\n`);
  try {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    writeFileSync(
      path.join(ARTIFACTS_DIR, "report.md"),
      [
        "# Phase 1 emulator lane — BLOCKED",
        "",
        `Exit code: ${code}`,
        `Finished: ${new Date().toISOString()}`,
        "",
        "```",
        message,
        "```",
        "",
        "No browser/emulator evidence was produced for this run.",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(ARTIFACTS_DIR, "manifest.json"),
      `${JSON.stringify(
        {
          lane: "phase1-emulator-browser",
          verdict: "BLOCKED",
          code,
          problems: state.problems,
          startedAt: new Date(RUN_STARTED).toISOString(),
          finishedAt: new Date().toISOString(),
          preflight: state.preflight,
          ports: state.ports,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } catch {
    /* evidence dir unavailable — the console message is the record */
  }
  process.exit(code);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function rel(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replaceAll("\\", "/");
}

// ── Preflight ───────────────────────────────────────────────────────────────

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function checkPorts(label) {
  const ports = [FIRESTORE_PORT, VITE_PORT, HUB_PORT, LOGGING_PORT, EMULATOR_WS_PORT];
  const result = {};
  for (const port of ports) result[port] = await portIsFree(port);
  state.ports[label] = result;
  const busy = ports.filter((port) => !result[port]);
  if (label === "before" && busy.length > 0) {
    blocked(`port(s) already in use: ${busy.join(", ")}. Refusing to start; no PID was killed.`, 5);
  }
  return result;
}

function javaMajor(javaExe) {
  const probe = spawnSync(javaExe, ["-version"], { encoding: "utf8" });
  const text = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
  const match = text.match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return Number(match[1]);
}

function javaCandidates() {
  const candidates = [];
  if (process.env.EMULATOR_JAVA_HOME) candidates.push(process.env.EMULATOR_JAVA_HOME);
  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);

  const jdks = path.join(os.homedir(), ".jdks");
  if (existsSync(jdks)) {
    for (const entry of readdirSync(jdks)) candidates.push(path.join(jdks, entry));
  }

  if (process.platform === "win32") {
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (base) candidates.push(path.join(base, "Android", "Android Studio", "jbr"));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Android Studio.app/Contents/jbr/Contents/Home");
  } else {
    const jvm = "/usr/lib/jvm";
    if (existsSync(jvm)) {
      for (const entry of readdirSync(jvm)) candidates.push(path.join(jvm, entry));
    }
  }
  return [...new Set(candidates)];
}

function resolveJava() {
  const javaBin = process.platform === "win32" ? "java.exe" : "java";
  for (const home of javaCandidates()) {
    const exe = path.join(home, "bin", javaBin);
    if (!existsSync(exe)) continue;
    const major = javaMajor(exe);
    if (major && major >= REQUIRED_JAVA_MAJOR) return { home, exe, major };
  }
  return null;
}

function resolveEmulatorJar() {
  let infoPath;
  try {
    infoPath = require.resolve("firebase-tools/lib/emulator/downloadableEmulatorInfo.json");
  } catch {
    blocked(
      "cannot resolve firebase-tools emulator metadata; refusing to start a lane that might download a binary.",
      3,
    );
  }
  const info = JSON.parse(readFileSync(infoPath, "utf8"));
  const version = info.firestore.version;
  const jar = path.join(
    os.homedir(),
    ".cache",
    "firebase",
    "emulators",
    `cloud-firestore-emulator-v${version}.jar`,
  );
  return { version, jar, present: existsSync(jar) };
}

function resolveDependency(name) {
  try {
    return require.resolve(name);
  } catch {
    return null;
  }
}

function verifyRules() {
  if (!existsSync(CUSTOMER_RULES_PATH)) blocked(`customer rules missing: ${rel(CUSTOMER_RULES_PATH)}`, 3);
  if (!existsSync(CANONICAL_RULES_PATH)) {
    blocked(
      `canonical backend rules not found at ${CANONICAL_RULES_PATH}. ` +
        "Set EMULATOR_CANONICAL_RULES. The lane refuses to run without the parity gate.",
      3,
    );
  }
  const customer = sha256File(CUSTOMER_RULES_PATH);
  const canonical = sha256File(CANONICAL_RULES_PATH);
  state.preflight.rules = {
    customerPath: rel(CUSTOMER_RULES_PATH),
    customerSha256: customer,
    canonicalPath: rel(CANONICAL_RULES_PATH),
    canonicalSha256: canonical,
    parity: customer === canonical,
    bytes: statSync(CUSTOMER_RULES_PATH).size,
    source: process.env.EMULATOR_CANONICAL_RULES ? "env" : "default-peer-worktree",
  };
  if (customer !== canonical) {
    blocked(
      `rules divergence: customer ${customer} != canonical ${canonical}. ` +
        "The lane deliberately fails instead of loading a loosened/stale ruleset.",
      4,
    );
  }
}

async function preflight() {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  mkdirSync(RAWLOGS_DIR, { recursive: true });
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  // Clear this lane's own ephemeral evidence so a failed run can never leave a
  // stale PASS artifact behind for the manifest to read.
  for (const name of [
    "manifest.json",
    "report.md",
    "seed-proof.json",
    "lane-result.json",
    "lane-result-negative.json",
    "negative-network-proof.json",
    "network-proof-positive.json",
    "network-proof-negative-probe.json",
    "network-proof-negative-inverted.json",
    "playwright-positive.json",
    "playwright-negative-probe.json",
    "playwright-negative-inverted.json",
    "geometry-proof.json",
  ]) {
    rmSync(path.join(ARTIFACTS_DIR, name), { force: true });
  }
  for (const name of readdirSync(SCREENSHOTS_DIR)) {
    if (name.endsWith(".png")) rmSync(path.join(SCREENSHOTS_DIR, name), { force: true });
  }

  await checkPorts("before");

  const java = resolveJava();
  if (!java) {
    blocked(
      `no Java ${REQUIRED_JAVA_MAJOR}+ found (the machine default may be Java 8). ` +
        "Set EMULATOR_JAVA_HOME to a JDK 21+ (the installed Android Studio JBR works).",
      3,
    );
  }
  state.preflight.java = { home: java.home, major: java.major };
  CHILD_ENV = buildChildEnv(java.home);

  const jar = resolveEmulatorJar();
  state.preflight.jar = jar;
  if (!jar.present && !ALLOW_DOWNLOAD) {
    blocked(
      `Firestore emulator ${jar.version} is not cached at ${jar.jar}. ` +
        "This lane will not download a binary; pre-provision it or set EMULATOR_ALLOW_DOWNLOAD=1.",
      3,
    );
  }
  if (!jar.present && ALLOW_DOWNLOAD) {
    log(`WARN: emulator ${jar.version} will be downloaded (EMULATOR_ALLOW_DOWNLOAD=1)`);
  }

  const firebaseCli = resolveDependency("firebase-tools/lib/bin/firebase.js");
  if (!firebaseCli) blocked("firebase-tools CLI is not installed in this worktree", 3);
  const playwright = resolveDependency("@playwright/test/cli");
  if (!playwright) blocked("@playwright/test is declared but not resolvable (no install performed)", 5);
  const rulesUnitTesting = resolveDependency("@firebase/rules-unit-testing");
  if (!rulesUnitTesting) blocked("@firebase/rules-unit-testing is not resolvable", 5);

  state.preflight.firebaseCli = firebaseCli;
  state.preflight.playwrightCli = playwright;
  state.preflight.rulesUnitTesting = rulesUnitTesting;

  const versionProbe = spawnSync(process.execPath, [firebaseCli, "--version"], {
    encoding: "utf8",
    env: CHILD_ENV ?? undefined,
  });
  state.preflight.firebaseVersion = (versionProbe.stdout ?? "").trim();

  verifyRules();
}

// ── Environment + effective config ──────────────────────────────────────────

/**
 * Build the child env from an allowlist of benign OS variables + explicit demo
 * values. Values of credential-bearing variables are never read or copied.
 */
function buildChildEnv(javaHome) {
  const env = {};
  const sourceKeys = Object.keys(process.env);
  for (const wanted of CHILD_ENV_ALLOWLIST) {
    const key = sourceKeys.find((name) => name.toLowerCase() === wanted.toLowerCase());
    if (key !== undefined) env[key] = process.env[key];
  }

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const javaBin = path.join(javaHome, "bin");
  env[pathKey] = `${javaBin}${path.delimiter}${env[pathKey] ?? ""}`;
  env.JAVA_HOME = javaHome;

  env.EMULATOR_LANE = "1";
  env.EMULATOR_LANE_ARTIFACTS = ARTIFACTS_DIR;
  env.EMULATOR_CANONICAL_RULES = CANONICAL_RULES_PATH;

  // Synthetic, non-secret demo configuration. No real project, no real key.
  env.VITE_FIREBASE_API_KEY = "demo-emulator-key-not-a-secret";
  env.VITE_FIREBASE_AUTH_DOMAIN = `${PROJECT_ID}.firebaseapp.com`;
  env.VITE_FIREBASE_PROJECT_ID = PROJECT_ID;
  env.VITE_FIREBASE_STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
  env.VITE_FIREBASE_MESSAGING_SENDER_ID = "0";
  env.VITE_FIREBASE_APP_ID = "1:0:web:emulatorlane";
  env.VITE_APP_ENV = "development";
  env.VITE_ANALYTICS_ENABLED = "false";
  env.VITE_PUSH_ENABLED = "false";
  env.VITE_PETPOOJA_ENABLED = "false";
  return env;
}

function writeEffectiveConfig() {
  const declared = JSON.parse(readFileSync(COMMITTED_EMULATOR_CONFIG, "utf8"));
  const firestore = declared?.emulators?.firestore;
  const problems = [];
  if (firestore?.host !== "127.0.0.1") problems.push("firestore host must be 127.0.0.1");
  if (firestore?.port !== FIRESTORE_PORT) problems.push(`firestore port must be ${FIRESTORE_PORT}`);
  if (declared?.emulators?.ui?.enabled !== false) problems.push("emulator UI must be disabled");
  for (const forbidden of ["auth", "functions", "storage", "database", "pubsub"]) {
    if (declared?.emulators?.[forbidden]) problems.push(`emulator "${forbidden}" must not be declared`);
  }
  if (problems.length > 0) {
    blocked(`committed emulator config drifted: ${problems.join("; ")}`, 3);
  }

  const effective = {
    firestore: { rules: CUSTOMER_RULES_PATH },
    emulators: {
      firestore: { host: "127.0.0.1", port: FIRESTORE_PORT },
      ui: { enabled: false },
    },
  };
  writeFileSync(EFFECTIVE_CONFIG, `${JSON.stringify(effective, null, 2)}\n`, "utf8");
}

// ── Child process helpers ───────────────────────────────────────────────────

function remainingBudget() {
  return Math.max(0, GLOBAL_DEADLINE_MS - (Date.now() - RUN_STARTED));
}

function runProcess(label, command, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      ...(process.platform === "win32" ? {} : { detached: true }),
    });
    let hasExited = false;
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      chunks.push(text);
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      chunks.push(text);
      process.stderr.write(text);
    });

    let startToken = null;
    void captureStartToken(child.pid).then((token) => {
      startToken = token;
    });

    let timedOut = false;
    let killResult = null;
    const budget = Math.min(timeoutMs, remainingBudget());
    const timer = setTimeout(() => {
      timedOut = true;
      killResult = killTracked({
        pid: child.pid,
        exitCode: child.exitCode,
        hasExited,
        capturedToken: startToken,
      });
    }, budget);

    child.once("error", (error) => {
      clearTimeout(timer);
      hasExited = true;
      chunks.push(`\n[run-lane] spawn error: ${error.message}\n`);
      resolve({
        label,
        code: 1,
        signal: null,
        timedOut,
        pid: child.pid ?? null,
        startToken,
        killResult,
        output: chunks.join(""),
      });
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      hasExited = true;
      resolve({
        label,
        code: code ?? 1,
        signal: signal ?? null,
        timedOut,
        pid: child.pid ?? null,
        startToken,
        killResult,
        output: chunks.join(""),
      });
    });
  });
}

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

// ── Evidence ────────────────────────────────────────────────────────────────

function sourceHashes() {
  const files = [
    ...walk(HERE),
    path.join(PROJECT_ROOT, "index.html"),
    path.join(PROJECT_ROOT, "package.json"),
    path.join(PROJECT_ROOT, "vite.config.ts"),
    path.join(PROJECT_ROOT, "firestore.rules"),
    path.join(PROJECT_ROOT, "src", "boot.tsx"),
    path.join(PROJECT_ROOT, "src", "mobile-entry.tsx"),
    path.join(PROJECT_ROOT, "src", "core", "config", "firebase.ts"),
    path.join(PROJECT_ROOT, "src", "features", "stores", "services", "storesService.ts"),
    path.join(PROJECT_ROOT, "src", "features", "menu", "services", "menuService.ts"),
  ].filter((file) => existsSync(file));

  return [...new Set(files)].map((file) => ({
    path: rel(file),
    bytes: statSync(file).size,
    sha256: sha256File(file),
  }));
}

function screenshotEvidence() {
  if (!existsSync(SCREENSHOTS_DIR)) return [];
  return readdirSync(SCREENSHOTS_DIR)
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => {
      const file = path.join(SCREENSHOTS_DIR, name);
      const bytes = readFileSync(file);
      return {
        file: `screenshots/${name}`,
        bytes: bytes.length,
        sha256: sha256(bytes),
        ...(pngSize(bytes) ?? {}),
      };
    });
}

function inspectReleaseBundle() {
  const dist = path.join(PROJECT_ROOT, "dist");
  if (!existsSync(dist)) {
    return { present: false, rebuiltByThisLane: false };
  }
  // Lane-specific markers only. `connectFirestoreEmulator` is a legitimate
  // Firebase SDK export that always exists in the vendor chunk, so it proves
  // nothing about our connector; the sentinels below do.
  const markers = [
    "EMULATOR ONLY",
    "EMULATOR TEST — synthetic data, not live",
    "demo-burgonomics-emulator",
    "__EMULATOR_LANE__",
    "emulator-lane-badge",
    "tests/emulator/emulator-entry",
  ];
  const files = walk(dist).filter((file) => /\.(js|mjs|html|css)$/i.test(file));
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const marker of markers) {
      if (text.includes(marker)) hits.push({ file: rel(file), marker });
    }
  }
  return {
    present: true,
    rebuiltByThisLane: false,
    freshReleaseProof: false,
    note: "Pre-existing dist inspected read-only. The final release gate owns the rebuild; this is not fresh-release proof.",
    filesScanned: files.length,
    markers,
    hits,
    clean: hits.length === 0,
  };
}

function inspectSourceImportGraph() {
  const sources = [
    ...walk(path.join(PROJECT_ROOT, "src")).filter((file) => /\.(ts|tsx|js|jsx)$/i.test(file)),
    path.join(PROJECT_ROOT, "index.html"),
  ].filter((file) => existsSync(file));

  const offenders = [];
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    if (/tests\/emulator|emulator-entry|connect-emulators/.test(text)) {
      offenders.push(rel(file));
    }
  }
  return {
    scanned: sources.length,
    offenders,
    clean: offenders.length === 0,
    note: "Release source must not import the lane entry/connector. dist is verified separately by the final build gate.",
  };
}

function writeReport(manifest) {
  const positive = manifest.phases.positive;
  const negative = manifest.negative;
  const gates = manifest.suiteGates ?? {};
  const positiveCounts = gates.positive?.counts;
  const inverted = gates.negativeInverted;
  const probe = gates.negativeProbe;
  const lines = [
    "# Phase 1 — Local Firestore emulator / guest catalog browser lane",
    "",
    "**Follow-up run (hardened acceptance gates). This is NOT whole Phase 1 green.**",
    "",
    `- Run started: ${manifest.startedAt}`,
    `- Run finished: ${manifest.finishedAt}`,
    `- Project: \`${manifest.projectId}\` @ \`${manifest.host}:${manifest.port}\``,
    `- Artifacts: \`${ARTIFACTS_DIR}\``,
    `- Lane entrypoint: \`node tests/emulator/run-lane.mjs\``,
    "",
    "## Result",
    "",
    `- Positive phase exit: **${positive?.exit ?? "not run"}**`,
    `- Negative phase exit: **${negative?.exit ?? "not run"}**${
      SKIP_NEGATIVE ? " (skipped by flag — NOT a full proof)" : ""
    }`,
    `- Positive suite gate: **${gates.positive?.ok ? "OK" : "FAIL"}** — expected ${positiveCounts?.expected ?? "?"}, skipped ${positiveCounts?.skipped ?? "?"}, failed ${positiveCounts?.unexpected ?? "?"}, flaky ${positiveCounts?.flaky ?? "?"}`,
    `- Negative probe gate: **${probe?.ok ? "OK" : "FAIL"}** (1 passing probe required)`,
    `- Inverted catalog gate: **${inverted?.ok ? "OK" : "FAIL"}** (exactly one intended assertion failure required)`,
    `- Overall: **${manifest.verdict}**`,
    "",
  ];

  if (gates.positive && !gates.positive.ok) {
    lines.push("Positive gate problems:", ...gates.positive.problems.map((p) => `- ${p}`), "");
  }
  if (inverted && !inverted.ok) {
    lines.push("Inverted gate problems:", ...inverted.problems.map((p) => `- ${p}`), "");
  }
  if (inverted?.failure) {
    lines.push(
      "## Intended inverted failure",
      "",
      `- Test: \`${inverted.failure.title}\` (\`${inverted.failure.file}\`, id \`${inverted.failure.testId ?? "?"}\`)`,
      `- Assertion: \`toHaveCount\` expected **${inverted.failure.expected}**, received **${inverted.failure.received}**`,
      `- Firestore backend-unavailable signature captured: **${inverted.signature?.backendUnavailable ?? false}**`,
      `- Loopback 8099 connection attempts: ${inverted.signature?.loopbackAttempts ?? 0}`,
      "",
    );
  }

  lines.push(
    "## Rules parity",
    "",
    "| copy | sha256 | bytes |",
    "|---|---|---|",
    `| \`${manifest.rules.customerPath}\` | \`${manifest.rules.customerSha256}\` | ${manifest.rules.bytes} |`,
    `| \`${manifest.rules.canonicalPath}\` | \`${manifest.rules.canonicalSha256}\` | — |`,
    "",
    `Parity: **${manifest.rules.parity}** · source: **${manifest.rules.source ?? "unknown"}**`,
    "",
    "## Seed (unauthenticated SDK read-back)",
    "",
    "| fact | value |",
    "|---|---|",
    `| stores | ${manifest.seed?.stores ?? "—"} |`,
    `| alpha products | ${manifest.seed?.alpha ?? "—"} |`,
    `| beta sentinels | ${manifest.seed?.beta ?? "—"} |`,
    `| alpha categories | 3 |`,
    `| out-of-stock | ${manifest.seed?.outOfStock ?? "—"} |`,
    `| guest write denied | ${manifest.seed?.guestWriteDenied ?? "—"} |`,
    "",
    "## Ports / teardown",
    "",
    `- Before: ${JSON.stringify(manifest.ports.before)}`,
    `- After: ${JSON.stringify(manifest.ports.after)}`,
    `- Firestore emulator also binds its own UI websocket on **9150** even with Firebase UI disabled; it is preflighted and verified free after teardown.`,
    `- Vite PIDs stopped: ${JSON.stringify(manifest.teardown.vitePids)}`,
    `- Vite port free after teardown: **${manifest.teardown.vitePortFree}**`,
    `- Firestore port free after teardown: **${manifest.teardown.emulatorPortFree}**`,
    `- Firestore UI websocket free after teardown: **${manifest.teardown.emulatorWsPortFree}**`,
    `- Kill identity: positive \`${manifest.teardown.identity?.positive}\`, negative \`${manifest.teardown.identity?.negative}\` (OS start token; no unknown PID killed)`,
    "",
    "## Browser network policy",
    "",
    `- Positive phase blocked non-loopback attempts: **${manifest.positiveNetwork?.blockedAttempts?.length ?? "missing"}**`,
    `- Positive phase CSP violations: **${manifest.positiveNetwork?.cspViolations?.length ?? "missing"}**`,
    `- Positive phase unique requests (all loopback): ${manifest.positiveNetwork?.uniqueRequests ?? "—"}`,
    `- Negative phase blocked attempts: ${manifest.negativeNetwork?.blockedAttempts?.length ?? "—"} (Closure probe only, tolerated)`,
    "",
    "## Child environment",
    "",
    `- Mode: **${manifest.env.mode}**; credential values copied: **${manifest.env.credentialValuesCopied}**`,
    `- Allowlisted OS keys: ${manifest.env.allowlistedKeys.join(", ")}`,
    `- Credential-bearing namespaces never read/copied: ${manifest.env.credentialKeysNeverRead.join(", ")}`,
    "",
    "## Screenshots (actual PNG bytes)",
    "",
    "| file | bytes | dimensions | sha256 |",
    "|---|---|---|---|",
    ...manifest.screenshots.map(
      (shot) =>
        `| ${shot.file} | ${shot.bytes} | ${shot.width ?? "?"}x${shot.height ?? "?"} | \`${shot.sha256.slice(0, 16)}…\` |`,
    ),
    "",
    "## Release-bundle checks (read-only)",
    "",
    `- Existing \`dist\` scanned: ${manifest.dist.present ? `${manifest.dist.filesScanned} files` : "absent"}`,
    `- Emulator markers in \`dist\`: ${manifest.dist.present ? JSON.stringify(manifest.dist.hits) : "n/a"}`,
    `- Fresh release proof: **${manifest.dist.freshReleaseProof ?? false}** (this lane never runs a production build)`,
    `- Source import-graph offenders: ${JSON.stringify(manifest.sourceGraph.offenders)}`,
    `- **Not done here:** no production build was run. The final release gate owns \`npm run build\`.`,
    "",
    "## Limitations",
    "",
    "- No Auth emulator (Phase 2, reserved 9098). Guest only; no OTP/SMS/real identity.",
    "- No payment/Razorpay, POS/Petpooja, FCM, Functions or Storage path is exercised.",
    "- Headless Chromium has no OS virtual keyboard: no keyboard-inset claim is made.",
    "- Google Fonts are stripped; font fidelity is not claimed.",
    `- Negative phase tolerated Closure connectivity probes (blocked by CSP, no project data): ${
      manifest.negativeNetwork?.allowedClosureProbes?.length ?? 0
    }. Only in the emulator-down phase; the positive phase tolerates none.`,
    "- This is NOT a live-catalog, production-data, or deploy proof.",
    "",
  );
  writeFileSync(path.join(ARTIFACTS_DIR, "report.md"), lines.join("\n"), "utf8");
}

function finishAndExit(code) {
  process.exit(code);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log(`artifacts: ${ARTIFACTS_DIR}`);
  await preflight();
  if (!CHILD_ENV) blocked("child environment was not constructed", 3);
  const env = CHILD_ENV;
  writeEffectiveConfig();

  const cliArgs = [
    state.preflight.firebaseCli,
    "emulators:exec",
    "--only",
    "firestore",
    "--project",
    PROJECT_ID,
    "--config",
    EFFECTIVE_CONFIG,
    `"${process.execPath}" "${LANE_SCRIPT}"`,
  ];

  log(`positive phase: firebase emulators:exec (java ${state.preflight.java.major}, jar ${state.preflight.jar.version})`);
  const positive = await runProcess("positive", process.execPath, cliArgs, {
    // Keep firebase-debug.log / firestore-debug.log OUT of the worktree.
    cwd: ARTIFACTS_DIR,
    env,
    timeoutMs: 420_000,
  });
  writeFileSync(path.join(RAWLOGS_DIR, "emulators.log"), positive.output, "utf8");

  const lanePositive = readJsonIfPresent(path.join(ARTIFACTS_DIR, "lane-result.json"));
  state.phases.positive = {
    exit: positive.code,
    signal: positive.signal,
    timedOut: positive.timedOut,
    startToken: positive.startToken,
    kill: positive.killResult,
    lane: lanePositive,
  };

  // Wait for the CLI-owned emulator to release its ports before the negative phase.
  let emulatorPortFree = false;
  let emulatorWsPortFree = false;
  for (let i = 0; i < 60; i += 1) {
    emulatorPortFree = await portIsFree(FIRESTORE_PORT);
    emulatorWsPortFree = await portIsFree(EMULATOR_WS_PORT);
    if (emulatorPortFree && emulatorWsPortFree) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const positiveOk =
    positive.code === 0 &&
    lanePositive?.playwrightExit === 0 &&
    lanePositive?.suiteGate?.ok === true &&
    lanePositive?.suiteGate?.counts?.expected === REQUIRED_POSITIVE_TESTS.length &&
    lanePositive?.suiteGate?.counts?.skipped === 0 &&
    lanePositive?.suiteGate?.counts?.unexpected === 0 &&
    lanePositive?.suiteGate?.counts?.flaky === 0 &&
    lanePositive?.vitePortFree === true &&
    lanePositive?.seed?.guestWriteDenied === true &&
    emulatorPortFree &&
    emulatorWsPortFree;

  if (!positiveOk) {
    state.problems.push("positive phase did not pass (exit, suite gate, seed or teardown)");
  }

  let negative = { exit: null, skipped: true, lane: null, timedOut: false };
  if (positiveOk && !SKIP_NEGATIVE) {
    log("negative phase: emulator down, Vite up, probe must pass and catalog must fail");
    const negativeRun = await runProcess(
      "negative",
      process.execPath,
      [LANE_SCRIPT, "--negative"],
      { cwd: ARTIFACTS_DIR, env, timeoutMs: 180_000 },
    );
    writeFileSync(path.join(RAWLOGS_DIR, "negative.log"), negativeRun.output, "utf8");
    negative = {
      exit: negativeRun.code,
      signal: negativeRun.signal,
      timedOut: negativeRun.timedOut,
      skipped: false,
      startToken: negativeRun.startToken,
      kill: negativeRun.killResult,
      lane: readJsonIfPresent(path.join(ARTIFACTS_DIR, "lane-result-negative.json")),
    };
    const negativeLane = negative.lane;
    const negativeGateOk =
      negativeRun.code === 0 &&
      negativeLane?.probeGate?.ok === true &&
      negativeLane?.invertedGate?.ok === true &&
      negativeLane?.vitePortFree === true &&
      negativeLane?.expectationMet === true;
    if (!negativeGateOk) state.problems.push("negative phase did not meet the intended-failure gate");
  } else if (!SKIP_NEGATIVE) {
    negative = { exit: null, skipped: true, reason: "positive phase failed", lane: null };
  }

  await checkPorts("after");

  const manifest = {
    lane: "phase1-emulator-browser",
    startedAt: new Date(RUN_STARTED).toISOString(),
    finishedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    host: "127.0.0.1",
    port: FIRESTORE_PORT,
    verdict: state.problems.length === 0 ? "PASS" : "FAIL",
    problems: state.problems,
    preflight: state.preflight,
    rules: state.preflight.rules,
    seed: lanePositive?.seed ?? null,
    phases: state.phases,
    negative,
    negativeNetwork: readJsonIfPresent(path.join(ARTIFACTS_DIR, "negative-network-proof.json")),
    positiveNetwork: readJsonIfPresent(path.join(ARTIFACTS_DIR, "network-proof-positive.json")),
    ports: state.ports,
    teardown: {
      vitePids: [lanePositive?.vitePid ?? null, negative.lane?.vitePid ?? null].filter(Boolean),
      vitePortFree: Boolean(lanePositive?.vitePortFree) && state.ports.after[VITE_PORT] === true,
      emulatorPortFree,
      emulatorWsPortFree,
      identity: {
        positive: lanePositive?.viteStartToken ? "os-start-token" : "degraded-exit-code-only",
        negative: negative.lane?.viteStartToken ? "os-start-token" : "degraded-exit-code-only",
        cliKill: positive.killResult ?? null,
        negativeKill: negative.kill ?? null,
      },
    },
    suiteGates: {
      positive: lanePositive?.suiteGate ?? null,
      negativeProbe: negative.lane?.probeGate ?? null,
      negativeInverted: negative.lane?.invertedGate ?? null,
    },
    screenshots: screenshotEvidence(),
    sources: sourceHashes(),
    dist: inspectReleaseBundle(),
    sourceGraph: inspectSourceImportGraph(),
    env: {
      mode: "allowlist",
      allowlistedKeys: CHILD_ENV_ALLOWLIST,
      synthesized: [
        "VITE_FIREBASE_* (demo project)",
        "VITE_APP_ENV=development",
        "VITE_ANALYTICS_ENABLED=false",
        "VITE_PUSH_ENABLED=false",
        "VITE_PETPOOJA_ENABLED=false",
        "EMULATOR_LANE_ARTIFACTS",
        "EMULATOR_CANONICAL_RULES",
      ],
      credentialValuesCopied: false,
      credentialKeysNeverRead: [
        "VITE_*",
        "FIREBASE_*",
        "FIRESTORE_*",
        "GOOGLE_*",
        "GCLOUD_*",
        "RAZORPAY_*",
        "PETPOOJA_*",
        "BORZO_*",
        "SHADOWFAX_*",
        "FCM_*",
        "SMTP_*",
        "TWILIO_*",
        "SENDGRID_*",
        "AWS_*",
        "AZURE_*",
      ],
      note: "Children receive only the allowlisted benign OS variables plus explicit synthetic demo values. Program access is limited to those allowlisted keys; credential-bearing values are not read, copied, logged or written to artifacts. FIRESTORE_EMULATOR_HOST in the positive child is set by firebase-tools for the demo emulator.",
    },
  };

  writeFileSync(
    path.join(ARTIFACTS_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  writeReport(manifest);

  log(`verdict: ${manifest.verdict} (positive=${positive.code}, negative=${negative.exit ?? "skipped"})`);
  log(`report: ${path.join(ARTIFACTS_DIR, "report.md")}`);
  process.exit(manifest.verdict === "PASS" ? 0 : 9);
}

main().catch((error) => {
  state.problems.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.stderr.write(`[run-lane] FAILED: ${error instanceof Error ? error.stack : String(error)}\n`);
  finishAndExit(9);
});
