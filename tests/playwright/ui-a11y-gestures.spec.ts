import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Real-browser gesture acceptance for the customer menu category swipe.
 *
 * The page fixture is synthetic, but the gesture handler under test is the
 * shipped `src/features/menu/utils/categorySwipe.ts`, bundled at test time and
 * driven with Chromium's real touch pipeline (CDP), not synthetic jsdom events.
 *
 * This is browser evidence for the gesture contract only: it does not exercise
 * the menu route, data fetching, or a device. See `app-button-submit.spec.ts`
 * for keyboard/platform activation of the real AppButton.
 */

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");
// esbuild import specifiers are URL-ish: forward slashes only.
const swipeEntry = resolve(appRoot, "src/features/menu/utils/categorySwipe.ts").replace(/\\/g, "/");

/**
 * Optional route-level checks against an already-served build. No webServer and
 * no Firebase: every request outside the app origin is aborted, so these tests
 * judge rendering/keyboard semantics only. Without UI_BASE_URL they skip.
 */
const base = (process.env.UI_BASE_URL ?? "").replace(/\/$/, "");
const baseOrigin = base ? new URL(base).origin : "";

// An all-skipped run exits 0, so a CI gate would go green having asserted
// nothing. Refuse to run in CI without a target.
if (process.env.CI && !base) {
  throw new Error("UI_BASE_URL is required in CI: these tests would silently skip");
}

let harnessUrl = "";
let harnessDir = "";

// Twelve rows: the list viewport is 700px, so the content overflows and the
// vertical-drag case can prove native scrolling actually happened.
const rows = Array.from(
  { length: 12 },
  (_, i) => `<button id="b${i}" type="button">Product ${i}</button>`,
).join("\n    ");

const fixture = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>category swipe fixture</title>
<style>
  body { margin: 0; font-family: sans-serif; }
  #list { width: 390px; height: 700px; overflow-y: auto; touch-action: pan-y; }
  button { display: block; width: 100%; height: 88px; margin: 8px 0; font-size: 16px; }
</style></head>
<body>
  <div id="current">0</div>
  <div id="list">
    ${rows}
  </div>
  <script>/*__BUNDLE__*/</script>
</body></html>`;

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import { attachCategorySwipe as attach } from ${JSON.stringify(swipeEntry)};
        const state = { category: 0, swipes: 0, clicks: 0, preventedMoves: 0, log: [] };
        const list = document.getElementById("list");
        for (const button of document.querySelectorAll("#list button")) {
          button.addEventListener("click", () => {
            state.clicks += 1;
            state.log.push("click:" + button.id);
          });
        }
        window.__attach = attach;
        window.__state = state;
        window.__attach(list, (direction) => {
          const target = state.category + direction;
          if (target < 0 || target > 2) {
            state.log.push("boundary:" + direction);
            return false;
          }
          state.category = target;
          state.swipes += 1;
          state.log.push("swipe:" + direction);
          document.getElementById("current").textContent = String(target);
          return true;
        });
        // Registered AFTER attach so it observes defaultPrevented set by the
        // utility's own non-passive touchmove handler.
        list.addEventListener("touchmove", (event) => {
          if (event.defaultPrevented) state.preventedMoves += 1;
        }, { passive: true });
      `,
      resolveDir: appRoot,
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    write: false,
    logLevel: "warning",
  });

  const bundle = result.outputFiles[0].text;
  harnessDir = await mkdtemp(join(tmpdir(), "ui-a11y-gestures-"));
  const html = join(harnessDir, "category-swipe.html");
  await writeFile(
    html,
    fixture.replace("/*__BUNDLE__*/", () => bundle),
  );
  harnessUrl = pathToFileURL(html).href;
});

test.afterAll(async () => {
  if (harnessDir) await rm(harnessDir, { recursive: true, force: true });
});

type Probe = {
  category: number;
  swipes: number;
  clicks: number;
  preventedMoves: number;
  log: string[];
};

