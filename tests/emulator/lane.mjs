/**
 * EMULATOR TEST LANE — in-exec orchestrator.
 *
 * Runs INSIDE `firebase emulators:exec` (positive mode) or standalone with
 * `--negative` after the emulator has been torn down. It owns exactly the child
 * processes it spawns (Vite, Playwright, seed) and signals only those, only while
 * alive and OS-identity-verified.
 *
 * Positive: rules parity -> seed -> Vite -> Playwright catalog spec -> JSON gate.
 * Negative: Vite only -> probe must PASS -> catalog spec must FAIL FOR THE
 * INTENDED REASON (parsed from the Playwright JSON + browser evidence).
 *
 * Writes `lane-result.json` / `lane-result-negative.json` + `rawlogs/*.log`.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  NEGATIVE_PROBE_TITLE,
  REQUIRED_POSITIVE_TESTS,
  classifyNegativeReport,
  classifyPositiveReport,
} from "./lane-gates.mjs";
import { captureStartToken, killTracked } from "./process-identity.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "../..");

const ARTIFACTS_DIR =
  process.env.EMULATOR_LANE_ARTIFACTS ??
  path.join(os.tmpdir(), "opencode", "phase1-emulator-browser");
const RAWLOGS_DIR = path.join(ARTIFACTS_DIR, "rawlogs");

const EXPECTED_HOST_PORT = "127.0.0.1:8099";
const NEGATIVE = process.argv.includes("--negative");

const CANONICAL_RULES_PATH =
  process.env.EMULATOR_CANONICAL_RULES ??
  path.resolve(PROJECT_ROOT, "..", "polish-backend-20261025", "firestore.rules");

const CUSTOMER_RULES_PATH = path.join(PROJECT_ROOT, "firestore.rules");
const SEED_PROOF_PATH = path.join(ARTIFACTS_DIR, "seed-proof.json");
const VITE_LOG = path.join(RAWLOGS_DIR, "vite.log");

function log(message) {
  process.stdout.write(`[lane] ${message}\n`);
}

function fail(message, code = 1) {
  process.stderr.write(`[lane] FAILED: ${message}\n`);
  process.exit(code);
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

async function verifyRulesParity() {
  if (!existsSync(CUSTOMER_RULES_PATH)) {
    fail(`customer rules missing: ${CUSTOMER_RULES_PATH}`, 3);
  }
  if (!existsSync(CANONICAL_RULES_PATH)) {
    fail(
      `BLOCKED: canonical backend rules not found at ${CANONICAL_RULES_PATH}. ` +
        "Set EMULATOR_CANONICAL_RULES (never silently skip the parity gate).",
      3,
    );
  }
  const [customer, canonical] = await Promise.all([
    sha256(CUSTOMER_RULES_PATH),
    sha256(CANONICAL_RULES_PATH),
  ]);
  if (customer !== canonical) {
    fail(`rules divergence: customer ${customer} != canonical ${canonical}`, 4);
  }
  return {
    customer,
    canonical,
    customerPath: CUSTOMER_RULES_PATH,
    canonicalPath: CANONICAL_RULES_PATH,
    source: process.env.EMULATOR_CANONICAL_RULES ? "env" : "default-peer-worktree",
  };
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function waitForPortFree(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portIsFree(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return portIsFree(port);
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return true;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Vite did not become ready at ${url}: ${lastError}`);
}

function spawnLogged(command, args, { cwd, env, logFile }) {
  const chunks = [];
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    ...(process.platform === "win32" ? {} : { detached: true }),
  });
  let hasExited = false;
  const record = (chunk) => {
    const text = chunk.toString();
    chunks.push(text);
    process.stdout.write(`[${path.basename(logFile ?? "child")}] ${text}`);
  };
  child.stdout?.on("data", record);
  child.stderr?.on("data", record);
  const exited = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      hasExited = true;
      resolve({ code: code ?? 1, signal });
    });
    child.once("error", (error) => {
      hasExited = true;
      resolve({ code: 1, signal: null, error });
    });
  });

  const handle = {
    child,
    exited,
    hasExited: () => hasExited,
    output: () => chunks.join(""),
    startToken: null,
  };
  // Capture the OS start-time identity in the background; a fast exit yields null
  // and the kill decision degrades to the exit-code guard (recorded in the result).
  void captureStartToken(child.pid).then((token) => {
    handle.startToken = token;
  });
  return handle;
}

async function startVite() {
  const viteBin = path.join(PROJECT_ROOT, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) {
    fail(`vite CLI missing at ${viteBin} (test dependency must already be installed)`, 5);
  }
  await mkdir(RAWLOGS_DIR, { recursive: true });
  const child = spawnLogged(
    process.execPath,
    [
      viteBin,
      "--config",
      path.join(HERE, "vite.emulator.config.ts"),
      "--mode",
      "emulator",
    ],
    { cwd: PROJECT_ROOT, env: process.env, logFile: VITE_LOG },
  );

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.hasExited()) {
      await writeFile(VITE_LOG, child.output(), "utf8").catch(() => undefined);
      throw new Error("Vite exited before becoming ready");
    }
    try {
      await waitForHttp("http://127.0.0.1:5199/", 2_000);
      // Give the plugin transform a moment to be served consistently.
      await new Promise((resolve) => setTimeout(resolve, 500));
      return child;
    } catch {
      /* retry until the outer deadline */
    }
  }

  const kill = killTracked({
    pid: child.child.pid,
    exitCode: child.child.exitCode,
    hasExited: child.hasExited(),
    capturedToken: child.startToken,
  });
  await writeFile(VITE_LOG, child.output(), "utf8").catch(() => undefined);
  throw new Error(`Vite did not start on 127.0.0.1:5199 within 60s (kill=${JSON.stringify(kill)})`);
}

