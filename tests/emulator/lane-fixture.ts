/**
 * EMULATOR TEST LANE — shared Playwright helpers.
 *
 * Deliberately standalone: imports `node:*` and `@playwright/test` only, never
 * `src/**`. Expected record ids/counts are read from `seed-proof.json`, which the
 * seed wrote after an unauthenticated read through the real Firestore SDK. The
 * spec therefore compares the UI against emulator truth, not against a fixture
 * baked into the test.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

import { EMULATOR_LABEL } from "./lane-constants";
import {
  FIRESTORE_PORT,
  VITE_PORT,
  isLoopbackLaneUrl,
  isNonLoopbackHttpUrl,
} from "./lane-url-policy";

export { FIRESTORE_PORT, VITE_PORT, isLoopbackLaneUrl } from "./lane-url-policy";

export const BADGE_ID = "emulator-lane-badge";
export const BADGE_LABEL = EMULATOR_LABEL;
export const BASE_URL = `http://127.0.0.1:${VITE_PORT}`;

/** Env is mandatory: no silent fallback to a guessed temp/repo path. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[lane-fixture] ${name} is not set. Run the lane via "node tests/emulator/run-lane.mjs".`,
    );
  }
  return value;
}

export const ARTIFACTS_DIR = requireEnv("EMULATOR_LANE_ARTIFACTS");
export const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, "screenshots");
const SEED_PROOF_PATH = path.join(ARTIFACTS_DIR, "seed-proof.json");

export interface SeedCategory {
  id: string;
  name: string;
  count: number;
  ids: string[];
  names: string[];
  outOfStockIds: string[];
  outOfStockNames: string[];
}

export interface SeedProof {
  lane: string;
  generatedAt: string;
  projectId: string;
  host: string;
  port: number;
  label: string;
  rules: {
    customerSha256: string;
    canonicalSha256: string;
    bytes: number;
    parity: boolean;
  };
  stores: Array<{ id: string; name: string; restId: string; lat: number; lng: number }>;
  alpha: {
    storeId: string;
    restId: string;
    productCount: number;
    categoryCount: number;
    categories: SeedCategory[];
    outOfStockIds: string[];
    outOfStockCount: number;
    firstProductId: string;
    lastProductId: string;
    burgerNames: string[];
  };
  beta: {
    storeId: string;
    restId: string;
    productCount: number;
    names: string[];
    ids: string[];
  };
  guestReadProof: {
    stores: number;
    alpha: number;
    beta: number;
    crossRestIdLeak: number;
    guestWriteDenied: boolean;
  };
}

/** Fail (never skip) when the emulator/seed did not produce proof. */
export function readSeedProof(): SeedProof {
  if (!existsSync(SEED_PROOF_PATH)) {
    throw new Error(
      `[lane-fixture] seed proof missing at ${SEED_PROOF_PATH}. ` +
        "The lane requires a running Firestore emulator with seeded data — this is not skippable.",
    );
  }
  const proof = JSON.parse(readFileSync(SEED_PROOF_PATH, "utf8")) as SeedProof;

  expect(proof.projectId, "seed project must be the demo lane project").toBe(
    "demo-burgonomics-emulator",
  );
  expect(proof.host).toBe("127.0.0.1");
  expect(proof.port).toBe(FIRESTORE_PORT);
  expect(proof.rules.parity, "customer rules must equal backend canonical rules").toBe(true);
  expect(proof.guestReadProof.stores).toBe(2);
  expect(proof.guestReadProof.alpha).toBe(48);
  expect(proof.guestReadProof.beta).toBe(3);
  expect(proof.guestReadProof.crossRestIdLeak).toBe(0);
  expect(proof.guestReadProof.guestWriteDenied).toBe(true);
  return proof;
}

// ── Network policy ──────────────────────────────────────────────────────────

export interface BlockedAttempt {
  url: string;
  resourceType: string;
  reason: string;
}

export interface NetworkGuard {
  readonly blocked: BlockedAttempt[];
  readonly allowedProbes: string[];
  readonly requests: string[];
  readonly cspViolations: string[];
  readonly websockets: string[];
  readonly consoleMessages: string[];
  readonly pageErrors: string[];
  assertClean(context: string): void;
  assertNoPii(): void;
}

/**
 * Google Closure's WebChannel "image test" probe. The Firestore SDK fires it ONLY
 * after the transport errors (i.e. the emulator is unreachable) to decide whether
 * the device is online. It carries no project data and no credentials, and CSP
 * blocks it. It is tolerated in the NEGATIVE phase only (explicit flag), because
 * that phase intentionally simulates an unreachable backend; any production
 * service host still fails, and the positive phase tolerates nothing.
 */
const CLOSURE_IMAGE_PROBE = /^https?:\/\/www\.google\.com\/images\/cleardot\.gif(?:\?|$)/;
const ALLOW_CLOSURE_PROBE = process.env.EMULATOR_LANE_ALLOW_CLOSURE_PROBE === "1";

