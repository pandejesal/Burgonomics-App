import { test, expect, type Page } from "@playwright/test";

/**
 * Sticky-scrollport regression — real Chromium geometry against a SERVED
 * PRODUCTION `dist`. No clock/DOM mocking, no injected fixtures.
 *
 * What is proven (all measured, never hardcoded):
 *   1. `html` contains horizontal overflow; `body` is NOT an intermediate
 *      scroll container in either supported syntax branch.
 *   2. The sticky `header` (top-0) pins at scroll 0 / 350 / end on a genuinely
 *      long, always-content route (`/privacy`) at 320x568, 375x812, 768x1024
 *      and 1280x800, and the bottom `nav` intersects the viewport with a real
 *      elementFromPoint hit.
 *   3. The sticky search `form` (top 56px) and its `input[type=search]` pin at
 *      320x568 on the existing empty-state UI. This proves the pinned input
 *      container only; it does NOT claim live catalog results.
 *   4. The hidden fallback branch (no `overflow: clip` support) is measured by
 *      serving the same build with the `@supports (overflow: clip)` block
 *      removed. That is a SYNTAX-BRANCH simulation in Chromium — it is not an
 *      iOS 15 / Safari 15 device run.
 *
 * Gate policy:
 *   - `UI_BASE_URL` points at the served production build.
 *   - Unset URL: hard FAIL when `CI` or `UI_GATE_REQUIRED=1`; otherwise an
 *     explicitly labelled LOCAL OPTIONAL SKIP. A skip is never counted as a
 *     pass and is visible in the runner summary.
 *
 * Deliberate non-claims:
 *   - A blank page (no header / no body text) FAILS, it never skips or passes.
 *   - Off-screen controls are not claimed visible; only controls whose rect
 *     intersects the viewport are checked for horizontal clipping.
 *   - `/search` at 375x812 is data-dependent: a content-bearing but too-short
 *     page is an explicit SKIP and the 375 proof is carried by `/privacy`.
 */

const BASE = (process.env.UI_BASE_URL ?? "").replace(/\/+$/, "");
const GATE_REQUIRED = Boolean(process.env.CI) || process.env.UI_GATE_REQUIRED === "1";
const MIN_LONG_SCROLL = 60;
/** The s350 assertion must be a real 350px scroll, never a clamped 96px page. */
const MIN_TARGET_SCROLL = 350;
const STICKY_FORM_TOP = 56;

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x812", width: 375, height: 812 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x800", width: 1280, height: 800 },
] as const;

type ScrollTarget = 0 | 350 | "end";

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  width: number;
}

interface ControlBox {
  tag: string;
  label: string;
  left: number;
  right: number;
}

interface Geometry {
  viewport: { w: number; h: number };
  scrollY: number;
  maxScroll: number;
  bodyTextLen: number;
  htmlOverflowX: string | null;
  htmlOverflowY: string | null;
  bodyOverflowX: string | null;
  bodyOverflowY: string | null;
  header: Box | null;
  headerPosition: string | null;
  headerHitInside: boolean;
  nav: Box | null;
  navHitInside: boolean;
  form: Box | null;
  formPosition: string | null;
  formTop: string | null;
  input: Box | null;
  inputVisibleH: number;
  inputInViewport: boolean;
  inputHitIsInput: boolean;
  controls: { checked: number; clipped: ControlBox[]; carouselExcluded: number };
}

test.beforeEach(async ({ page }) => {
  if (!BASE) {
    if (GATE_REQUIRED) {
      throw new Error(
        "UI_BASE_URL is required for the sticky-scrollport gate (CI / UI_GATE_REQUIRED=1). " +
          "Serve the production build and pass its origin; a missing URL must not skip the gate.",
      );
    }
    test.skip(
      true,
      "LOCAL OPTIONAL SKIP (not a pass): UI_BASE_URL is unset — no served production build to measure.",
    );
  }
  await page.setViewportSize({ width: 320, height: 568 });
});

