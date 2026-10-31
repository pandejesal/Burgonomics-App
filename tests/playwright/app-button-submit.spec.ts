import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * B02 — AppButton native submit semantics, proven in a REAL browser
 * (Chromium via Playwright, offline file:// page, no mocks, no server/port
 * collisions with A02's 4175 or the root config's 5173/5174).
 *
 * The harness page is built HERE, from app-button-harness.tsx, on every run.
 * It used to load a prebuilt app-button-harness.html, which meant the suite
 * kept passing against a stale bundle after AppButton.tsx changed. Building
 * from the same source the tests claim to cover removes that drift.
 *
 * Each case counts the real click and submit events the browser fires.
 */

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");

let harnessUrl = "";
let harnessDir = "";

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [resolve(here, "app-button-harness.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    alias: { "@": resolve(appRoot, "src") },
    define: { "process.env.NODE_ENV": '"production"' },
    write: false,
    logLevel: "warning",
  });

  const bundle = result.outputFiles[0].text;
  const template = await readFile(resolve(here, "app-button-harness.template.html"), "utf8");
  // Function replacer: `$` patterns inside the bundle must stay literal.
  const html = template.replace("/*__B02_BUNDLE__*/", () => bundle);

  harnessDir = await mkdtemp(join(tmpdir(), "b02-harness-"));
  const file = join(harnessDir, "app-button-harness.html");
  await writeFile(file, html);
  harnessUrl = pathToFileURL(file).href;
});

test.afterAll(async () => {
  if (harnessDir) await rm(harnessDir, { recursive: true, force: true });
});

type Counts = { submits: number; clicks: number };
type KeyboardCounts = { submits: number };
type Bag = Record<string, Counts | KeyboardCounts>;

const readBag = async (page: Page): Promise<Bag> =>
  (await page.evaluate(() => (window as unknown as { __B02__: Bag }).__B02__)) as Bag;
const of = (bag: Bag, key: string) => bag[key] as Counts;

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  // Attach before navigation so errors thrown during load are still reported.
  (page as Page & { _b02Errors?: string[] })._b02Errors = pageErrors;

  await page.goto(harnessUrl);
  await expect(page.locator("#mount-inside button")).toBeVisible();
});

test.afterEach(async ({ page }) => {
  // A thrown error inside the page (e.g. an unhandled rejection surfacing)
  // would mean the harness or component is broken, not the browser.
  const errors = (page as Page & { _b02Errors?: string[] })._b02Errors ?? [];
  expect(errors).toEqual([]);
});

test("submit button inside a form fires the form's submit exactly once", async ({ page }) => {
  const button = page.locator("#mount-inside button");
  await expect(button).toHaveAttribute("type", "submit");

  await button.click();

  const bag = await readBag(page);
  expect(of(bag, "inside")).toEqual({ submits: 1, clicks: 1 });
});

test("button associated via the form attribute (sticky footer) submits exactly once", async ({
  page,
}) => {
  const button = page.locator("#mount-footer button");
  await expect(button).toHaveAttribute("form", "footer-form");

  // Native ownership: the form is a plain element outside the React tree.
  const ownerId = await page.evaluate(
    () => (document.querySelector("#mount-footer button") as HTMLButtonElement).form?.id,
  );
  expect(ownerId).toBe("footer-form");

  await button.click();

  const bag = await readBag(page);
  expect(of(bag, "footer")).toEqual({ submits: 1, clicks: 1 });
});

test("onClick calling preventDefault blocks the native submit", async ({ page }) => {
  await page.locator("#mount-prevented button").click();

  const bag = await readBag(page);
  expect(of(bag, "prevented")).toEqual({ submits: 0, clicks: 1 });
});

test("loading button blocks everything: no click, no submit", async ({ page }) => {
  const button = page.locator("#mount-loading button");
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button).toHaveAttribute("aria-disabled", "true");

  // The real DOM activation API on a disabled control: the platform must
  // not activate it (no click event, hence no submit).
  await page.$eval("#mount-loading button", (el) => (el as HTMLButtonElement).click());

  const bag = await readBag(page);
  expect(of(bag, "loading")).toEqual({ submits: 0, clicks: 0 });
});

test("default button does not submit the surrounding form", async ({ page }) => {
  const button = page.locator("#mount-normal button");
  await expect(button).toHaveAttribute("type", "button");

  await button.click();

  const bag = await readBag(page);
  expect(of(bag, "normal")).toEqual({ submits: 0, clicks: 1 });
});

test("keyboard Enter on a real submit button submits once (platform activation)", async ({
  page,
}) => {
  const button = page.locator("#mount-keyboard button");
  await expect(button).toHaveAttribute("type", "submit");

  await button.focus();
  await page.keyboard.press("Enter");

  const bag = await readBag(page);
  // The keyboard case mounts no onClick counter (see app-button-harness.tsx
  // case 6), so its bag carries submits only — asserting `clicks: 0` here
  // compared an undefined field and failed even when the platform submitted
  // exactly once. The submit count is the behaviour under test.
  expect(bag.keyboard).toEqual({ submits: 1 });
});
