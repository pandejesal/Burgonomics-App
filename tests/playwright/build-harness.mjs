/**
 * Builds the offline B02 Playwright harness: bundles the REAL AppButton
 * component (no mocks) and inlines it into the static harness page.
 * Output is app-button-harness.html, loaded over file:// by the spec —
 * no dev server, no port (A02 owns 4175; root config owns 5173/5174).
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");

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
const html = readFileSync(resolve(here, "app-button-harness.template.html"), "utf8").replace(
  "/*__B02_BUNDLE__*/",
  () => bundle, // function replacer: $ patterns in the bundle stay literal
);
const out = resolve(here, "app-button-harness.html");
writeFileSync(out, html);
console.log(`B02 harness written: ${out} (${(html.length / 1024).toFixed(0)} KB)`);
