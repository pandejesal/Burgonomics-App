/**
 * Mobile / SPA entry point.
 *
 * Used by `vite.mobile.config.ts` to emit a static bundle in `dist/mobile`
 * that Capacitor packages into Android + iOS shells. The SSR web build
 * (Nitro / TanStack Start) is unaffected and continues to use
 * `src/server.ts` + `src/start.ts`.
 *
 * Boot goes through a dynamic import so a boot-time throw (e.g. the FR-004
 * Firebase misconfiguration fail-fast) renders ConfigErrorScreen instead
 * of a blank white page. The fail-fast itself is untouched — the app still
 * refuses to boot without configuration, loudly.
 */
// Web Crypto API polyfill for Android WebView < 105 — must load first
import "./shared/utils/webCryptoPolyfill";

import "./styles.css";
import { createRoot } from "react-dom/client";
import { ConfigErrorScreen } from "./shared/components/feedback/ConfigErrorScreen";

const rootEl = document.getElementById("app");
if (!rootEl) throw new Error("Missing #app root element");

void import("./boot").then(
  ({ boot }) => boot(rootEl),
  (err: unknown) => {
    createRoot(rootEl).render(<ConfigErrorScreen error={err} />);
  },
);
