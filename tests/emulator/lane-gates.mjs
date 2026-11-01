/**
 * EMULATOR TEST LANE — pure acceptance gates.
 *
 * No imports, no I/O, no browser, no network. `lane.mjs` uses these to decide
 * whether a Playwright run really proved the intended thing; `lane-gates.test.ts`
 * proves that generic failures, skips, blank pages and malformed/missing reports
 * are REJECTED (the old "exit code !== 0" / "exit code === 0" checks accepted
 * several of them).
 *
 * "Explicit gate coverage": the positive suite is matched against an exact title
 * list. Adding/removing/renaming a test makes the gate fail until this manifest is
 * updated deliberately — it cannot silently shrink to green.
 */

/** Exact titles of the 7 acceptance tests in `emulator-catalog.spec.ts`. */
export const REQUIRED_POSITIVE_TESTS = [
  "cold launch: guest / lands on /stores with exactly the two seeded stores",
  "store search filter: Alpha -> 1, EMULATOR ONLY -> 2, cleared -> 2",
  "Alpha menu: 3 derived categories, 48 items, every 8th sold out, beta absent",
  "alpha search: 'Test Burger 0' filters to burgers only and beta stays out",
  "beta store is isolated by restId: 3 sentinels and none of Alpha's menu",
  "geometry 320x568 and 375x812: real scroll, sticky search, no header overlap",
  "guest bootstrap makes no auth call, no push/service worker, no LAN traffic",
];

/** The one test the emulator-down inversion runs (`--grep "cold launch"`). */
export const NEGATIVE_INVERTED_TITLE =
  "cold launch: guest / lands on /stores with exactly the two seeded stores";

export const NEGATIVE_PROBE_TITLE =
  "unreachable emulator: no synthetic data, no production fallback, no external traffic";

export const CATALOG_FILE_SUFFIX = "emulator-catalog.spec.ts";
export const PROBE_FILE_SUFFIX = "negative-probe.spec.ts";

/** The exact assertion the inverted run is allowed to fail on. */
export const INTENDED_FAILURE = {
  matcher: "toHaveCount",
  locator: 'button[aria-label^="EMULATOR ONLY — Test Kitchen"]',
  expected: 2,
  received: 0,
};