async function stopVite(vite) {
  if (!vite) return { portFree: true, pid: null, kill: null };
  const kill = killTracked({
    pid: vite.child.pid,
    exitCode: vite.child.exitCode,
    hasExited: vite.hasExited(),
    capturedToken: vite.startToken,
  });
  await Promise.race([vite.exited, new Promise((resolve) => setTimeout(resolve, 8_000))]);
  await writeFile(VITE_LOG, vite.output(), "utf8").catch(() => undefined);
  const portFree = await waitForPortFree(5199);
  return { portFree, pid: vite.child.pid ?? null, kill };
}

function specArg(name) {
  // Playwright CLI args are regexes matched against test paths; an absolute
  // Windows path contains "\" escapes and ":" and matches nothing. Use a
  // relative POSIX path from the cwd we spawn Playwright in (PROJECT_ROOT).
  return path.relative(PROJECT_ROOT, path.join(HERE, name)).split(path.sep).join("/");
}

function runPlaywright(specArgs, phase) {
  const cli = require.resolve("@playwright/test/cli");
  const args = [
    cli,
    "test",
    "-c",
    path.join(HERE, "playwright.emulator.config.ts"),
    ...specArgs,
    // No --reporter here: it would override the config's list + JSON reporters,
    // and the JSON report is what the acceptance gates parse.
  ];
  const child = spawnLogged(process.execPath, args, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      EMULATOR_LANE_ARTIFACTS: ARTIFACTS_DIR,
      EMULATOR_LANE_PHASE: phase,
      // Negative phase only: tolerate the SDK's blocked Closure connectivity
      // image probe after transport failure. Production hosts still fail.
      EMULATOR_LANE_ALLOW_CLOSURE_PROBE: NEGATIVE ? "1" : "0",
    },
    logFile: path.join(RAWLOGS_DIR, `playwright-${phase}.log`),
  });
  return child;
}

async function readSeedProof() {
  const raw = await readFile(SEED_PROOF_PATH, "utf8");
  return JSON.parse(raw);
}