const read = (page: Page): Promise<Probe> =>
  page.evaluate(() => (window as unknown as { __state: Probe }).__state);

async function touchSwipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 8,
) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from.x, y: from.y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
    });
    for (let i = 1; i <= steps; i += 1) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
      });
      await page.waitForTimeout(12);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    // A throwing send must not leak the CDP session into the next test.
    await cdp.detach().catch(() => {});
  }
  await page.waitForTimeout(120);
}

async function tap(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`tap target not visible: ${selector}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
}

test.beforeEach(async ({ page }) => {
  await page.goto(harnessUrl);
  await page.waitForSelector("#list");
});

test("horizontal swipe switches once, cancels page pan and suppresses the click", async ({
  page,
}) => {
  await touchSwipe(page, { x: 300, y: 200 }, { x: 120, y: 206 });
  const state = await read(page);
  expect(state.category).toBe(1);
  expect(state.swipes).toBe(1);
  // Every move after the axis locks must be cancelled, not just one of them.
  expect(state.preventedMoves).toBeGreaterThanOrEqual(6);

  // A real 180px drag produces no click in Chromium, so "no click happened"
  // would be true even with the capture handler deleted. Fire the click the
  // handler exists to swallow, with no intervening touchstart to reset it.
  await page.evaluate(() => document.getElementById("b1")?.click());
  expect((await read(page)).clicks).toBe(0);
});

test("the tap after a swipe still activates its control", async ({ page }) => {
  await touchSwipe(page, { x: 300, y: 200 }, { x: 120, y: 206 });
  await tap(page, "#b1");
  const state = await read(page);
  expect(state.clicks).toBe(1);
  expect(state.category).toBe(1);
});

test("a boundary swipe changes nothing and does not arm click suppression", async ({ page }) => {
  // b0 is the first category; swiping right has no target.
  await touchSwipe(page, { x: 80, y: 300 }, { x: 260, y: 303 });
  let state = await read(page);
  expect(state.category).toBe(0);
  expect(state.swipes).toBe(0);

  // The suppression flag only survives until the next touchstart, so a real
  // tap cannot tell armed from unarmed. Fire a click with no touchstart: this
  // is the window the `return false` contract protects.
  await page.evaluate(() => document.getElementById("b0")?.click());
  state = await read(page);
  expect(state.clicks).toBe(1);

  await tap(page, "#b0");
  state = await read(page);
  expect(state.clicks).toBe(2);
});

test("vertical drag scrolls natively and never switches category", async ({ page }) => {
  const before = await read(page);
  const scrollBefore = await page.evaluate(() => document.getElementById("list")!.scrollTop);
  await touchSwipe(page, { x: 200, y: 600 }, { x: 204, y: 300 }, 10);
  const after = await read(page);
  const scrollAfter = await page.evaluate(() => document.getElementById("list")!.scrollTop);

  // "Left to native scrolling" is only proven if the list actually scrolled.
  expect(scrollAfter).toBeGreaterThan(scrollBefore);
  expect(after.category).toBe(before.category);
  expect(after.swipes).toBe(0);
  expect(after.preventedMoves).toBe(before.preventedMoves);
});

test("the 48px threshold is enforced from both sides", async ({ page }) => {
  // 40px: below the threshold, the axis locks but no switch happens.
  await touchSwipe(page, { x: 200, y: 200 }, { x: 240, y: 202 }, 4);
  let state = await read(page);
  expect(state.category).toBe(0);
  expect(state.swipes).toBe(0);
  // ...and the horizontal axis really was detected, so the case is not a no-op.
  expect(state.preventedMoves).toBeGreaterThan(0);

  // 50px: above the threshold, the same gesture must switch.
  await touchSwipe(page, { x: 250, y: 200 }, { x: 200, y: 202 }, 4);
  state = await read(page);
  expect(state.swipes).toBe(1);
  expect(state.category).toBe(1);
});

test("one synthetic click after a swipe is suppressed, the next tap is not", async ({ page }) => {
  await touchSwipe(page, { x: 300, y: 400 }, { x: 120, y: 404 });
  await page.evaluate(() => document.getElementById("b3")?.click());
  let state = await read(page);
  expect(state.clicks).toBe(0);
  await tap(page, "#b4");
  state = await read(page);
  expect(state.clicks).toBe(1);
});

/**
 * A focus ring is only "visible" if it is authored: Chromium's user-agent
 * `:focus-visible` outline computes to `auto`/1px, so a bare
 * `outlineWidth !== "0px"` check passes on an app with no focus styling at all.
 * Accept a real outline (>=2px, non-auto style) or a non-transparent shadow.
 */
type FocusRing = { outlineStyle: string; outlineWidth: number; boxShadow: string };

const focusRing = (page: Page): Promise<FocusRing> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { outlineStyle: "none", outlineWidth: 0, boxShadow: "none" };
    const s = getComputedStyle(el);
    return {
      outlineStyle: s.outlineStyle,
      outlineWidth: Number.parseFloat(s.outlineWidth) || 0,
      boxShadow: s.boxShadow,
    };
  });

const hasVisibleShadow = (value: string) =>
  value !== "none" &&
  value.split(/,(?![^(]*\))/).some((layer) => !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(layer));

const isAuthoredRing = (ring: FocusRing) =>
  (ring.outlineStyle !== "none" && ring.outlineStyle !== "auto" && ring.outlineWidth >= 2) ||
  hasVisibleShadow(ring.boxShadow);

/** Aborted third-party requests can log their own network noise; app errors may not hide behind it. */
const ABORT_NOISE = /ERR_FAILED|ERR_ABORTED|ERR_BLOCKED|Failed to fetch|NetworkError/i;

test.describe("served customer app public routes", () => {
  test.skip(!base, "UI_BASE_URL is not set — start a served customer build and re-run");

  test.beforeEach(async ({ page }) => {
    // Hermetic: no Firebase/auth/third-party call can leave the page. Compare
    // origins, not prefixes — `startsWith` also matches `origin.evil.tld`.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
      try {
        return new URL(url).origin === baseOrigin ? route.continue() : route.abort();
      } catch {
        return route.abort();
      }
    });
    // `page.route` does not see WebSocket upgrades; close foreign ones instead
    // of letting a Firestore channel open.
    await page.routeWebSocket(/.*/, (ws) => {
      try {
        if (new URL(ws.url()).origin === baseOrigin) ws.connectToServer();
        else ws.close();
      } catch {
        ws.close();
      }
    });
  });

  test("about and privacy render an h1 with no horizontal overflow at 390 and 768", async ({
    page,
  }) => {
    // One listener for the whole test: registering per route leaves the first
    // route's listener feeding a dead array while the second navigates.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    for (const route of ["/about", "/privacy"]) {
      const before = errors.length;
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("h1").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.locator("html").getAttribute("lang")).toBe("en");

      for (const width of [390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await expect
          .poll(
            () =>
              page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
              ),
            { message: `${route} overflow @${width}px` },
          )
          .toBeLessThanOrEqual(1);
      }
      expect(errors.slice(before).filter((e) => !ABORT_NOISE.test(e))).toEqual([]);
    }
  });

  test("login exposes a labelled mobile field and an authored focus ring", async ({ page }) => {
    await page.goto(`${base}/auth/login`, { waitUntil: "domcontentloaded" });
    const mobile = page.getByLabel(/mobile number/i).first();
    await expect(mobile).toBeVisible();

    // identity, not a selector string: a label[for] association would make a
    // querySelector lookup return null and the "focus moved" check vacuously true.
    const mobileHandle = await mobile.elementHandle();
    expect(mobileHandle).not.toBeNull();

    await mobile.focus();
    const ring = await focusRing(page);
    expect(isAuthoredRing(ring), `focus ring: ${JSON.stringify(ring)}`).toBe(true);

    await page.keyboard.press("Tab");
    const moved = await page.evaluate((el) => document.activeElement !== el, mobileHandle);
    expect(moved).toBe(true);
  });
});
