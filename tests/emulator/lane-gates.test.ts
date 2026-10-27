/**
 * UNIT — pure acceptance-gate classification. No browser, no emulator, no I/O.
 *
 * Several cases assert that the OLD conditions (`negative exit !== 0`,
 * `positive exit === 0`, `form.contains(hit)`) accepted the bad input while the
 * hardened gates reject it. That is the RED→GREEN proof for M1/M2.
 */
import { describe, expect, it } from "vitest";

import {
  NEGATIVE_INVERTED_TITLE,
  NEGATIVE_PROBE_TITLE,
  REQUIRED_POSITIVE_TESTS,
  classifyNegativeReport,
  classifyPositiveReport,
  classifyStickyHits,
  decideKill,
  stripAnsi,
} from "./lane-gates.mjs";

// Mirrors the real reporter output, including ANSI colour codes around the counts.
const INTENDED_MESSAGE = `Error: \u001b[2mexpect(\u001b[22m\u001b[31mlocator\u001b[39m\u001b[2m).\u001b[22mtoHaveCount\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m)\u001b[22m failed

Locator:  locator('button[aria-label^="EMULATOR ONLY — Test Kitchen"]')
Expected: \u001b[32m2\u001b[39m
Received: \u001b[31m0\u001b[39m
Timeout:  15000ms

Call log:
  - Expect "toHaveCount" locator('button[aria-label^="EMULATOR ONLY — Test Kitchen"]') with timeout 15000ms
  - waiting for locator('button[aria-label^="EMULATOR ONLY — Test Kitchen"]')
    33 × locator resolved to 0 elements
`;

const CLOSURE_PROBE = {
  url: "https://www.google.com/images/cleardot.gif?zx=probe",
  resourceType: "image",
  reason: "requestfailed: csp",
};

function spec(
  title: string,
  options: {
    status?: string;
    error?: string;
    file?: string;
    id?: string;
    resultCount?: number;
    resultStatus?: string;
  } = {},
) {
  const status = options.status ?? "expected";
  const resultStatus =
    options.resultStatus ?? (status === "expected" ? "passed" : status === "skipped" ? "skipped" : "failed");
  const resultCount = options.resultCount ?? 1;
  return {
    title,
    file: options.file ?? "emulator-catalog.spec.ts",
    id: options.id ?? `id-${title.slice(0, 12)}`,
    tests: [
      {
        status,
        results: Array.from({ length: resultCount }, (_, index) => ({
          status: index === resultCount - 1 ? resultStatus : "failed",
          retry: index,
          error: options.error ? { message: options.error } : undefined,
        })),
      },
    ],
  };
}

type AnySpec = ReturnType<typeof spec>;

function report(specs: AnySpec[], overrides: Record<string, number> = {}, errors: Array<{ message: string }> = []) {
  const counts: Record<string, number> = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 };
  for (const item of specs) {
    for (const test of item.tests) counts[test.status] = (counts[test.status] ?? 0) + 1;
  }
  return {
    suites: [{ title: "emulator-catalog.spec.ts", specs }],
    stats: { ...counts, ...overrides },
    errors,
  };
}

function validPositive() {
  return report(REQUIRED_POSITIVE_TESTS.map((title) => spec(title)));
}

function negativeProof(overrides: Record<string, unknown> = {}) {
  return {
    phase: "negative-inverted",
    tests: 1,
    blockedAttempts: [CLOSURE_PROBE],
    allowedClosureProbes: [CLOSURE_PROBE.url],
    requests: [
      "http://127.0.0.1:5199/",
      "http://127.0.0.1:8099/google.firestore.v1.Firestore/Listen/channel?VER=8",
      "http://127.0.0.1:8099/google.firestore.v1.Firestore/Write/channel?VER=8",
    ],
    consoleMessages: [
      "@firebase/firestore: Firestore (12.19.0): Could not reach Cloud Firestore backend. Connection failed 1 times. Most recent error: FirebaseError: [code=unavailable]",
    ],
    pageErrors: [],
    ...overrides,
  };
}

function validInverted() {
  return report([spec(NEGATIVE_INVERTED_TITLE, { status: "unexpected", error: INTENDED_MESSAGE })]);
}

