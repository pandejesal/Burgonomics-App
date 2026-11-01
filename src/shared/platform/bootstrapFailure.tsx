/**
 * Bootstrap failure presentation.
 *
 * Called from `src/mobile-entry.tsx` when the boot chain cannot be imported or
 * throws synchronously — e.g. the FR-004 Firebase fail-fast on a build without
 * configuration. Two device-visible guarantees:
 *
 *  1. The error screen is committed to the DOM BEFORE the native splash is
 *     hidden. The splash is configured `launchAutoHide: false`, and the only
 *     other hide site (`bootstrapNativePlatform`) never runs on this path, so
 *     without this the screen stays covered forever.
 *  2. Plugin failures are contained: a rejecting splash plugin cannot prevent
 *     the error screen from showing, and a failed render keeps the splash up
 *     instead of revealing a blank WebView.
 *
 * HARD CONSTRAINT: no Firebase / router / push imports here — this module runs
 * precisely when those fail to load.
 */
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { ConfigErrorScreen } from "../components/feedback/ConfigErrorScreen";
import { isNative } from "./platform";

const SPLASH_FADE_MS = 250;

/**
 * Renders the failure screen and flushes it to the DOM.
 * Returns false when the container could not be mounted — callers then leave
 * the native splash in place rather than revealing an empty page.
 */
function renderFailureScreen(rootEl: HTMLElement, error: unknown): boolean {
  try {
    // `boot()` may already have mounted a root before throwing. A second
    // `createRoot` on the same container is unsupported and can leave the
    // failure hidden behind the dead app, so clear the container first.
    rootEl.replaceChildren();
    const root = createRoot(rootEl);
    flushSync(() => {
      root.render(<ConfigErrorScreen error={error} />);
    });
    return true;
  } catch (renderError) {
    console.error("[burgonomics] bootstrap error screen could not be rendered", renderError);
    return false;
  }
}

async function hideSplashScreen(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: SPLASH_FADE_MS });
  } catch (pluginError) {
    console.warn("[burgonomics] splash screen could not be hidden after a bootstrap failure", pluginError);
  }
}

/**
 * Reveals the existing configuration error screen for any failed boot.
 *
 * Total function: it never throws, so the entry's catch handler cannot turn a
 * startup failure into an unhandled rejection.
 */
export async function revealBootstrapFailure(rootEl: HTMLElement, error: unknown): Promise<void> {
  if (!renderFailureScreen(rootEl, error)) return;
  await hideSplashScreen();
}