async function waitForRealShell(page: Page, heading: RegExp): Promise<void> {
  await page.locator("header").first().waitFor({ state: "visible", timeout: 10_000 });
  const headerTitle = page.locator("header h1").first();
  await headerTitle.waitFor({ state: "visible", timeout: 10_000 });
  await expect(headerTitle).toHaveText(heading);
  await page.waitForFunction(
    () => (document.body.innerText ?? "").trim().length > 20,
    undefined,
    { timeout: 10_000 },
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(
      images.map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function probe(page: Page): Promise<Geometry> {
  return page.evaluate((): Geometry => {
    const docEl = document.documentElement;
    const body = document.body;
    const style = (el: Element | null) => (el ? getComputedStyle(el) : null);
    const box = (el: Element | null): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Number(r.top.toFixed(1)),
        bottom: Number(r.bottom.toFixed(1)),
        left: Number(r.left.toFixed(1)),
        right: Number(r.right.toFixed(1)),
        height: Number(r.height.toFixed(1)),
        width: Number(r.width.toFixed(1)),
      };
    };
    const hitAt = (x: number, y: number) => document.elementFromPoint(x, y);

    const header = document.querySelector("header");
    const nav = document.querySelector("nav");
    const form = document.querySelector("form");
    const input = document.querySelector('input[type="search"]');
    const headerBox = box(header);
    const navBox = box(nav);

    const headerHitInside = (() => {
      if (!header || !headerBox) return false;
      const x = Math.min(Math.max(headerBox.left + headerBox.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(headerBox.top + headerBox.height / 2, 0), window.innerHeight - 1);
      const hit = hitAt(x, y);
      return Boolean(hit && header.contains(hit));
    })();

    const navHitInside = (() => {
      if (!nav || !navBox) return false;
      const x = Math.min(Math.max(navBox.left + navBox.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(navBox.top + navBox.height / 2, 0), window.innerHeight - 1);
      const hit = hitAt(x, y);
      return Boolean(hit && nav.contains(hit));
    })();

    let inputVisibleH = 0;
    let inputHitIsInput = false;
    if (input) {
      const r = input.getBoundingClientRect();
      const visibleTop = Math.max(r.top, 0);
      const visibleBottom = Math.min(r.bottom, window.innerHeight);
      inputVisibleH = Math.max(0, visibleBottom - visibleTop);
      if (inputVisibleH > 2) {
        const hit = hitAt(r.left + r.width / 2, (visibleTop + visibleBottom) / 2);
        inputHitIsInput = Boolean(hit && (hit === input || input.contains(hit)));
      }
    }

    // A control inside an intentional horizontal scroller (carousel / chip
    // rail) may legitimately sit outside the viewport. Excluding it is the
    // difference between measuring real clipping and blanket-claiming that
    // every control must be on-screen.
    const insideHorizontalScroller = (el: Element): boolean => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const s = getComputedStyle(node);
        if ((s.overflowX === "auto" || s.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const checkedControls: ControlBox[] = [];
    const clippedControls: ControlBox[] = [];
    let carouselExcluded = 0;
    const selector = "header a, header button, main a, main button, main input, nav a, nav button";
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      // Off-screen controls are out of scope: this probe never claims they are
      // visible. Only controls intersecting the viewport are checked.
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
      if (insideHorizontalScroller(el)) {
        carouselExcluded += 1;
        continue;
      }
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
      const item: ControlBox = {
        tag: el.tagName,
        label: el.getAttribute("aria-label") ?? (text || el.tagName),
        left: Number(r.left.toFixed(1)),
        right: Number(r.right.toFixed(1)),
      };
      checkedControls.push(item);
      if (r.left < -1 || r.right > window.innerWidth + 1) clippedControls.push(item);
    }

    const inputBox = box(input);
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollY: Math.round(window.scrollY),
      maxScroll: docEl.scrollHeight - docEl.clientHeight,
      bodyTextLen: (body.innerText ?? "").trim().length,
      htmlOverflowX: style(docEl)?.overflowX ?? null,
      htmlOverflowY: style(docEl)?.overflowY ?? null,
      bodyOverflowX: style(body)?.overflowX ?? null,
      bodyOverflowY: style(body)?.overflowY ?? null,
      header: headerBox,
      headerPosition: style(header)?.position ?? null,
      headerHitInside,
      nav: navBox,
      navHitInside,
      form: box(form),
      formPosition: style(form)?.position ?? null,
      formTop: style(form)?.top ?? null,
      input: inputBox,
      inputVisibleH: Number(inputVisibleH.toFixed(1)),
      inputInViewport: Boolean(inputBox && inputBox.bottom > 0 && inputBox.top < window.innerHeight),
      inputHitIsInput,
      controls: {
        checked: checkedControls.length,
        clipped: clippedControls,
        carouselExcluded,
      },
    };
  });
}

async function scrollToTarget(page: Page, target: ScrollTarget): Promise<void> {
  await page.evaluate((value) => {
    const max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    window.scrollTo(0, value === "end" ? max : Math.min(value, max));
  }, target);
  await page.waitForFunction(
    (value) => {
      const max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const expected = value === "end" ? max : Math.min(value, max);
      return Math.abs(window.scrollY - expected) <= 2;
    },
    target,
    { timeout: 5_000 },
  );
}

function assertPinnedHeader(g: Geometry, phase: string, vp: string): void {
  expect(g.header, `${vp} ${phase}: header missing (blank page?)`).not.toBeNull();
  expect(g.headerPosition, `${vp} ${phase}: header must be sticky`).toBe("sticky");
  expect(g.header!.top, `${vp} ${phase}: header top at scrollY ${g.scrollY}`).toBeGreaterThanOrEqual(-1);
  expect(Math.abs(g.header!.top), `${vp} ${phase}: header not pinned to top (top=${g.header!.top})`).toBeLessThanOrEqual(1);
  expect(
    Math.abs(g.header!.bottom - g.header!.height),
    `${vp} ${phase}: header bottom does not match its own height`,
  ).toBeLessThanOrEqual(1);
  expect(g.header!.bottom, `${vp} ${phase}: header not intersecting viewport`).toBeGreaterThan(0);
  expect(g.header!.top, `${vp} ${phase}: header starts below viewport`).toBeLessThan(g.viewport.h);
  expect(g.headerHitInside, `${vp} ${phase}: elementFromPoint at header midpoint is not inside header`).toBe(true);
}

function assertVisibleNav(g: Geometry, phase: string, vp: string): void {
  expect(g.nav, `${vp} ${phase}: bottom nav missing`).not.toBeNull();
  expect(g.nav!.height, `${vp} ${phase}: nav has no height`).toBeGreaterThan(0);
  expect(g.nav!.bottom, `${vp} ${phase}: nav not intersecting viewport`).toBeGreaterThan(0);
  expect(g.nav!.top, `${vp} ${phase}: nav starts below viewport`).toBeLessThan(g.viewport.h);
  expect(g.navHitInside, `${vp} ${phase}: elementFromPoint at nav midpoint is not inside nav`).toBe(true);
}

test.describe("root overflow guard (body must never be a scrollport)", () => {
  test("html contains horizontally; body stays non-scrolling", async ({ page }) => {
    await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
    await waitForRealShell(page, /privacy policy/i);

    const g = await probe(page);
    expect(g.maxScroll, "privacy must be a genuinely long route").toBeGreaterThan(MIN_LONG_SCROLL);
    expect(g.bodyTextLen, "privacy body text").toBeGreaterThan(200);
    // Horizontal containment survives in both syntax branches.
    expect(["clip", "hidden"], `html overflow-x computed ${g.htmlOverflowX}`).toContain(g.htmlOverflowX);
    // The defect was `overflow-x` on body; body must never become a scrollport.
    expect(g.bodyOverflowX, "body must not carry horizontal overflow (would make it a scrollport)").toBe("visible");
    expect(["auto", "scroll"], `body overflow-y computed ${g.bodyOverflowY}`).not.toContain(g.bodyOverflowY);
    // Under the hidden fallback the root legitimately computes overflow-y:auto
    // (it is the viewport scroller); that alone is not the defect. The sticky
    // assertion below is the behavioural proof, not a computed-value proxy.
    expect(["auto", "visible", "scroll"]).toContain(g.htmlOverflowY);
  });
});

test.describe("long-route TopBar pinning matrix (/privacy)", () => {
  for (const vp of VIEWPORTS) {
    test(`TopBar + nav pinned at scroll 0/350/end — ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
      await waitForRealShell(page, /privacy policy/i);

      const initial = await probe(page);
      expect(initial.viewport.w, `${vp.name}: viewport width actually applied`).toBe(vp.width);
      expect(initial.viewport.h, `${vp.name}: viewport height actually applied`).toBe(vp.height);
      expect(initial.bodyTextLen, `${vp.name}: blank page must fail, not pass`).toBeGreaterThan(200);
      expect(initial.maxScroll, `${vp.name}: /privacy too short to prove pinning`).toBeGreaterThanOrEqual(MIN_TARGET_SCROLL);

      let assertedCases = 0;
      for (const target of [0, 350, "end"] as const) {
        await scrollToTarget(page, target);
        const g = await probe(page);
        const phase = target === "end" ? "end" : `s${target}`;

        // The route must stay long at every step: a collapsed page (data/blank)
        // must fail rather than silently pass an empty loop.
        expect(g.maxScroll, `${vp.name} ${phase}: route lost its scroll length`).toBeGreaterThanOrEqual(MIN_TARGET_SCROLL);

        assertPinnedHeader(g, phase, vp.name);
        assertVisibleNav(g, phase, vp.name);

        // Horizontal clipping is measured per visible control box, not with the
        // tautological `scrollWidth > innerWidth` under a clipped root.
        expect(g.controls.checked, `${vp.name} ${phase}: no visible controls measured`).toBeGreaterThan(0);
        expect(
          g.controls.clipped,
          `${vp.name} ${phase}: horizontally clipped controls ${JSON.stringify(g.controls.clipped)}`,
        ).toEqual([]);

        assertedCases += 1;
      }
      // Requires all three intended cases, not one accidental case.
      expect(assertedCases, `${vp.name}: pinning assertions executed`).toBe(3);
    });
  }
});

test.describe("search input pinning at 320x568 (existing empty UI)", () => {
  test("sticky form + input stay pinned at 0/350/end", async ({ page }) => {
    await page.goto(`${BASE}/search?q=burger`, { waitUntil: "domcontentloaded" });
    await waitForRealShell(page, /search/i);

    const initial = await probe(page);
    expect(initial.bodyTextLen, "blank search page must fail, not pass").toBeGreaterThan(80);
    expect(initial.maxScroll, "search page too short to prove the pinned input at s350").toBeGreaterThanOrEqual(
      MIN_TARGET_SCROLL,
    );
    expect(initial.form, "search form missing").not.toBeNull();
    expect(initial.input, "search input missing").not.toBeNull();

    let assertedCases = 0;
    for (const target of [0, 350, "end"] as const) {
      await scrollToTarget(page, target);
      const g = await probe(page);
      const phase = target === "end" ? "end" : `s${target}`;

      expect(g.maxScroll, `search ${phase}: route lost its scroll length`).toBeGreaterThanOrEqual(MIN_TARGET_SCROLL);
      assertPinnedHeader(g, phase, "320x568");

      expect(g.form, `search ${phase}: form missing`).not.toBeNull();
      expect(g.formPosition, `search ${phase}: form must be sticky`).toBe("sticky");
      expect(
        Math.abs(g.form!.top - STICKY_FORM_TOP),
        `search ${phase}: form top ${g.form!.top} must sit under the 56px header`,
      ).toBeLessThanOrEqual(2);
      expect(g.input, `search ${phase}: input missing`).not.toBeNull();
      expect(g.inputInViewport, `search ${phase}: input not in viewport`).toBe(true);
      expect(g.inputVisibleH, `search ${phase}: input visible height ${g.inputVisibleH}`).toBeGreaterThan(20);
      expect(g.inputHitIsInput, `search ${phase}: elementFromPoint at input midpoint is not the input`).toBe(true);
      expect(g.controls.checked, `search ${phase}: no visible non-carousel controls measured`).toBeGreaterThan(0);
      expect(
        g.controls.clipped,
        `search ${phase}: horizontally clipped controls ${JSON.stringify(g.controls.clipped)}`,
      ).toEqual([]);

      assertedCases += 1;
    }
    expect(assertedCases, "search pinning assertions executed").toBe(3);
  });
});

test.describe("search at 375x812 (data-dependent leg)", () => {
  test("short empty UI is SKIPPED, blank still fails", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/search?q=burger`, { waitUntil: "domcontentloaded" });
    await waitForRealShell(page, /search/i);

    const g = await probe(page);
    // Blank pages must FAIL. Only a content-bearing short page may skip.
    expect(g.header, "375 search: blank page (no header) must fail, not skip").not.toBeNull();
    expect(g.bodyTextLen, "375 search: blank page (no text) must fail, not skip").toBeGreaterThan(20);

    test.skip(
      g.maxScroll < MIN_TARGET_SCROLL,
      `DATA-DEPENDENT SKIP (not a pass): /search at 375x812 has maxScroll=${g.maxScroll} in this empty-catalog UI, ` +
        `so s350 cannot be a real 350px scroll; the 375 pinning proof is the /privacy matrix leg.`,
    );

    expect(g.maxScroll).toBeGreaterThanOrEqual(MIN_TARGET_SCROLL);
    let assertedCases = 0;
    for (const target of [0, 350, "end"] as const) {
      await scrollToTarget(page, target);
      const step = await probe(page);
      const phase = target === "end" ? "end" : `s${target}`;
      assertPinnedHeader(step, phase, "375x812");
      assertVisibleNav(step, phase, "375x812");
      expect(step.inputInViewport, `375 search ${phase}: input not in viewport`).toBe(true);
      expect(step.inputHitIsInput, `375 search ${phase}: input midpoint not hit-testable`).toBe(true);
      assertedCases += 1;
    }
    expect(assertedCases).toBe(3);
  });
});

test.describe("hidden fallback syntax branch (no overflow:clip)", () => {
  test("root-only hidden keeps body non-scrolling and header pinned (Chromium branch simulation, not iOS 15 device)", async ({
    page,
  }) => {
    let cssRequests = 0;
    let strippedSupportBlock = false;
    await page.route("**/*.css", async (route) => {
      const response = await route.fetch();
      const original = await response.text(); // decoded by route.fetch()
      const variant = stripClipSupportBlock(original);
      if (variant !== original) strippedSupportBlock = true;
      cssRequests += 1;

      // `response.text()`/`route.fetch()` hand us the DECODED body, while the
      // original headers still describe the compressed wire bytes. Reusing
      // `content-encoding`/`content-length` on a fulfilled replacement body
      // can make a compressing static server reject the variant and fail this
      // test for the wrong reason. Keep the real headers, fix the type, and
      // delete the two body-length/encoding headers.
      const headers: Record<string, string> = {
        ...response.headers(),
        "content-type": "text/css; charset=utf-8",
      };
      delete headers["content-encoding"];
      delete headers["content-length"];

      await route.fulfill({
        response,
        headers,
        body: `${variant}\n/* sticky-scrollport: fallback-branch-variant */`,
      });
    });

    await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
    await waitForRealShell(page, /privacy policy/i);

    expect(cssRequests, "no stylesheet was intercepted; the variant was not applied").toBeGreaterThan(0);
    expect(strippedSupportBlock, "served CSS had no @supports (overflow: clip) block to remove").toBe(true);

    const initial = await probe(page);
    test.info().annotations.push({
      type: "fallback-measurement",
      description: `cssRequests=${cssRequests} stripped=${strippedSupportBlock} htmlX=${initial.htmlOverflowX} bodyX=${initial.bodyOverflowX} bodyY=${initial.bodyOverflowY} maxScroll=${initial.maxScroll}`,
    });
    expect(initial.htmlOverflowX, "variant must leave only the hidden fallback on the root").toBe("hidden");
    expect(initial.bodyOverflowX, "body must stay free of overflow-x in the fallback").toBe("visible");
    expect(["auto", "scroll"], `body overflow-y ${initial.bodyOverflowY}`).not.toContain(initial.bodyOverflowY);
    expect(initial.maxScroll).toBeGreaterThan(MIN_LONG_SCROLL);
    expect(initial.bodyTextLen).toBeGreaterThan(200);

    await scrollToTarget(page, 350);
    const g = await probe(page);
    assertPinnedHeader(g, "fallback@350", "320x568");
    assertVisibleNav(g, "fallback@350", "320x568");

    test.info().annotations.push({
      type: "note",
      description:
        "The served stylesheet had its @supports (overflow: clip) block removed. This measures the hidden-fallback cascade " +
        "in Chromium only; it is NOT an iOS 15 / Safari 15 execution and does not prove Safari rendering.",
    });
  });
});

/**
 * Remove every `@supports (overflow: clip) { ... }` block, preserving the rest
 * byte-for-byte. Supports nested one-level blocks (the rule shape Tailwind
 * emits) by counting braces rather than regexing the body.
 */
function stripClipSupportBlock(css: string): string {
  const opener = /@supports\s*\(\s*overflow\s*:\s*clip\s*\)\s*\{/g;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(css)) !== null) {
    let depth = 1;
    let index = opener.lastIndex;
    while (index < css.length && depth > 0) {
      const char = css[index];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      index += 1;
    }
    output += css.slice(cursor, match.index);
    cursor = index;
    opener.lastIndex = index;
  }
  return output + css.slice(cursor);
}
