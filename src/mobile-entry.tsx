/**
 * Mobile / SPA entry point.
 *
 * Used by `vite.mobile.config.ts` to emit a static bundle in `dist/mobile`
 * that Capacitor packages into Android + iOS shells. The SSR web build
 * (Nitro / TanStack Start) is unaffected and continues to use
 * `src/server.ts` + `src/start.ts`.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import { getRouter } from "./router";
import { bootstrapNativePlatform } from "./shared/platform/mobileBootstrap";

import { GlobalErrorBoundary } from "./shared/components/feedback/GlobalErrorBoundary";

const router = getRouter();

const rootEl = document.getElementById("app");
if (!rootEl) throw new Error("Missing #app root element");

createRoot(rootEl).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <RouterProvider router={router} />
    </GlobalErrorBoundary>
  </StrictMode>,
);

// Fire-and-forget: wires splash-screen hide, status bar, keyboard resize,
// deep links and app lifecycle when running inside a Capacitor shell.
void bootstrapNativePlatform();