function isToleratedClosureProbe(attempt: BlockedAttempt): boolean {
  return ALLOW_CLOSURE_PROBE && attempt.resourceType === "image" && CLOSURE_IMAGE_PROBE.test(attempt.url);
}

/**
 * Abort + record every non-loopback request. This is NOT a mock: allowed requests
 * go to the real Vite server and the real Firestore emulator; only an accidental
 * production call is blocked, and any such attempt fails the test.
 */
export async function installNetworkGuard(page: Page): Promise<NetworkGuard> {
  const blocked: BlockedAttempt[] = [];
  const allowedProbes: string[] = [];
  const requests: string[] = [];
  const cspViolations: string[] = [];
  const websockets: string[] = [];
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];

  await page.route(
    (url) => isNonLoopbackHttpUrl(url),
    async (route) => {
      const request = route.request();
      blocked.push({
        url: request.url(),
        resourceType: request.resourceType(),
        reason: "non-loopback",
      });
      await route.abort("blockedbyclient").catch(() => undefined);
    },
  );

  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http")) return;
    requests.push(url);
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith("http")) return;
    if (!isLoopbackLaneUrl(url)) {
      blocked.push({
        url,
        resourceType: request.resourceType(),
        reason: `requestfailed: ${request.failure()?.errorText ?? "unknown"}`,
      });
    }
  });

  page.on("websocket", (socket) => {
    websockets.push(socket.url());
  });

  page.on("console", (message) => {
    const text = message.text();
    consoleMessages.push(text);
    if (/content security policy|refused to connect|blocked by csp/i.test(text)) {
      cspViolations.push(text);
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  return {
    blocked,
    allowedProbes,
    requests,
    cspViolations,
    websockets,
    consoleMessages,
    pageErrors,
    assertClean(context: string) {
      const problems: string[] = [];
      const tolerated = blocked.filter(isToleratedClosureProbe);
      for (const attempt of tolerated) {
        if (!allowedProbes.includes(attempt.url)) allowedProbes.push(attempt.url);
      }
      const unexpected = blocked.filter((attempt) => !tolerated.includes(attempt));
      if (unexpected.length > 0) {
        problems.push(`blocked non-loopback attempts: ${JSON.stringify(unexpected)}`);
      }
      const unexpectedCsp = cspViolations.filter(
        (text) => !(ALLOW_CLOSURE_PROBE && text.includes("/images/cleardot.gif")),
      );
      if (unexpectedCsp.length > 0) {
        problems.push(`CSP violations: ${JSON.stringify(unexpectedCsp)}`);
      }
      const foreignSockets = websockets.filter((url) => !isLoopbackLaneUrl(url));
      if (foreignSockets.length > 0) problems.push(`non-loopback websockets: ${JSON.stringify(foreignSockets)}`);
      // Any non-loopback request is a failure, including a redirect target that
      // the route predicate did not see as the original request.
      const unexpectedRequests = requests.filter(
        (url) =>
          !isLoopbackLaneUrl(url) &&
          !(ALLOW_CLOSURE_PROBE && CLOSURE_IMAGE_PROBE.test(url)),
      );
      if (unexpectedRequests.length > 0) {
        problems.push(`non-loopback requests: ${JSON.stringify(unexpectedRequests.slice(0, 5))}`);
      }
      const productionHosts = requests.filter((url) =>
        /(identitytoolkit|securetoken|firestore\.googleapis\.com|firebaseio\.com|cloudfunctions\.net|fcm\.googleapis\.com|razorpay\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/i.test(
          url,
        ),
      );
      if (productionHosts.length > 0) {
        problems.push(`production service requests: ${JSON.stringify(productionHosts)}`);
      }
      if (problems.length > 0) {
        throw new Error(`[${context}] network policy violated:\n- ${problems.join("\n- ")}`);
      }
    },
    assertNoPii() {
      const emailish = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
      const longDigits = /\d{10,}/;
      const offenders = [...consoleMessages, ...pageErrors].filter(
        (text) => emailish.test(text) || longDigits.test(text),
      );
      if (offenders.length > 0) {
        throw new Error(`[console] PII-shaped value found: ${JSON.stringify(offenders.slice(0, 5))}`);
      }
    },
  };
}

// ── Evidence capture ────────────────────────────────────────────────────────

export interface CaptureRecord {
  name: string;
  file: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  scrollY: number;
  viewport: { width: number; height: number };
  badge: { x: number; y: number; width: number; height: number };
}

function pngDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("[capture] not a PNG buffer");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const captures: CaptureRecord[] = [];

export function captureRecords(): readonly CaptureRecord[] {
  return captures;
}

/**
 * Every screenshot enforces the badge is present, visible and inside the
 * viewport. The PNG on disk is real bytes from Chromium (hash recorded), not a
 * placeholder.
 */
export async function capture(page: Page, name: string): Promise<CaptureRecord> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const marker = await page.evaluate(() => document.documentElement.dataset.emulatorLane === "true");
  if (!marker) throw new Error("[capture] emulator lane marker missing on <html>");

  const badge = page.locator(`#${BADGE_ID}`);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(BADGE_LABEL);

  const badgeBox = await badge.boundingBox();
  const viewport = page.viewportSize();
  if (!badgeBox || !viewport) throw new Error("[capture] missing badge box or viewport");
  if (badgeBox.width < 120 || badgeBox.height < 14) {
    throw new Error(`[capture] badge too small: ${JSON.stringify(badgeBox)}`);
  }
  if (badgeBox.y < 0 || badgeBox.y + badgeBox.height > viewport.height + 0.5) {
    throw new Error(`[capture] badge outside viewport: ${JSON.stringify({ badgeBox, viewport })}`);
  }

  const file = path.join(SCREENSHOTS_DIR, `${name}.png`);
  const buffer = await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
  const dims = pngDimensions(buffer);
  const scrollY = await page.evaluate(() => window.scrollY);
  const record: CaptureRecord = {
    name,
    file,
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    width: dims.width,
    height: dims.height,
    scrollY,
    viewport,
    badge: badgeBox,
  };
  captures.push(record);
  return record;
}

/** Badge-only screenshot: proves the label itself renders as pixels. */
export async function captureBadge(page: Page, name: string): Promise<CaptureRecord> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const badge = page.locator(`#${BADGE_ID}`);
  const buffer = await badge.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`) });
  const dims = pngDimensions(buffer);
  const record: CaptureRecord = {
    name,
    file: path.join(SCREENSHOTS_DIR, `${name}.png`),
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    width: dims.width,
    height: dims.height,
    scrollY: 0,
    viewport: page.viewportSize() ?? { width: 0, height: 0 },
    badge: (await badge.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 },
  };
  captures.push(record);
  return record;
}

// ── App navigation helpers ──────────────────────────────────────────────────

export async function assertLaneMarker(page: Page, proof: SeedProof): Promise<void> {
  const info = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__EMULATOR_LANE__,
  );
  expect(info, "window.__EMULATOR_LANE__ must be set by the connector").toBeTruthy();
  const lane = info as {
    projectId?: string;
    host?: string;
    port?: number;
    lane?: string;
    failed?: boolean;
  };
  expect(lane.failed, "connector must not report a failure").not.toBe(true);
  expect(lane.projectId).toBe(proof.projectId);
  expect(lane.host).toBe("127.0.0.1");
  expect(lane.port).toBe(FIRESTORE_PORT);
}

export async function gotoStores(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL(/\/stores$/, { timeout: 25_000 });
  await expect(page.getByRole("heading", { name: "Choose a store" })).toBeVisible();
  await dismissConsentBanner(page);
}

/**
 * Dismisses the DPDP notice with its X (the only non-consent control), so it
 * cannot intercept pointer events. Asserts the dismissal never records consent:
 * the lane must not fabricate a legal acceptance.
 */
export async function dismissConsentBanner(page: Page): Promise<void> {
  const dismiss = page.getByRole("button", { name: "Dismiss privacy banner" });
  if ((await dismiss.count()) > 0) {
    await dismiss.click({ timeout: 5_000 });
    await expect(dismiss).toHaveCount(0);
  }
  const consent = await page.evaluate(() => window.localStorage.getItem("burg.dpdp_consent_granted"));
  expect(consent, "dismissing the banner must not record DPDP consent").toBeNull();
}

export function storeCard(page: Page, storeName: string) {
  return page.locator(`button[aria-label^="${storeName}"]`).first();
}

export async function selectStore(page: Page, storeName: string): Promise<void> {
  await storeCard(page, storeName).click();
  await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
  // Home uses BrandHeader (a link), not a TopBar heading. The primary tab bar is
  // the reliable "home shell is mounted with a hydrated store" signal.
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

export async function openMenu(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await expect(page).toHaveURL(/\/menu$/, { timeout: 20_000 });
  await expect(page.getByRole("tablist", { name: "Menu categories" })).toBeVisible();
}

export async function openSearch(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Search the menu" }).click();
  await expect(page).toHaveURL(/\/search$/, { timeout: 20_000 });
  await expect(page.getByRole("searchbox", { name: "Search the menu" })).toBeVisible();
}

export function alphaStore(proof: SeedProof) {
  const store = proof.stores.find((entry) => entry.name.includes("Alpha"));
  if (!store) throw new Error("[lane-fixture] seed proof has no Alpha store");
  return store;
}

export function betaStore(proof: SeedProof) {
  const store = proof.stores.find((entry) => entry.name.includes("Beta"));
  if (!store) throw new Error("[lane-fixture] seed proof has no Beta store");
  return store;
}

export async function selectAlphaAndOpenMenu(page: Page, proof: SeedProof): Promise<void> {
  await gotoStores(page);
  await selectStore(page, alphaStore(proof).name);
  await openMenu(page);
}
