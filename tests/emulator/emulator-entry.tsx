/**
 * EMULATOR TEST LANE — browser entry.
 *
 * Served only by `tests/emulator/vite.emulator.config.ts`, which rewrites the
 * existing `index.html` in memory to point `<script type="module">` here. The
 * normal Vite config and `src/mobile-entry.tsx` are untouched.
 *
 * Order matters:
 *   1. badge (must be visible even when the connector or boot throws)
 *   2. validate the demo/loopback target (no Firebase app yet)
 *   3. import the app's Firebase singleton and connect the emulator
 *   4. boot the unmodified app
 *
 * A throw at any step renders the existing `ConfigErrorScreen` — never a blank
 * page and never a fallback to a real endpoint.
 */
import "@/shared/utils/webCryptoPolyfill";
import "@/styles.css";

import { createRoot } from "react-dom/client";

import { ConfigErrorScreen } from "@/shared/components/feedback/ConfigErrorScreen";
import {
  EMULATOR_FIRESTORE_HOST,
  EMULATOR_FIRESTORE_PORT,
  EMULATOR_LABEL,
  EMULATOR_LANE_MARKER,
  connectEmulator,
  realEmulatorDeps,
  type EmulatorTarget,
} from "./connect-emulators";

const BADGE_ID = "emulator-lane-badge";

/**
 * Fixed, pointer-transparent overlay. Bottom-anchored so it never covers the
 * sticky header/search seam the geometry assertions measure, and `pointer-events:
 * none` so it can never intercept a tap or an `elementFromPoint` probe.
 */
function mountEmulatorBadge(): void {
  if (document.getElementById(BADGE_ID)) return;
  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.setAttribute("role", "note");
  badge.setAttribute("data-emulator-lane-label", "true");
  badge.textContent = EMULATOR_LABEL;
  badge.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "bottom:0",
    "z-index:2147483647",
    "padding:4px 8px",
    "background:#7c2d12",
    "color:#ffffff",
    "border-top:2px solid #ffffff",
    "font:700 11px/1.25 system-ui,-apple-system,'Segoe UI',sans-serif",
    "letter-spacing:0.04em",
    "text-align:center",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(badge);
}

/** The lane target, derived from the synthetic env the runner sets. */
function readTarget(): EmulatorTarget {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  return {
    projectId: projectId ?? "",
    host: EMULATOR_FIRESTORE_HOST,
    port: EMULATOR_FIRESTORE_PORT,
  };
}

/**
 * The in-memory HTML transform widens CSP `connect-src` to loopback:8099. If that
 * transform ever stops applying, WebChannel would be blocked and every read would
 * look like an empty catalogue. Fail loudly instead of misreporting "no stores".
 */
function assertEmulatorCsp(): void {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const content = meta?.getAttribute("content") ?? "";
  const expected = `${EMULATOR_FIRESTORE_HOST}:${EMULATOR_FIRESTORE_PORT}`;
  if (!content.includes(expected)) {
    throw new Error(
      `[emulator-lane] CSP does not allow ${expected}; the HTML transform did not apply.`,
    );
  }
}

mountEmulatorBadge();

const rootEl = document.getElementById("app");
if (!rootEl) throw new Error("Missing #app root element");

void (async () => {
  assertEmulatorCsp();
  await connectEmulator(readTarget(), realEmulatorDeps());
  const { boot } = await import("@/boot");
  boot(rootEl);
})().catch((err: unknown) => {
  // Expose the failure for the harness log without inventing UI state.
  (globalThis as Record<string, unknown>)[EMULATOR_LANE_MARKER] = {
    failed: true,
    message: err instanceof Error ? err.message : String(err),
  };
  createRoot(rootEl).render(<ConfigErrorScreen error={err} />);
});
