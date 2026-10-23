/**
 * Mobile / SPA entry point.
 *
 * Used by `vite.mobile.config.ts` to emit a static bundle in `dist/mobile`
 * that Capacitor packages into Android + iOS shells. The SSR web build
 * (Nitro / TanStack Start) is unaffected and continues to use
 * `src/server.ts` + `src/start.ts`.
 *
 * Boot goes through a dynamic import so a boot-time throw (e.g. the FR-004
 * Firebase misconfiguration fail-fast) renders ConfigErrorScreen instead of a
 * blank white page. The fail-fast itself is untouched — the app still refuses
 * to boot without configuration, loudly.
 *
 * Both failure shapes land on the same handler: the dynamic import rejecting
 * (Firebase App Check / plugin failing to load) and `boot()` throwing
 * synchronously. The handler hides the native splash only after the error
 * screen has mounted — `bootstrapNativePlatform()` owns that hide on the
 * success path and never runs here, and the splash has `launchAutoHide: false`.
 */
// Web Crypto API polyfill for Android WebView < 105 — must load first
import "./shared/utils/webCryptoPolyfill";

import "./styles.css";
import { revealBootstrapFailure } from "./shared/platform/bootstrapFailure";

const rootEl = document.getElementById("app");
if (!rootEl) throw new Error("Missing #app root element");

void (async () => {
  try {
    const { boot } = await import("./boot");
    boot(rootEl);
  } catch (err) {
    await revealBootstrapFailure(rootEl, err);
  }
})();
