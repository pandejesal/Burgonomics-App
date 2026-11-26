/**
 * SPA boot sequence (extracted from mobile-entry so the entry can catch a
 * boot-time throw — e.g. the FR-004 Firebase misconfiguration fail-fast —
 * and render ConfigErrorScreen instead of a blank white page).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import { bootstrapNativePlatform, registerRouterHistory } from "./shared/platform/mobileBootstrap";
import { initWebPush } from "./shared/platform/pushNotifications";
import { initNotificationPrefsSync } from "./features/settings/state/notificationPrefsStore";
import { initAppCheck } from "./core/config/firebase";

import { GlobalErrorBoundary } from "./shared/components/feedback/GlobalErrorBoundary";

export function boot(rootEl: HTMLElement): void {
  const router = getRouter();

  // Hardware BACK needs the router's own history, not `window.history.length`:
  // the router knows whether there is a previous in-app entry, and HashRouter
  // cold starts used to report "can go back" with nothing to pop.
  registerRouterHistory({
    back: () => router.history.back(),
    canGoBack: () => router.history.canGoBack(),
  });

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

  // Notification preferences: hydrate per uid, retry pending saves, and
  // reconcile multi-tab writes (never prompts for permission).
  initNotificationPrefsSync();

  // App Check attestation (web only; no-op without VITE_RECAPTCHA_SITE_KEY).
  void initAppCheck();
}
