import type { CapacitorConfig } from "@capacitor/cli";
// Type-only: the plugin declarations narrow these two options to their enums,
// and `capacitor.config.ts` is now imported by `mobileBootstrap.system-bars.test.ts`,
// which puts it in the `tsc --noEmit` program for the first time. The literal
// values are unchanged and these imports are erased at build time, so the
// Capacitor CLI still loads this file with no runtime dependency on the plugin.
import type { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

/**
 * Capacitor configuration for BURGONOMICS mobile builds.
 *
 * The web frontend continues to ship via TanStack Start (SSR / Nitro).
 * For Android + iOS packaging we produce a static SPA bundle in
 * `dist/mobile` (see `vite.mobile.config.ts` + `npm run build:mobile`).
 * `webDir` points at that folder so `npx cap sync` succeeds.
 */
const config: CapacitorConfig = {
  appId: "com.burgonomics",
  appName: "BURGONOMICS",
  webDir: "dist/mobile",
  // `bundledWebRuntime` was removed from the Capacitor config schema in v4 and
  // is ignored by the v8 CLI — it only survived here because this file was
  // never part of a `tsc` program. Removed as dead config, not a behaviour
  // change: the mobile bundle is still copied into `dist/mobile` by Vite.
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
    // Defence in depth: without this, Capacitor enables the Web Inspector when
    // DEBUG is set or via the SPM CAPACITOR_DEBUG fallback, so inspection is
    // left to a build-time default. Explicit false removes that implicit path.
    // It is not evidence that any existing Release build was inspectable.
    webContentsDebuggingEnabled: false,
  },
  android: {
    allowMixedContent: false,
    // process.env is not the runtime env in a Vite bundle — the old check
    // silently left remote WebView debugging ON in shipped builds.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      // Manual hide from mobileBootstrap after first render — auto-hide on a
      // fixed timer races slow-device bundle load.
      launchAutoHide: false,
      backgroundColor: "#0E4825",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    // Core SystemBars (bundled with @capacitor/core) owns the status/navigation
    // bar on modern Android. `DARK` is not "dark icons": it means light
    // content on a dark background, which is what the deep-green (#0E4825)
    // header needs. Leaving this plugin unconfigured lets its DEFAULT theme
    // style override the legacy StatusBar block below on targetSdk 36.
    SystemBars: {
      style: "DARK",
      hidden: false,
      // Explicit at the plugin's own default: native inset padding plus the
      // --safe-area-inset-* CSS variables. Never `disable` — that would hand
      // all safe-area handling back to us and break notch/nav-bar layouts.
      insetsHandling: "css",
    },
    StatusBar: {
      // Legacy plugin enum, same visual meaning: "light text for dark
      // backgrounds". The old `LIGHT` asked for dark icons on the green bar.
      style: "DARK",
      backgroundColor: "#0E4825",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body" as KeyboardResize,
      style: "DARK" as KeyboardStyle,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Geolocation: {
      permissions: ["location"],
    },
    Haptics: {},
  },
};

export default config;