/** Read + parse a JSON artifact without throwing; parse failures are gate input. */
async function readJsonResult(filePath) {
  try {
    return { value: JSON.parse(await readFile(filePath, "utf8")), error: null, path: filePath };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
      path: filePath,
    };
  }
}

function attachReportError(gate, report) {
  if (report.error) {
    gate.ok = false;
    gate.problems = [...gate.problems, `report unreadable: ${report.error}`];
  }
  return gate;
}

async function positive() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== EXPECTED_HOST_PORT) {
    fail(
      `FIRESTORE_EMULATOR_HOST is "${process.env.FIRESTORE_EMULATOR_HOST ?? "<unset>"}", ` +
        `expected ${EXPECTED_HOST_PORT}. Refusing to seed/verify against an unknown target.`,
      6,
    );
  }

  const rules = await verifyRulesParity();
  log(`rules parity OK ${rules.customer.slice(0, 12)}… (${rules.source})`);

  const seed = spawnSync(process.execPath, [path.join(HERE, "seed.mjs")], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: "utf8",
    timeout: 120_000,
  });
  await mkdir(RAWLOGS_DIR, { recursive: true });
  await writeFile(path.join(RAWLOGS_DIR, "seed.log"), `${seed.stdout ?? ""}${seed.stderr ?? ""}`);
  if (seed.error || seed.status !== 0) {
    fail(`seed failed (status=${seed.status}, error=${seed.error?.message ?? "none"}). See rawlogs/seed.log`, 7);
  }
  const proof = await readSeedProof();
  log(
    `seed proof stores=${proof.guestReadProof.stores} alpha=${proof.guestReadProof.alpha} ` +
      `beta=${proof.guestReadProof.beta} outOfStock=${proof.alpha.outOfStockCount}`,
  );

  const vite = await startVite();
  log(`vite ready pid=${vite.child.pid ?? "?"} identity=${vite.startToken ? "os-token" : "degraded"}`);

  const playwright = runPlaywright([specArg("emulator-catalog.spec.ts")], "positive");
  const result = await playwright.exited;
  await writeFile(
    path.join(RAWLOGS_DIR, "playwright-positive.log"),
    playwright.output(),
    "utf8",
  ).catch(() => undefined);

  const report = await readJsonResult(path.join(ARTIFACTS_DIR, "playwright-positive.json"));
  const suiteGate = attachReportError(
    classifyPositiveReport(report.value, {
      expectedTitles: REQUIRED_POSITIVE_TESTS,
      fileSuffix: "emulator-catalog.spec.ts",
    }),
    report,
  );

  const teardown = await stopVite(vite);
  log(
    `vite stopped pid=${teardown.pid ?? "?"} portFree=${teardown.portFree} ` +
      `kill=${JSON.stringify(teardown.kill)}`,
  );

  const passed = result.code === 0 && suiteGate.ok && teardown.portFree;
  await writeFile(
    path.join(ARTIFACTS_DIR, "lane-result.json"),
    `${JSON.stringify(
      {
        mode: "positive",
        finishedAt: new Date().toISOString(),
        rules,
        seed: {
          exit: seed.status,
          stores: proof.guestReadProof.stores,
          alpha: proof.guestReadProof.alpha,
          beta: proof.guestReadProof.beta,
          outOfStock: proof.alpha.outOfStockCount,
          guestWriteDenied: proof.guestReadProof.guestWriteDenied,
        },
        vitePid: vite.child.pid ?? null,
        viteStartToken: vite.startToken,
        viteKill: teardown.kill,
        vitePortFree: teardown.portFree,
        playwrightExit: result.code,
        playwrightSignal: result.signal ?? null,
        suiteGate: {
          ok: suiteGate.ok,
          problems: suiteGate.problems,
          counts: suiteGate.counts,
          missingTitles: suiteGate.missingTitles,
          extraTitles: suiteGate.extraTitles,
          skippedTitles: suiteGate.skippedTitles,
          failedTitles: suiteGate.failedTitles,
          flakyTitles: suiteGate.flakyTitles,
          reportPath: report.path,
          reportParseError: report.error,
        },
        passed,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (!teardown.portFree) fail("Vite port 5199 still busy after teardown", 8);
  if (!suiteGate.ok) {
    fail(`positive suite gate rejected the run: ${suiteGate.problems.join("; ")}`, 10);
  }
  process.exit(result.code === 0 ? 0 : 9);
}

async function negative() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    fail(
      "negative phase must run with the emulator stopped, but FIRESTORE_EMULATOR_HOST is set — " +
        "the fail-closed proof would be invalid.",
      6,
    );
  }

  const vite = await startVite();
  log(`vite ready (emulator down) pid=${vite.child.pid ?? "?"}`);

  const probeRun = runPlaywright([specArg("negative-probe.spec.ts")], "negative-probe");
  const probe = await probeRun.exited;
  await writeFile(
    path.join(RAWLOGS_DIR, "playwright-negative-probe.log"),
    probeRun.output(),
    "utf8",
  ).catch(() => undefined);
  const probeReport = await readJsonResult(
    path.join(ARTIFACTS_DIR, "playwright-negative-probe.json"),
  );
  const probeGate = attachReportError(
    classifyPositiveReport(probeReport.value, {
      expectedTitles: [NEGATIVE_PROBE_TITLE],
      fileSuffix: "negative-probe.spec.ts",
    }),
    probeReport,
  );
  log(`negative probe exit=${probe.code} gate=${probeGate.ok} counts=${JSON.stringify(probeGate.counts)}`);

  // The real catalogue spec MUST fail without the emulator — and only for the
  // intended card-count reason, corroborated by the browser's own evidence.
  // 45s budget: the intended toHaveCount assertion fails at 15s; a whole-test
  // timeout must never be the thing that fails (the gate rejects that).
  const inverted = runPlaywright(
    [specArg("emulator-catalog.spec.ts"), "--grep", "cold launch", "--timeout", "45000"],
    "negative-inverted",
  );
  const invertedResult = await inverted.exited;
  const invertedOutput = inverted.output();
  await writeFile(
    path.join(RAWLOGS_DIR, "playwright-negative-inverted.log"),
    invertedOutput,
    "utf8",
  ).catch(() => undefined);

  const invertedReport = await readJsonResult(
    path.join(ARTIFACTS_DIR, "playwright-negative-inverted.json"),
  );
  const networkProof = await readJsonResult(
    path.join(ARTIFACTS_DIR, "network-proof-negative-inverted.json"),
  );
  const invertedGate = classifyNegativeReport({
    report: invertedReport.value,
    parseError: invertedReport.error,
    networkProof: networkProof.value,
    logText: invertedOutput,
  });
  log(`inverted catalog exit=${invertedResult.code} gate=${invertedGate.ok}`);
  if (!invertedGate.ok) log(`inverted gate problems: ${invertedGate.problems.join("; ")}`);

  const teardown = await stopVite(vite);
  log(`vite stopped pid=${teardown.pid ?? "?"} portFree=${teardown.portFree}`);

  const observed =
    probe.code === 0 &&
    probeGate.ok &&
    invertedResult.code !== 0 &&
    invertedGate.ok &&
    teardown.portFree;

  await writeFile(
    path.join(ARTIFACTS_DIR, "lane-result-negative.json"),
    `${JSON.stringify(
      {
        mode: "negative",
        finishedAt: new Date().toISOString(),
        negativeProbeExit: probe.code,
        probeGate,
        invertedCatalogExit: invertedResult.code,
        invertedCatalogMustFail: true,
        invertedGate,
        expectationMet: observed,
        vitePid: vite.child.pid ?? null,
        viteStartToken: vite.startToken,
        viteKill: teardown.kill,
        vitePortFree: teardown.portFree,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  process.exit(observed ? 0 : 9);
}

if (NEGATIVE) {
  negative().catch((error) => fail(error instanceof Error ? error.stack : String(error)));
} else {
  positive().catch((error) => fail(error instanceof Error ? error.stack : String(error)));
}
