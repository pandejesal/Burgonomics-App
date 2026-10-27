/**
 * EMULATOR TEST LANE — test-only Vite config.
 *
 * Scope (contract §1/§3): this config exists so the *existing* app can be served
 * against a local Firestore emulator without editing `src/**`, `index.html`, the
 * real `vite.config.ts`, or the release bundle.
 *
 * What it does:
 *  - rewrites `index.html` IN MEMORY only: entry -> `tests/emulator/emulator-entry.tsx`,
 *    CSP widened to loopback:8099 only, Google Fonts links dropped (no font-fidelity
 *    claim is made for this lane);
 *  - `envDir: false` so no local `.env*` file can be read — the runner sets only
 *    synthetic `VITE_*` values;
 *  - binds 127.0.0.1:5199 with `strictPort` so a busy port aborts instead of
 *    silently shifting to another one.
 *
 * Deliberately NOT included:
 *  - `TanStackRouterVite` — it regenerates `src/routeTree.gen.ts`, which is owned
 *    elsewhere. The committed route tree is used as-is.
 *  - any mock/fixture plugin: all data comes from the real Firestore SDK.
 */
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import {
  EMULATOR_FIRESTORE_HOST,
  EMULATOR_FIRESTORE_PORT,
  EMULATOR_LABEL,
} from "./lane-constants.ts";

// The lane runner always spawns Vite with the worktree root as cwd. Assert it
// instead of relying on `__dirname` (unsupported by Vite's future native config
// loader and unavailable when a config is evaluated as ESM).
const PROJECT_ROOT = process.cwd();
const VITE_CACHE_DIR = path.join(
  // Never fall back into the repo: the cache belongs in TEMP, like every other
  // artifact this lane produces.
  process.env.EMULATOR_LANE_ARTIFACTS ??
    path.join(os.tmpdir(), "opencode", "phase1-emulator-browser"),
  "vite-cache",
);
if (!existsSync(path.join(PROJECT_ROOT, "index.html"))) {
  throw new Error(
    `[emulator-lane] cwd ${PROJECT_ROOT} is not the customer worktree root (no index.html). The lane runner must spawn Vite from the repo root.`,
  );
}
const ENTRY_SOURCE = "/src/mobile-entry.tsx";
const ENTRY_LANE = "/tests/emulator/emulator-entry.tsx";

/**
 * Loopback-only CSP. Compared with the shipped one this drops `https:`,
 * `capacitor://localhost`, Razorpay/Google/functions origins and `wss:` entirely,
 * so an accidental production call is blocked by the browser as well as by the
 * Playwright request guard.
 */
const EMULATOR_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self' http://${EMULATOR_FIRESTORE_HOST}:${EMULATOR_FIRESTORE_PORT}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** Pure HTML rewrite — throws when the source drifts instead of serving a wrong entry. */
function rewriteIndexHtml(html: string): string {
  const entryPattern =
    /<script\s+type="module"\s+src="\/src\/mobile-entry\.tsx"\s*><\/script>/;
  if (!entryPattern.test(html)) {
    throw new Error(
      `[emulator-lane] index.html no longer contains the module entry ${ENTRY_SOURCE}; refusing to serve a lane that boots the wrong entry.`,
    );
  }

  let out = html.replace(
    entryPattern,
    `<script type="module" src="${ENTRY_LANE}"></script>`,
  );

  const cspPattern =
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/?>/;
  if (!cspPattern.test(out)) {
    throw new Error(
      "[emulator-lane] index.html has no CSP meta tag; the lane cannot prove a loopback-only connect policy.",
    );
  }
  out = out.replace(
    cspPattern,
    `<meta http-equiv="Content-Security-Policy" content="${EMULATOR_CSP}" />`,
  );

  // Font fidelity is explicitly NOT claimed in this lane. Removing the requests
  // (rather than allowing them) keeps the "zero non-loopback requests" assertion
  // meaningful.
  out = out.replace(
    /\s*<link[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/g,
    "",
  );
  if (/fonts\.(?:googleapis|gstatic)\.com/.test(out)) {
    throw new Error("[emulator-lane] external font links survived the HTML rewrite");
  }

  out = out.replace(
    "</head>",
    `  <meta name="emulator-lane" content="${EMULATOR_LABEL}" />\n  </head>`,
  );

  if (!out.includes(ENTRY_LANE) || !out.includes(EMULATOR_CSP)) {
    throw new Error("[emulator-lane] HTML rewrite did not apply");
  }
  return out;
}

function emulatorHtmlPlugin(): Plugin {
  return {
    name: "burgonomics-emulator-lane-html",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return rewriteIndexHtml(html);
      },
    },
  };
}

export default defineConfig({
  root: PROJECT_ROOT,
  // Keep Vite's dependency cache OUT of the shared node_modules junction.
  cacheDir: VITE_CACHE_DIR,
  // No .env / .env.local / .env.*.local is loaded. Only the runner's synthetic
  // process env reaches `import.meta.env`.
  envDir: false,
  plugins: [emulatorHtmlPlugin(), react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(PROJECT_ROOT, "src") },
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("development"),
    "import.meta.env.IS_CAPACITOR_BUILD": "false",
  },
  server: {
    host: EMULATOR_FIRESTORE_HOST,
    port: 5199,
    strictPort: true,
    // The harness owns the process; never auto-open a browser.
    open: false,
  },
  clearScreen: false,
  logLevel: "info",
});
