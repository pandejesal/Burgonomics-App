import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Real-browser acceptance for `src/shared/hooks/useDirectionalScroll.ts`.
 *
 * The page fixture is synthetic, but the hook under test is the shipped module,
 * bundled at test time and driven with Chromium's real touch pipeline (CDP).
 * No jsdom: axis locking and `preventDefault` semantics only exist in a real
 * compositor-backed scroller.
 *
 * Contract being pinned:
 *   - horizontal drags belong to the rail (the hook drives `scrollLeft`);
 *   - vertical drags belong to the BROWSER, so the gesture scrolls whichever
 *     ancestor is actually scrollable under the finger and keeps native
 *     momentum/overscroll;
 *   - the hook must never cancel a vertical `touchmove` nor move the window on
 *     its own.
 *
 * Which tests are which:
 *   - tests 1 and 2 pin the ABSENCE of hook intervention. `touch-action: pan-y`
 *     already gives native vertical panning, so those assertions would also
 *     hold with the hook deleted; each of them therefore opens with a
 *     horizontal drag that only the live hook can satisfy.
 *   - test 3 is the standalone liveness anchor (pan-y blocks native horizontal
 *     panning, so a deleted hook leaves `railLeft` at 0).
 *   - test 4 proves the hook does not leak outside its own element.
 */

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");
// esbuild import specifiers are URL-ish: forward slashes only.
const hookEntry = resolve(appRoot, "src/shared/hooks/useDirectionalScroll.ts").replace(/\\/g, "/");

const fixture = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>directional scroll fixture</title>
<style>
  html, body { margin: 0; }
  body { height: 3000px; font-family: sans-serif; }
  /* The gesture starts inside a nested scroller: this is the surface that must
     move when the finger moves vertically. */
  #panel { position: relative; height: 300px; overflow-y: auto; border-bottom: 1px solid #ccc; }
  #panel-inner { height: 1200px; padding: 0; }
  #tail { height: 2000px; }
</style></head>
<body>
  <div id="panel"><div id="panel-inner"><div id="rail-host"></div><p style="height:600px">panel copy</p></div></div>
  <div id="tail"></div>
  <script>/*__BUNDLE__*/</script>
</body></html>`;

let harnessUrl = "";
let harnessDir = "";

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import * as React from "react";
        import { createRoot } from "react-dom/client";
        import { useDirectionalScroll } from ${JSON.stringify(hookEntry)};

        function Rail() {
          const ref = React.useRef(null);
          useDirectionalScroll(ref);
          return React.createElement(
            "div",
            {
              id: "rail",
              ref,
              style: {
                display: "flex",
                gap: "8px",
                overflowX: "auto",
                touchAction: "pan-y",
                overscrollBehaviorX: "contain",
                height: "120px",
              },
            },
            Array.from({ length: 6 }, (_, i) =>
              React.createElement(
                "div",
                { key: i, style: { flex: "0 0 260px", height: "100px", background: "#eee" } },
                "Card " + i,
              ),
            ),
          );
        }

        createRoot(document.getElementById("rail-host")).render(React.createElement(Rail));

        // Registered at the document, after mount, so it observes the
        // defaultPrevented flag the hook's own non-passive listener sets.
        window.__probe = { prevented: 0, moves: 0 };
        document.addEventListener(
          "touchmove",
          (event) => {
            const p = window.__probe;
            p.moves += 1;
            if (event.defaultPrevented) p.prevented += 1;
          },
          { passive: true },
        );
      `,
      resolveDir: appRoot,
      loader: "tsx",
    },
    bundle: true,
    format: "iife",
    write: false,
    logLevel: "warning",
  });

  const bundle = result.outputFiles[0].text;
  harnessDir = await mkdtemp(join(tmpdir(), "ui-directional-scroll-"));
  const html = join(harnessDir, "directional-scroll.html");
  await writeFile(
    html,
    fixture.replace("/*__BUNDLE__*/", () => bundle),
  );
  harnessUrl = pathToFileURL(html).href;
});

test.afterAll(async () => {
  if (harnessDir) await rm(harnessDir, { recursive: true, force: true });
});

type Probe = { prevented: number; moves: number };
type Snapshot = { probe: Probe; panelTop: number; windowY: number; railLeft: number };

const read = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => {
    const probe = (window as unknown as { __probe: Probe }).__probe;
    const panel = document.getElementById("panel") as HTMLElement;
    const rail = document.getElementById("rail") as HTMLElement;
    return {
      probe: { ...probe },
      panelTop: panel.scrollTop,
      windowY: window.scrollY,
      railLeft: rail.scrollLeft,
    };
  });

