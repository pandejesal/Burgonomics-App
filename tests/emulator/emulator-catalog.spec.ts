/**
 * EMULATOR TEST LANE — guest store/catalog browser acceptance.
 *
 * Real Chromium -> real Vite dev server -> real Firebase JS SDK -> real Firestore
 * emulator with the canonical customer rules. No `getDocs` fakes, no route
 * fulfilment, no fixture-driven UI. Expected ids/names/counts come from
 * `seed-proof.json`, which the seed produced with an unauthenticated SDK read.
 *
 * There is no `test.skip` in this file: with the emulator absent the suite FAILS.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  ARTIFACTS_DIR,
  BADGE_ID,
  BADGE_LABEL,
  FIRESTORE_PORT,
  alphaStore,
  assertLaneMarker,
  betaStore,
  capture,
  captureBadge,
  gotoStores,
  installNetworkGuard,
  openMenu,
  openSearch,
  readSeedProof,
  selectStore,
  type NetworkGuard,
  type SeedProof,
} from "./lane-fixture";
import { classifyStickyHits } from "./lane-gates.mjs";

test.describe.configure({ mode: "serial" });

let proof: SeedProof;
let guard: NetworkGuard;
const guards: NetworkGuard[] = [];

test.beforeAll(() => {
  // Throws (fails the suite) when the emulator/seed proof is missing.
  proof = readSeedProof();
});

test.afterAll(() => {
  // Aggregate evidence: every test already asserted this per-page; this records
  // the union so the manifest can show real numbers. Phase-scoped because the
  // same spec also runs (expected to fail) in the emulator-down phase.
  const phase = process.env.EMULATOR_LANE_PHASE ?? "unknown";
  const blocked = guards.flatMap((entry) => entry.blocked);
  const cspViolations = guards.flatMap((entry) => entry.cspViolations);
  const requests = [...new Set(guards.flatMap((entry) => entry.requests))];
  const websockets = [...new Set(guards.flatMap((entry) => entry.websockets))];
  writeFileSync(
    path.join(ARTIFACTS_DIR, `network-proof-${phase}.json`),
    `${JSON.stringify(
      {
        phase,
        checkedAt: new Date().toISOString(),
        tests: guards.length,
        allowedClosureProbes: guards.flatMap((entry) => entry.allowedProbes),
        blockedAttempts: blocked,
        cspViolations,
        consoleMessages: [...new Set(guards.flatMap((entry) => entry.consoleMessages))].slice(0, 200),
        pageErrors: [...new Set(guards.flatMap((entry) => entry.pageErrors))],
        uniqueRequests: requests.length,
        requests,
        websockets,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});

test.beforeEach(async ({ context, page }) => {
  // Deterministic geolocation refusal instead of an OS/browser prompt: this is
  // the "manual decline" path (stores load without coords). No OS permission UI
  // and no real device location are involved.
  const cdp = await context.newCDPSession(page);
  await cdp
    .send("Browser.setPermission", {
      permission: { name: "geolocation" },
      setting: "denied",
      origin: "http://127.0.0.1:5199",
    })
    .catch(() => undefined);

  guard = await installNetworkGuard(page);
  guards.push(guard);
});

test.afterEach(async () => {
  const title = test.info().title;
  guard.assertClean(title);
  guard.assertNoPii();
});

test("cold launch: guest / lands on /stores with exactly the two seeded stores", async ({ page }) => {
  await gotoStores(page);
  await assertLaneMarker(page, proof);

  const cards = page.locator('button[aria-label^="EMULATOR ONLY — Test Kitchen"]');
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("No stores found")).toHaveCount(0);

  const alpha = alphaStore(proof);
  const beta = betaStore(proof);
  await expect(page.locator(`button[aria-label^="${alpha.name}"]`).first()).toBeVisible();
  await expect(page.locator(`button[aria-label^="${beta.name}"]`).first()).toBeVisible();

  const labels = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );
  expect(labels).toHaveLength(2);
  // Alphabetical order without coords: Alpha first, Beta second (no invented order).
  expect(labels[0].startsWith(alpha.name)).toBe(true);
  expect(labels[1].startsWith(beta.name)).toBe(true);
  // The aria-label carries the real doc facts: name, open state, ETA, distance.
  expect(labels[0]).toContain("Open now");
  expect(labels[0]).toContain("Delivery in 20 minutes");

  await captureBadge(page, "00-emulator-label");
  await capture(page, "01-stores-cold-375x812");
});

test("store search filter: Alpha -> 1, EMULATOR ONLY -> 2, cleared -> 2", async ({ page }) => {
  await gotoStores(page);
  const search = page.getByRole("searchbox", { name: "Search stores" });
  const cards = page.locator('button[aria-label^="EMULATOR ONLY — Test Kitchen"]');
  const beta = betaStore(proof);

  await search.fill("Alpha");
  await expect(page.getByRole("heading", { name: "1 result" })).toBeVisible();
  await expect(cards).toHaveCount(1);
  await expect(page.locator(`button[aria-label^="${beta.name}"]`)).toHaveCount(0);

  await search.fill("EMULATOR ONLY");
  await expect(page.getByRole("heading", { name: "2 results" })).toBeVisible();
  await expect(cards).toHaveCount(2);

  await search.fill("");
  await expect(page.getByRole("heading", { name: "All stores" })).toBeVisible();
  await expect(cards).toHaveCount(2);

  await capture(page, "02-stores-search-375x812");
});

test("Alpha menu: 3 derived categories, 48 items, every 8th sold out, beta absent", async ({
  page,
}) => {
  await gotoStores(page);
  await selectStore(page, alphaStore(proof).name);
  await openMenu(page);

  const tabs = page.getByRole("tablist", { name: "Menu categories" }).getByRole("tab");
  await expect(tabs).toHaveCount(proof.alpha.categoryCount);

  const productLinks = page.locator('a[aria-label*="₹"]');
  let totalRendered = 0;
  let totalSoldOut = 0;

  for (const [index, category] of proof.alpha.categories.entries()) {
    const tab = tabs.nth(index);
    await expect(tab).toContainText(category.name);
    await tab.click();

    await expect(productLinks).toHaveCount(category.count);
    const labels = await productLinks.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? ""),
    );

    // Every expected record id from the emulator read is on screen, by name.
    for (const name of category.names) {
      expect(labels.some((label) => label.startsWith(name)), `missing ${name}`).toBe(true);
    }
    // Sold-out count/identities match the seeded `inStock:false` set exactly.
    const soldOut = labels.filter((label) => label.endsWith(", sold out"));
    expect(soldOut).toHaveLength(category.outOfStockNames.length);
    for (const name of category.outOfStockNames) {
      expect(soldOut.some((label) => label.startsWith(name)), `not sold out: ${name}`).toBe(true);
    }

    totalRendered += labels.length;
    totalSoldOut += soldOut.length;
  }

  expect(totalRendered).toBe(proof.alpha.productCount);
  expect(totalSoldOut).toBe(proof.alpha.outOfStockCount);
  expect(totalSoldOut).toBe(proof.alpha.productCount / 8);

  const bodyText = await page.locator("body").innerText();
  for (const name of proof.beta.names) {
    expect(bodyText, `beta sentinel leaked into Alpha menu: ${name}`).not.toContain(name);
  }
  expect(bodyText).not.toContain(betaStore(proof).name);

  await capture(page, "03-alpha-menu-375x812");
});

test("alpha search: 'Test Burger 0' filters to burgers only and beta stays out", async ({
  page,
}) => {
  await gotoStores(page);
  await selectStore(page, alphaStore(proof).name);
  await openMenu(page);
  await openSearch(page);

  const search = page.getByRole("searchbox", { name: "Search the menu" });
  await search.fill("Test Burger 0");
  await expect(page.getByText(/\d+ results? found/)).toBeVisible();

  // Substring semantics of menuService.search: 001..016 all contain "Test Burger 0".
  const expected = proof.alpha.burgerNames.filter((name) =>
    name.toLowerCase().includes("test burger 0"),
  );
  expect(expected.length).toBeGreaterThan(0);

  const results = page.locator('a[aria-label*="₹"]');
  await expect(results).toHaveCount(expected.length);

  const labels = await results.evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );
  for (const name of expected) {
    expect(labels.some((label) => label.startsWith(name)), `missing ${name}`).toBe(true);
  }
  // The query really filtered: no sides/drinks and none of the beta sentinels.
  for (const label of labels) {
    expect(label.startsWith("EMULATOR ONLY — Test Burger")).toBe(true);
  }
  const betaNames = proof.beta.names;
  for (const name of betaNames) {
    expect(labels.some((label) => label.includes(name))).toBe(false);
  }

  // The 86'd burger is visible in the result list as sold out.
  const soldOutBurger = proof.alpha.categories[0].outOfStockNames[0];
  await expect(
    page.locator(`a[aria-label^="${soldOutBurger}"][aria-label$=", sold out"]`),
  ).toBeVisible();

  await capture(page, "04-alpha-search-375x812");
});

test("beta store is isolated by restId: 3 sentinels and none of Alpha's menu", async ({ page }) => {
  await gotoStores(page);
  await selectStore(page, betaStore(proof).name);
  await openMenu(page);

  const tabs = page.getByRole("tablist", { name: "Menu categories" }).getByRole("tab");
  await expect(tabs).toHaveCount(1);

  const productLinks = page.locator('a[aria-label*="₹"]');
  await expect(productLinks).toHaveCount(proof.beta.productCount);

  const labels = await productLinks.evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? ""),
  );
  for (const name of proof.beta.names) {
    expect(labels.some((label) => label.startsWith(name)), `missing ${name}`).toBe(true);
  }

  const bodyText = await page.locator("body").innerText();
  for (const category of proof.alpha.categories) {
    for (const name of category.names) {
      expect(bodyText, `alpha item leaked into Beta menu: ${name}`).not.toContain(name);
    }
  }

  await capture(page, "05-beta-menu-375x812");
});

test("geometry 320x568 and 375x812: real scroll, sticky search, no header overlap", async ({
  page,
}) => {
  await gotoStores(page);
  await selectStore(page, alphaStore(proof).name);
  await openMenu(page);
  await openSearch(page);

  const search = page.getByRole("searchbox", { name: "Search the menu" });
  await search.fill("Test Burger 0");
  await expect(page.locator('a[aria-label*="₹"]')).toHaveCount(
    proof.alpha.burgerNames.filter((name) => name.toLowerCase().includes("test burger 0")).length,
  );

  const viewports = [
    { width: 320, height: 568 },
    { width: 375, height: 812 },
  ];

  // Actual measured hit evidence, persisted for the report (not a constant).
  const geometryProof: Array<Record<string, unknown>> = [];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await search.click();
    await expect(search).toBeFocused();

    const top = await measureSticky(page);
    expect(top.maxScroll, "page must be genuinely scrollable (>60px)").toBeGreaterThan(60);
    expect(top.viewport.width).toBe(viewport.width);
    // Sticky seam: the form starts at/below the header bottom, never over it.
    expect(top.form.top).toBeGreaterThanOrEqual(top.header.bottom - 0.5);
    expect(top.header.bottom).toBeLessThanOrEqual(viewport.height);
    expectStickyHit(top, "start", viewport.width);
    expect(top.focused).toBe(true);
    // Honest limit: headless Chromium has no OS keyboard, so no inset is claimed.
    expect(top.visualViewportHeight).toBe(top.viewport.height);
    geometryProof.push({ requestedViewport: viewport, at: "start", ...top });
    await capture(page, `06-geometry-${viewport.width}x${viewport.height}-scroll-start`);

    await page.evaluate((max) => window.scrollTo(0, Math.round(max / 2)), top.maxScroll);
    await page.waitForTimeout(250);
    const middle = await measureSticky(page);
    expect(middle.scrollY - top.scrollY, "real scroll movement to midpoint").toBeGreaterThan(60);
    expect(middle.form.top).toBeGreaterThanOrEqual(middle.header.bottom - 0.5);
    expectStickyHit(middle, "mid", viewport.width);
    geometryProof.push({ requestedViewport: viewport, at: "mid", ...middle });
    await capture(page, `06-geometry-${viewport.width}x${viewport.height}-scroll-mid`);

    await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      window.scrollTo(0, el.scrollHeight);
    });
    await page.waitForTimeout(250);
    const end = await measureSticky(page);
    expect(end.scrollY).toBeGreaterThanOrEqual(end.maxScroll - 2);
    expect(end.scrollY - middle.scrollY, "real scroll movement to end").toBeGreaterThan(60);
    expect(end.form.top).toBeGreaterThanOrEqual(end.header.bottom - 0.5);
    expectStickyHit(end, "end", viewport.width);
    geometryProof.push({ requestedViewport: viewport, at: "end", ...end });
    await capture(page, `06-geometry-${viewport.width}x${viewport.height}-scroll-end`);
  }

  writeFileSync(
    path.join(ARTIFACTS_DIR, "geometry-proof.json"),
    `${JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        points: geometryProof.map((point) => ({
          requestedViewport: point.requestedViewport,
          at: point.at,
          scrollY: point.scrollY,
          maxScroll: point.maxScroll,
          formPosition: point.formPosition,
          center: point.center,
          hitTag: point.hitTag,
          hitAriaLabel: point.hitAriaLabel,
          hitInsideForm: point.hitInsideForm,
          hitIsInput: point.hitIsInput,
          focused: point.focused,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});

test("guest bootstrap makes no auth call, no push/service worker, no LAN traffic", async ({
  page,
}) => {
  await gotoStores(page);
  await assertLaneMarker(page, proof);

  const authRequests = guard.requests.filter((url) =>
    /identitytoolkit|securetoken|accounts\.google\.com|firebaseauth/i.test(url),
  );
  expect(authRequests).toEqual([]);
  expect(guard.requests.every((url) => url.includes("127.0.0.1"))).toBe(true);

  const notificationPermission = await page.evaluate(() =>
    "Notification" in window ? Notification.permission : "unsupported",
  );
  expect(notificationPermission).not.toBe("granted");

  const registrations = await page
    .evaluate(() =>
      "serviceWorker" in navigator
        ? navigator.serviceWorker.getRegistrations().then((r) => r.length)
        : 0,
    )
    .catch(() => -1);
  expect(registrations).toBe(0);

  // Every websocket must be loopback too (guard.assertClean also enforces this).
  expect(guard.websockets.every((url) => url.includes("127.0.0.1"))).toBe(true);
  // The badge is a real DOM node, not only a constant comparison.
  await expect(page.locator(`#${BADGE_ID}`)).toHaveText(BADGE_LABEL);
  expect(proof.port).toBe(FIRESTORE_PORT);
});

interface StickyMeasurement {
  form: { top: number; bottom: number; height: number };
  formPosition: string;
  input: { top: number; bottom: number; left: number; right: number };
  header: { top: number; bottom: number; height: number };
  viewport: { width: number; height: number };
  scrollY: number;
  maxScroll: number;
  center: { x: number; y: number };
  hitTag: string | null;
  hitAriaLabel: string | null;
  hitInsideForm: boolean;
  hitIsInput: boolean;
  focused: boolean;
  visualViewportHeight: number | null;
}

/**
 * Contract §8.4: the visible input midpoint must hit the input/descendant — not
 * merely any node inside the form (a sibling overlay would satisfy that).
 * `classifyStickyHits` is pure and uni-tested; `legacyWouldPass` proves the old
 * form-only condition really did pass here.
 */