// Old, weaker conditions the review flagged.
const legacyNegativeAccepted = (exitCode: number) => exitCode !== 0;
const legacyPositiveAccepted = (exitCode: number) => exitCode === 0;

describe("positive suite gate", () => {
  it("accepts exactly the 7 required passing tests", () => {
    const gate = classifyPositiveReport(validPositive());
    expect(gate.ok, gate.problems.join("; ")).toBe(true);
    expect(gate.counts).toMatchObject({ expected: 7, skipped: 0, unexpected: 0, flaky: 0, total: 7 });
  });

  it("RED: the old exit-code check accepted a skipped suite; the gate rejects it", () => {
    const skippedTitle = REQUIRED_POSITIVE_TESTS[3];
    const suite = report(
      REQUIRED_POSITIVE_TESTS.map((title) =>
        spec(title, title === skippedTitle ? { status: "skipped", resultStatus: "skipped" } : {}),
      ),
      { expected: 6, skipped: 1 },
    );
    expect(legacyPositiveAccepted(0)).toBe(true);
    const gate = classifyPositiveReport(suite);
    expect(gate.ok).toBe(false);
    expect(gate.skippedTitles).toContain(skippedTitle);
  });

  it("rejects a failed test", () => {
    const failing = REQUIRED_POSITIVE_TESTS[0];
    const suite = report(
      REQUIRED_POSITIVE_TESTS.map((title) =>
        spec(title, title === failing ? { status: "unexpected", error: "expect(x).toBe(y) failed" } : {}),
      ),
      { expected: 6, unexpected: 1 },
    );
    expect(classifyPositiveReport(suite).ok).toBe(false);
  });

  it("rejects a flaky/retried test", () => {
    const flaky = REQUIRED_POSITIVE_TESTS[1];
    const suite = report(
      REQUIRED_POSITIVE_TESTS.map((title) =>
        spec(title, title === flaky ? { status: "flaky", resultCount: 2, resultStatus: "passed" } : {}),
      ),
      { expected: 6, flaky: 1 },
    );
    expect(classifyPositiveReport(suite).ok).toBe(false);
  });

  it("rejects a missing required test (suite shrunk)", () => {
    const suite = report(REQUIRED_POSITIVE_TESTS.slice(0, 6).map((title) => spec(title)), { expected: 6 });
    const gate = classifyPositiveReport(suite);
    expect(gate.ok).toBe(false);
    expect(gate.missingTitles).toEqual([REQUIRED_POSITIVE_TESTS[6]]);
  });

  it("rejects an extra test that is not in the gate manifest (explicit coverage)", () => {
    const suite = report([...REQUIRED_POSITIVE_TESTS.map((title) => spec(title)), spec("a future test")], {
      expected: 8,
    });
    const gate = classifyPositiveReport(suite);
    expect(gate.ok).toBe(false);
    expect(gate.extraTitles).toEqual(["a future test"]);
  });

  it("rejects duplicate titles", () => {
    const suite = report([...REQUIRED_POSITIVE_TESTS.map((title) => spec(title)), spec(REQUIRED_POSITIVE_TESTS[0])], {
      expected: 8,
    });
    expect(classifyPositiveReport(suite).ok).toBe(false);
  });

  it("rejects a wrong test file", () => {
    const suite = report(
      REQUIRED_POSITIVE_TESTS.map((title) => spec(title, { file: "tests/emulator/other.spec.ts" })),
    );
    expect(classifyPositiveReport(suite).ok).toBe(false);
  });

  it("rejects top-level runner errors and malformed/missing reports", () => {
    expect(classifyPositiveReport(null).ok).toBe(false);
    expect(classifyPositiveReport({}).ok).toBe(false);
    expect(classifyPositiveReport(validPositive())).toBeTruthy();
    const withError = validPositive();
    withError.errors = [{ message: "browserType.launch: Executable doesn't exist" }];
    expect(classifyPositiveReport(withError).ok).toBe(false);
  });

  it("rejects stats that disagree with the actual test records", () => {
    const suite = validPositive();
    suite.stats.expected = 9;
    expect(classifyPositiveReport(suite).ok).toBe(false);
  });

  it("classifies the probe spec title independently", () => {
    const gate = classifyPositiveReport(report([spec(NEGATIVE_PROBE_TITLE, { file: "negative-probe.spec.ts" })]), {
      expectedTitles: [NEGATIVE_PROBE_TITLE],
      fileSuffix: "negative-probe.spec.ts",
    });
    expect(gate.ok, gate.problems.join("; ")).toBe(true);
  });
});

