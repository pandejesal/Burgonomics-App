/**
 * Types for the dependency-free gate module. Kept next to `lane-gates.mjs` so
 * the Vitest suite and the spec get real types without enabling `allowJs`.
 */

export interface PlaywrightResult {
  status?: string;
  retry?: number;
  error?: { message?: string };
  errors?: Array<{ message?: string }>;
}

export interface PlaywrightTest {
  status?: string;
  results?: PlaywrightResult[];
}

export interface PlaywrightSpec {
  title?: string;
  file?: string;
  id?: string;
  tests?: PlaywrightTest[];
}

export interface PlaywrightSuite {
  title?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

export interface PlaywrightReport {
  suites?: PlaywrightSuite[];
  stats?: {
    expected?: number;
    skipped?: number;
    unexpected?: number;
    flaky?: number;
    [key: string]: unknown;
  };
  errors?: Array<{ message?: string }>;
}

export interface GateCounts {
  expected: number;
  skipped: number;
  unexpected: number;
  flaky: number;
  total: number;
}

export interface SpecSummary {
  title?: string;
  file?: string;
  id?: string;
  statuses: Array<string | undefined>;
}

export interface PositiveGate {
  ok: boolean;
  problems: string[];
  counts: GateCounts;
  missingTitles: string[];
  extraTitles: string[];
  skippedTitles: string[];
  failedTitles: string[];
  flakyTitles: string[];
  specs: SpecSummary[];
}

export interface NegativeGate {
  ok: boolean;
  problems: string[];
  failure: {
    title: string;
    file: string;
    testId?: string;
    messageExcerpt: string;
    expected: number;
    received: number;
  } | null;
  signature: {
    backendUnavailable: boolean;
    loopbackAttempts: number;
  } | null;
}

export interface StickyMeasurementLike {
  formPosition?: string;
  hitInsideForm?: boolean;
  hitIsInput?: boolean;
  focused?: boolean;
  hitTag?: string | null;
  hitAriaLabel?: string | null;
}

export interface StickyGate {
  ok: boolean;
  problems: string[];
  legacyWouldPass: boolean;
  hitTag: string | null;
  hitAriaLabel: string | null;
}

export interface KillDecision {
  kill: boolean;
  reason: string;
  mode: "none" | "token-verified" | "exit-code-only";
}

export const REQUIRED_POSITIVE_TESTS: readonly string[];
export const NEGATIVE_INVERTED_TITLE: string;
export const NEGATIVE_PROBE_TITLE: string;
export const CATALOG_FILE_SUFFIX: string;
export const PROBE_FILE_SUFFIX: string;
export const INTENDED_FAILURE: {
  matcher: string;
  locator: string;
  expected: number;
  received: number;
};

export function classifyPositiveReport(
  report: unknown,
  options?: { expectedTitles?: readonly string[]; fileSuffix?: string },
): PositiveGate;

export function classifyNegativeReport(input?: {
  report?: unknown;
  networkProof?: unknown;
  parseError?: unknown;
  logText?: string;
}): NegativeGate;

export function classifyStickyHits(measurement: StickyMeasurementLike | null | undefined): StickyGate;

export function decideKill(input?: {
  exitCode?: number | null;
  capturedToken?: string | null;
  observedToken?: string | null;
}): KillDecision;

export function stripAnsi(text: unknown): string;