function expectStickyHit(measurement: StickyMeasurement, at: string, width: number): void {
  const verdict = classifyStickyHits(measurement);
  expect(
    measurement.hitIsInput,
    `${width}px ${at}: elementFromPoint(${Math.round(measurement.center.x)}, ${Math.round(
      measurement.center.y,
    )}) hit ${String(measurement.hitTag)} (${String(measurement.hitAriaLabel)}), not the input`,
  ).toBe(true);
  expect(verdict.legacyWouldPass, `${width}px ${at}: old form-only check would have passed`).toBe(true);
  expect(verdict.ok, `${width}px ${at}: ${verdict.problems.join("; ")}`).toBe(true);
}

async function measureSticky(page: import("@playwright/test").Page): Promise<StickyMeasurement> {
  return page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Search the menu"]');
    if (!input) throw new Error("search input missing");
    // Scope to the input's OWN form, not the first <form> on the page.
    const form = input.closest("form");
    const header = document.querySelector("header");
    const scrolling = document.scrollingElement ?? document.documentElement;
    if (!form || !header) {
      throw new Error("sticky form / header missing");
    }
    const formRect = form.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();

    // Midpoint of the input's VISIBLE slice (it may extend past the viewport).
    const visibleTop = Math.max(inputRect.top, 0);
    const visibleBottom = Math.min(inputRect.bottom, window.innerHeight);
    const x = inputRect.left + inputRect.width / 2;
    const y = (visibleTop + visibleBottom) / 2;
    const hit = document.elementFromPoint(x, y);

    return {
      form: { top: formRect.top, bottom: formRect.bottom, height: formRect.height },
      formPosition: getComputedStyle(form).position,
      input: {
        top: inputRect.top,
        bottom: inputRect.bottom,
        left: inputRect.left,
        right: inputRect.right,
      },
      header: { top: headerRect.top, bottom: headerRect.bottom, height: headerRect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollY: window.scrollY,
      maxScroll: scrolling.scrollHeight - scrolling.clientHeight,
      center: { x, y },
      hitTag: hit?.tagName ?? null,
      hitAriaLabel: hit instanceof Element ? hit.getAttribute("aria-label") : null,
      hitInsideForm: hit instanceof Node ? form.contains(hit) : false,
      hitIsInput: hit === input || (hit instanceof Node && input.contains(hit)),
      focused: document.activeElement === input,
      visualViewportHeight: window.visualViewport?.height ?? null,
    };
  });
}