describe("negative inverted gate", () => {
  it("accepts the intended single card-count failure with backend-unavailable evidence", () => {
    const gate = classifyNegativeReport({
      report: validInverted(),
      networkProof: negativeProof(),
      logText: "Running 1 test…",
    });
    expect(gate.ok, gate.problems.join("; ")).toBe(true);
    expect(gate.failure).toMatchObject({ expected: 2, received: 0, title: NEGATIVE_INVERTED_TITLE });
    expect(gate.signature).toMatchObject({ backendUnavailable: true });
  });

  it("RED: old `exit !== 0` accepted a generic timeout; the gate rejects it", () => {
    const generic = report([
      spec(NEGATIVE_INVERTED_TITLE, {
        status: "unexpected",
        error: "Test timeout of 25000ms exceeded.",
      }),
    ]);
    expect(legacyNegativeAccepted(1)).toBe(true);
    const gate = classifyNegativeReport({ report: generic, networkProof: negativeProof(), logText: "x" });
    expect(gate.ok).toBe(false);
    expect(gate.problems.join("; ")).toMatch(/toHaveCount/);
  });

  it("rejects a harness/config/blank-page failure even if the card text appears", () => {
    for (const suffix of [
      "Error: Missing #app root element",
      "FirebaseConfigMissingKeysError: [Firebase] Missing required environment variables",
      "browserType.launch: Executable doesn't exist at C:\\browsers\\chromium",
      "Error: seed proof missing at …",
    ]) {
      const harness = report([
        spec(NEGATIVE_INVERTED_TITLE, { status: "unexpected", error: `${INTENDED_MESSAGE}\n${suffix}` }),
      ]);
      const gate = classifyNegativeReport({ report: harness, networkProof: negativeProof(), logText: "x" });
      expect(gate.ok, `should reject: ${suffix}`).toBe(false);
    }
  });

  it("rejects the wrong test failing", () => {
    const wrong = report([
      spec("store search filter: Alpha -> 1, EMULATOR ONLY -> 2, cleared -> 2", {
        status: "unexpected",
        error: INTENDED_MESSAGE,
      }),
    ]);
    expect(classifyNegativeReport({ report: wrong, networkProof: negativeProof(), logText: "x" }).ok).toBe(false);
  });

  it("rejects a passing run, skipped run, or more than one failure", () => {
    const passing = report([spec(NEGATIVE_INVERTED_TITLE)]);
    expect(classifyNegativeReport({ report: passing, networkProof: negativeProof(), logText: "x" }).ok).toBe(false);

    const skipped = report([spec(NEGATIVE_INVERTED_TITLE, { status: "skipped", resultStatus: "skipped" })], {
      expected: 0,
      skipped: 1,
    });
    expect(classifyNegativeReport({ report: skipped, networkProof: negativeProof(), logText: "x" }).ok).toBe(false);

    const two = report([
      spec(NEGATIVE_INVERTED_TITLE, { status: "unexpected", error: INTENDED_MESSAGE }),
      spec("a second failure", { status: "unexpected", error: INTENDED_MESSAGE }),
    ]);
    expect(classifyNegativeReport({ report: two, networkProof: negativeProof(), logText: "x" }).ok).toBe(false);
  });

  it("rejects the wrong card counts", () => {
    const wrongCounts = report([
      spec(NEGATIVE_INVERTED_TITLE, {
        status: "unexpected",
        error: INTENDED_MESSAGE.replace("Received: \u001b[31m0", "Received: \u001b[31m1"),
      }),
    ]);
    expect(
      classifyNegativeReport({ report: wrongCounts, networkProof: negativeProof(), logText: "x" }).ok,
    ).toBe(false);
  });

  it("strips ANSI colour codes before matching the reporter message", () => {
    expect(stripAnsi("Expected: \u001b[32m2\u001b[39m\nReceived: \u001b[31m0\u001b[39m")).toBe(
      "Expected: 2\nReceived: 0",
    );
  });

  it("rejects missing/unparsable reports, missing evidence and missing signature", () => {
    expect(classifyNegativeReport({ parseError: "Unexpected token <" }).ok).toBe(false);
    expect(classifyNegativeReport({}).ok).toBe(false);
    expect(classifyNegativeReport({ report: validInverted(), logText: "x" }).ok).toBe(false);
    expect(
      classifyNegativeReport({
        report: validInverted(),
        networkProof: negativeProof({ consoleMessages: [] }),
        logText: "x",
      }).ok,
    ).toBe(false);
    expect(
      classifyNegativeReport({
        report: validInverted(),
        networkProof: negativeProof({ requests: ["http://127.0.0.1:5199/"] }),
        logText: "x",
      }).ok,
    ).toBe(false);
    expect(
      classifyNegativeReport({
        report: validInverted(),
        networkProof: negativeProof({ requests: [...negativeProof().requests, "https://firestore.googleapis.com/v1/x"] }),
        logText: "x",
      }).ok,
    ).toBe(false);
    expect(
      classifyNegativeReport({
        report: validInverted(),
        networkProof: negativeProof({ phase: "positive" }),
        logText: "x",
      }).ok,
    ).toBe(false);
  });

  it("rejects a blank captured output", () => {
    expect(
      classifyNegativeReport({ report: validInverted(), networkProof: negativeProof(), logText: "   " }).ok,
    ).toBe(false);
  });
});

