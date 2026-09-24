/**
 * SPA boot sequence (extracted from mobile-entry so the entry can catch a
 * boot-time throw — e.g. the FR-004 Firebase misconfiguration fail-fast —
 * and render ConfigErrorScreen instead of a blank white page).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import { bootstrapNativePlatform } from "./shared/platform/mobileBootstrap";
import { initWebPush } from "./shared/platform/pushNotifications";
import { initAppCheck } from "./core/config/firebase";

import { GlobalErrorBoundary } from "./shared/components/feedback/GlobalErrorBoundary";

export function boot(rootEl: HTMLElement): void {
  const router = getRouter();

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

  // Web push: resumes only when permission was already granted (never prompts).
  void initWebPush();

  // App Check attestation (web only; no-op without VITE_RECAPTCHA_SITE_KEY).
  void initAppCheck();
}