async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 10,
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
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    // A throwing send must not leak the CDP session into the next test.
    await cdp.detach().catch(() => {});
  }
  await page.waitForTimeout(200);
}

/** The hook adds inertia after release; wait until the rail actually stops. */
async function settleRail(page: Page) {
  await expect
    .poll(
      async () => {
        const before = (await read(page)).railLeft;
        await page.waitForTimeout(150);
        return (await read(page)).railLeft === before;
      },
      { timeout: 8_000, message: "rail inertia must settle" },
    )
    .toBe(true);
}

/** The probe is cumulative for the page; reset it around each measured gesture. */
const resetProbe = (page: Page) =>
  page.evaluate(() => {
    const probe = (window as unknown as { __probe: Probe }).__probe;
    probe.prevented = 0;
    probe.moves = 0;
  });

/**
 * Playwright does not fail a test on uncaught page errors, and the horizontal
 * inertia runs inside requestAnimationFrame after the last assertion, so a
 * throwing animation loop would otherwise be invisible.
 */
const pageErrors = new WeakMap<Page, string[]>();

const errorsFor = (page: Page): string[] => {
  const list = pageErrors.get(page);
  if (!list) throw new Error("page error collector not installed");
  return list;
};

const expectNoPageErrors = (page: Page) => {
  expect(errorsFor(page), "page must not throw while the hook runs").toEqual([]);
};

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  pageErrors.set(page, errors);

  await page.goto(harnessUrl);
  await page.waitForSelector("#rail");
});

test("a vertical drag that starts on the rail scrolls the panel, not the window", async ({
  page,
}) => {
  // Liveness anchor first: only the shipped hook can move a pan-y rail.
  const start = await read(page);
  await touchDrag(page, { x: 320, y: 60 }, { x: 90, y: 66 });
  expect((await read(page)).railLeft, "hook must be live on this page").toBeGreaterThan(
    start.railLeft,
  );
  await settleRail(page);

  // Measure the vertical gesture on its own: the probe is cumulative.
  await resetProbe(page);
  const afterHorizontal = await read(page);
  await touchDrag(page, { x: 200, y: 110 }, { x: 204, y: 30 });

  const after = await read(page);
  // The gesture began inside #panel, which is the nearest scrollable ancestor.
  expect(after.panelTop, "panel must consume the vertical drag").toBeGreaterThan(
    afterHorizontal.panelTop,
  );
  // The hook used to hijack this onto the document.
  expect(after.windowY, "page behind the panel must not move").toBe(afterHorizontal.windowY);
  expect(after.railLeft, "rail must not move horizontally").toBe(afterHorizontal.railLeft);
  expectNoPageErrors(page);
});

test("the rail never cancels a vertical touchmove", async ({ page }) => {
  const start = await read(page);
  await touchDrag(page, { x: 320, y: 60 }, { x: 90, y: 66 });
  expect((await read(page)).railLeft, "hook must be live on this page").toBeGreaterThan(
    start.railLeft,
  );
  await settleRail(page);

  await resetProbe(page);
  await touchDrag(page, { x: 200, y: 110 }, { x: 204, y: 30 });

  const after = await read(page);
  const moves = after.probe.moves;
  expect(moves, "the drag must produce real touchmove events").toBeGreaterThan(0);
  // Cancelling here is what killed native momentum and nested scrolling.
  expect(after.probe.prevented, "vertical touchmove must stay native").toBe(0);
  expectNoPageErrors(page);
});

test("horizontal drags still belong to the rail", async ({ page }) => {
  const before = await read(page);
  await touchDrag(page, { x: 320, y: 60 }, { x: 90, y: 66 });

  const after = await read(page);
  expect(after.railLeft, "horizontal drag must scroll the rail").toBeGreaterThan(before.railLeft);
  expect(after.panelTop, "a horizontal drag must not scroll the panel").toBe(before.panelTop);
  expectNoPageErrors(page);
});

test("a vertical drag outside the rail still scrolls the page natively", async ({ page }) => {
  const before = await read(page);
  await touchDrag(page, { x: 200, y: 700 }, { x: 204, y: 420 });

  const after = await read(page);
  expect(after.windowY, "page must scroll where nothing else can").toBeGreaterThan(before.windowY);
  expect(after.probe.prevented, "no hook listener on the page body").toBe(0);
  expectNoPageErrors(page);
});