describe("sticky hit gate", () => {
  const base = { formPosition: "sticky", focused: true, hitTag: "INPUT", hitAriaLabel: "Search the menu" };

  it("accepts the input as the actual pixel-centre hit", () => {
    const gate = classifyStickyHits({ ...base, hitInsideForm: true, hitIsInput: true });
    expect(gate.ok, gate.problems.join("; ")).toBe(true);
    expect(gate.legacyWouldPass).toBe(true);
  });

  it("RED: old form-only check accepted a sibling overlay; the gate rejects it", () => {
    const overlay = { ...base, hitTag: "DIV", hitAriaLabel: null, hitInsideForm: true, hitIsInput: false };
    const gate = classifyStickyHits(overlay);
    expect(gate.legacyWouldPass).toBe(true);
    expect(gate.ok).toBe(false);
    expect(gate.problems.join("; ")).toMatch(/not the search input/);
  });

  it("rejects a non-sticky form or an unfocused input", () => {
    expect(classifyStickyHits({ ...base, formPosition: "static", hitInsideForm: true, hitIsInput: true }).ok).toBe(
      false,
    );
    expect(classifyStickyHits({ ...base, focused: false, hitInsideForm: true, hitIsInput: true }).ok).toBe(false);
  });
});

describe("kill identity gate", () => {
  it("never signals an exited child", () => {
    expect(decideKill({ exitCode: 0, capturedToken: "a", observedToken: "a" })).toMatchObject({
      kill: false,
      reason: "child-already-exited",
    });
  });

  it("refuses a recycled PID with a different start token", () => {
    expect(decideKill({ exitCode: null, capturedToken: "a", observedToken: "b" })).toMatchObject({
      kill: false,
      reason: "pid-reuse-detected",
    });
  });

  it("refuses when the process is already gone", () => {
    expect(decideKill({ exitCode: null, capturedToken: "a", observedToken: null })).toMatchObject({
      kill: false,
      reason: "process-gone",
    });
  });

  it("kills a live token-verified child, and records degraded mode when no token exists", () => {
    expect(decideKill({ exitCode: null, capturedToken: "a", observedToken: "a" })).toMatchObject({
      kill: true,
      mode: "token-verified",
    });
    expect(decideKill({ exitCode: null, capturedToken: null, observedToken: "a" })).toMatchObject({
      kill: true,
      mode: "exit-code-only",
    });
  });
});