const PRODUCTION_HOST =
  /(identitytoolkit|securetoken|firestore\.googleapis\.com|firebaseio\.com|cloudfunctions\.net|fcm\.googleapis\.com|razorpay\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/i;

/**
 * Reasons a "failure" is NOT evidence for the catalog gate. These are harness,
 * environment, auth/config, blank-page or whole-test-timeout failures.
 */
const FORBIDDEN_FAILURE_PATTERNS = [
  [/seed proof missing/i, "missing seed proof"],
  [/beforeAll hook|beforeEach hook|afterAll hook|afterEach hook/i, "hook failure"],
  [/Missing #app root|ConfigErrorScreen|FirebaseConfigMissingKeysError/i, "config/blank-page failure"],
  [/browserType\.launch|Executable doesn't exist|browser has been closed|Target page, context or browser has been closed/i, "browser launch failure"],
  [/Playwright Test did not expect|Cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError/i, "module/config load failure"],
  [/Test timeout of \d+ms exceeded/i, "whole-test timeout (not the intended assertion)"],
  [/page\.goto|ECONNREFUSED[^\n]*:5199|net::ERR_CONNECTION_REFUSED[^\n]*:5199/i, "Vite/page navigation failure"],
  [/sticky form|search input|header missing/i, "geometry harness failure"],
];

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function flattenSpecs(suites, out = []) {
  if (!Array.isArray(suites)) return out;
  for (const suite of suites) {
    if (!isObject(suite)) continue;
    if (Array.isArray(suite.specs)) out.push(...suite.specs);
    flattenSpecs(suite.suites, out);
  }
  return out;
}

function failureText(result) {
  const parts = [];
  if (isObject(result?.error) && typeof result.error.message === "string") {
    parts.push(result.error.message);
  }
  if (Array.isArray(result?.errors)) {
    for (const error of result.errors) {
      if (typeof error?.message === "string") parts.push(error.message);
    }
  }
  return parts.join("\n");
}

/** Playwright's JSON reporter keeps ANSI colour codes in `error.message`. */
export function stripAnsi(text) {
  return String(text).replace(/\u001B\[[0-9;]*[A-Za-z]/g, "");
}

function validateReportShape(report) {
  if (!isObject(report)) return "report is missing or not an object";
  if (!Array.isArray(report.suites)) return "report.suites is missing";
  if (!isObject(report.stats)) return "report.stats is missing";
  if (!Array.isArray(report.errors)) return "report.errors is missing";
  for (const key of ["expected", "skipped", "unexpected", "flaky"]) {
    if (typeof report.stats[key] !== "number") return `report.stats.${key} is not a number`;
  }
  return null;
}

function computeStats(specs) {
  const counts = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 };
  for (const spec of specs) {
    for (const test of spec.tests ?? []) {
      const status = test?.status;
      if (status === "expected") counts.expected += 1;
      else if (status === "skipped") counts.skipped += 1;
      else if (status === "unexpected") counts.unexpected += 1;
      else if (status === "flaky") counts.flaky += 1;
      else counts.unexpected += 1; // unknown outcome is never green
    }
  }
  return counts;
}

/**
 * Positive gate: exactly the required titles, all passed, none skipped/failed/
 * flaky, no retries, no top-level harness errors. Extra tests are rejected so a
 * future test needs explicit manifest coverage.
 */
export function classifyPositiveReport(report, options = {}) {
  const expectedTitles = options.expectedTitles ?? REQUIRED_POSITIVE_TESTS;
  const fileSuffix = options.fileSuffix ?? CATALOG_FILE_SUFFIX;
  const problems = [];

  const shapeError = validateReportShape(report);
  if (shapeError) {
    return {
      ok: false,
      problems: [shapeError],
      counts: { expected: 0, skipped: 0, unexpected: 0, flaky: 0, total: 0 },
      missingTitles: [...expectedTitles],
      extraTitles: [],
      skippedTitles: [],
      failedTitles: [],
      flakyTitles: [],
      specs: [],
    };
  }

  for (const error of report.errors) {
    problems.push(`top-level runner error: ${String(error?.message ?? error).slice(0, 300)}`);
  }

  const specs = flattenSpecs(report.suites);
  const counts = computeStats(specs);
  const total = specs.reduce((sum, spec) => sum + (spec.tests?.length ?? 0), 0);

  // The reported stats must agree with the actual test records; a hand-edited or
  // truncated report must not pass.
  for (const key of ["expected", "skipped", "unexpected", "flaky"]) {
    if (report.stats[key] !== counts[key]) {
      problems.push(`stats.${key}=${report.stats[key]} disagrees with report records (${counts[key]})`);
    }
  }

  const byTitle = new Map();
  for (const spec of specs) {
    const title = typeof spec?.title === "string" ? spec.title : "";
    const file = typeof spec?.file === "string" ? spec.file : "";
    if (!file.endsWith(fileSuffix)) {
      problems.push(`unexpected test file in run: ${file || "<empty>"}`);
    }
    if (byTitle.has(title)) problems.push(`duplicate test title: ${title}`);
    byTitle.set(title, spec);
  }

  const missingTitles = expectedTitles.filter((title) => !byTitle.has(title));
  const extraTitles = [...byTitle.keys()].filter((title) => !expectedTitles.includes(title));
  if (missingTitles.length > 0) problems.push(`missing required tests: ${JSON.stringify(missingTitles)}`);
  if (extraTitles.length > 0) {
    problems.push(
      `tests not covered by the gate manifest (add them explicitly): ${JSON.stringify(extraTitles)}`,
    );
  }

  const skippedTitles = [];
  const failedTitles = [];
  const flakyTitles = [];
  for (const title of expectedTitles) {
    const spec = byTitle.get(title);
    if (!spec) continue;
    const tests = spec.tests ?? [];
    if (tests.length !== 1) {
      problems.push(`"${title}" ran ${tests.length} times (expected exactly 1)`);
    }
    for (const test of tests) {
      if (test.status === "skipped") skippedTitles.push(title);
      else if (test.status === "flaky") flakyTitles.push(title);
      else if (test.status !== "expected") failedTitles.push(title);

      const results = test.results ?? [];
      if (results.length !== 1) {
        problems.push(`"${title}" produced ${results.length} results (retries are not allowed)`);
      }
      for (const result of results) {
        if (result.status !== "passed") {
          problems.push(`"${title}" result status is ${String(result.status)}`);
        }
        if ((result.retry ?? 0) > 0) problems.push(`"${title}" was retried`);
      }
    }
  }

  if (counts.skipped > 0) problems.push(`skipped tests are not a pass: ${JSON.stringify(skippedTitles)}`);
  if (counts.unexpected > 0) problems.push(`failed tests: ${JSON.stringify(failedTitles)}`);
  if (counts.flaky > 0) problems.push(`flaky tests: ${JSON.stringify(flakyTitles)}`);
  if (counts.expected !== expectedTitles.length) {
    problems.push(`expected ${expectedTitles.length} passing tests, observed ${counts.expected}`);
  }
  if (total !== expectedTitles.length) {
    problems.push(`expected ${expectedTitles.length} executed tests, observed ${total}`);
  }

  return {
    ok: problems.length === 0,
    problems,
    counts: { ...counts, total },
    missingTitles,
    extraTitles,
    skippedTitles,
    failedTitles,
    flakyTitles,
    specs: specs.map((spec) => ({
      title: spec.title,
      file: spec.file,
      id: spec.id,
      statuses: (spec.tests ?? []).map((test) => test.status),
    })),
  };
}

/**
 * Negative gate: the inverted catalog run must fail for exactly one reason — the
 * two seeded store cards are absent because the Firestore backend is unreachable —
 * and the browser must have recorded the backend-unavailable signature plus
 * loopback:8099 connection attempts.
 */
export function classifyNegativeReport({ report, networkProof, parseError, logText } = {}) {
  const problems = [];
  if (parseError) {
    return { ok: false, problems: [`report JSON unreadable: ${String(parseError)}`], failure: null, signature: null };
  }
  const shapeError = validateReportShape(report);
  if (shapeError) {
    return { ok: false, problems: [shapeError], failure: null, signature: null };
  }

  for (const error of report.errors) {
    problems.push(`top-level runner error: ${String(error?.message ?? error).slice(0, 300)}`);
  }

  const specs = flattenSpecs(report.suites);
  const counts = computeStats(specs);
  const total = specs.reduce((sum, spec) => sum + (spec.tests?.length ?? 0), 0);

  if (counts.unexpected !== 1) {
    problems.push(`expected exactly 1 failing test, observed ${counts.unexpected}`);
  }
  if (counts.expected !== 0) problems.push(`unexpected passing tests in the emulator-down run: ${counts.expected}`);
  if (counts.skipped !== 0) problems.push(`skipped tests are not a failure proof: ${counts.skipped}`);
  if (counts.flaky !== 0) problems.push(`flaky tests are not a failure proof: ${counts.flaky}`);
  if (total !== 1) problems.push(`expected exactly 1 executed test, observed ${total}`);

  const spec = specs[0];
  if (!spec) {
    problems.push("no test executed in the inverted run");
    return { ok: false, problems, failure: null, signature: null };
  }

  const file = typeof spec.file === "string" ? spec.file : "";
  if (!file.endsWith(CATALOG_FILE_SUFFIX)) problems.push(`wrong test file: ${file || "<empty>"}`);
  if (spec.title !== NEGATIVE_INVERTED_TITLE) {
    problems.push(`wrong test failed: ${JSON.stringify(spec.title)}`);
  }

  const test = (spec.tests ?? [])[0];
  const result = (test?.results ?? [])[0];
  // Strip reporter colour codes before matching: the real JSON contains
  // "Expected: \u001b[32m2\u001b[39m", not a plain "2".
  const message = stripAnsi(failureText(result));
  const statusOk = test?.status === "unexpected" && result?.status === "failed" && (result?.retry ?? 0) === 0;
  if (!statusOk) {
    problems.push(
      `failure status must be unexpected/failed with no retry (test=${String(test?.status)}, result=${String(result?.status)})`,
    );
  }

  const hasMatcher = /\btoHaveCount\b/.test(message);
  const hasLocator =
    message.includes(INTENDED_FAILURE.locator) ||
    message.includes(INTENDED_FAILURE.locator.replaceAll('"', '\\"'));
  const hasExpected = /Expected:\s*2\b/.test(message);
  const hasReceived = /Received:\s*0\b/.test(message);
  if (!hasMatcher) problems.push("failure is not the intended toHaveCount assertion");
  if (!hasLocator) problems.push("failure does not name the seeded store-card locator");
  if (!hasExpected) problems.push("failure does not say Expected: 2");
  if (!hasReceived) problems.push("failure does not say Received: 0");

  for (const [pattern, label] of FORBIDDEN_FAILURE_PATTERNS) {
    if (pattern.test(message)) problems.push(`failure matches forbidden ${label}`);
  }

  // The failure must be corroborated by the browser evidence, not just the message.
  if (!isObject(networkProof)) {
    problems.push("missing browser network proof for the inverted run");
  } else {
    if (networkProof.phase !== "negative-inverted") {
      problems.push(`network proof phase is ${String(networkProof.phase)}, expected negative-inverted`);
    }
    if (networkProof.tests !== 1) problems.push(`network proof recorded ${String(networkProof.tests)} tests`);
    const blocked = Array.isArray(networkProof.blockedAttempts) ? networkProof.blockedAttempts : [];
    const nonProbe = blocked.filter(
      (attempt) =>
        !(
          attempt?.resourceType === "image" &&
          /^https?:\/\/www\.google\.com\/images\/cleardot\.gif(?:\?|$)/.test(String(attempt?.url))
        ),
    );
    if (nonProbe.length > 0) {
      problems.push(`blocked non-probe attempts: ${JSON.stringify(nonProbe.slice(0, 3))}`);
    }
    const requests = Array.isArray(networkProof.requests) ? networkProof.requests : [];
    const loopbackAttempts = requests.filter((url) => /^https?:\/\/127\.0\.0\.1:8099(?:[/?]|$)/.test(url));
    if (loopbackAttempts.length === 0) {
      problems.push("no loopback:8099 connection attempt was recorded");
    }
    const production = requests.filter((url) => PRODUCTION_HOST.test(url));
    if (production.length > 0) {
      problems.push(`production host contacted: ${JSON.stringify(production.slice(0, 3))}`);
    }
    const consoleMessages = Array.isArray(networkProof.consoleMessages) ? networkProof.consoleMessages : [];
    const pageErrors = Array.isArray(networkProof.pageErrors) ? networkProof.pageErrors : [];
    const backendUnavailable = consoleMessages.some((text) =>
      /Could not reach Cloud Firestore backend|code=unavailable|Connection failed/i.test(text),
    );
    if (!backendUnavailable) {
      problems.push("missing captured Firestore backend-unavailable signature");
    }
    const harnessError = [...consoleMessages, ...pageErrors].find((text) =>
      /ConfigErrorScreen|Missing #app root|FirebaseConfigMissingKeysError|seed proof missing/i.test(text),
    );
    if (harnessError) problems.push(`harness/config error in browser evidence: ${String(harnessError).slice(0, 200)}`);
  }

  if (typeof logText === "string" && logText.trim().length === 0) {
    problems.push("inverted run produced no captured output");
  }

  return {
    ok: problems.length === 0,
    problems,
    failure: {
      title: spec.title,
      file,
      testId: spec.id,
      messageExcerpt: message.slice(0, 600),
      expected: INTENDED_FAILURE.expected,
      received: INTENDED_FAILURE.received,
    },
    signature: isObject(networkProof)
      ? {
          backendUnavailable: Array.isArray(networkProof.consoleMessages)
            ? networkProof.consoleMessages.some((text) =>
                /Could not reach Cloud Firestore backend|code=unavailable|Connection failed/i.test(text),
              )
            : false,
          loopbackAttempts: Array.isArray(networkProof.requests)
            ? networkProof.requests.filter((url) => /^https?:\/\/127\.0\.0\.1:8099(?:[/?]|$)/.test(url)).length
            : 0,
        }
      : null,
  };
}

/**
 * Geometry gate: the visible input midpoint must hit the input or a descendant.
 * `hitInsideForm` alone is NOT enough (a sibling overlay inside the form would
 * satisfy it); `legacyWouldPass` records exactly that weaker old condition.
 */
export function classifyStickyHits(measurement) {
  if (!isObject(measurement)) {
    return { ok: false, problems: ["missing sticky measurement"], legacyWouldPass: false };
  }
  const problems = [];
  if (measurement.formPosition !== "sticky") {
    problems.push(`search form position is ${String(measurement.formPosition)}, expected sticky`);
  }
  if (!measurement.hitInsideForm) {
    problems.push("elementFromPoint at the input midpoint is outside the sticky form");
  }
  if (!measurement.hitIsInput) {
    problems.push("elementFromPoint at the input midpoint is not the search input or a descendant");
  }
  if (!measurement.focused) problems.push("search input is not focused");
  return {
    ok: problems.length === 0,
    problems,
    legacyWouldPass: Boolean(measurement.hitInsideForm),
    hitTag: measurement.hitTag ?? null,
    hitAriaLabel: measurement.hitAriaLabel ?? null,
  };
}

/**
 * Kill safety: only signal a live, identity-verified child. Never issue taskkill
 * for an exited child (a recycled PID would kill an unrelated tree).
 */
export function decideKill({ exitCode, capturedToken, observedToken } = {}) {
  if (exitCode !== null && exitCode !== undefined) {
    return { kill: false, reason: "child-already-exited", mode: "none" };
  }
  if (capturedToken && observedToken && capturedToken !== observedToken) {
    return { kill: false, reason: "pid-reuse-detected", mode: "token-verified" };
  }
  if (capturedToken && !observedToken) {
    return { kill: false, reason: "process-gone", mode: "token-verified" };
  }
  return {
    kill: true,
    reason: capturedToken ? "identity-verified" : "identity-token-unavailable",
    mode: capturedToken ? "token-verified" : "exit-code-only",
  };
}
