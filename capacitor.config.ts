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
      // EMULATOR audit 2026-11-26: the full-screen/immersive splash hid the
      // system bars and the activity came back with a dead band at the top.
      // The splash now sits under the normal bars, whose launch-theme colours
      // (android/app/src/main/res/values/styles.xml) keep the icons visible.
      splashFullScreen: false,
      splashImmersive: false,
    },
    // Core SystemBars (bundled with @capacitor/core) owns the status/navigation
    // bar on modern Android. `DEFAULT` means "follow the device appearance",
    // which is right for the first frame: the activity's window background
    // comes from res/values{-night}/colors.xml, so light mode gets a light bar
    // with dark icons and dark mode a #121212 bar with light icons. The runtime
    // chrome (src/shared/platform/statusBarChrome.ts) then re-applies the
    // app's own resolved theme, which may differ from the device one.
    //
    // Pinning `DARK` here (the old value) is what produced light icons over a
    // light surface whenever the app theme and the device theme disagreed.
    SystemBars: {
      style: "DEFAULT",
      hidden: false,
      // Explicit at the plugin's own default: native inset padding plus the
      // --safe-area-inset-* CSS variables. Never `disable` — that would hand
      // all safe-area handling back to us and break notch/nav-bar layouts.
      insetsHandling: "css",
    },
    StatusBar: {
      // Legacy surface (Android <= 14 and iOS). `DEFAULT` follows the device
      // appearance — a #FFFFFF bar with dark icons in light mode, #121212 with
      // light icons in dark mode — which is exactly what the native launch
      // theme (res/values{-night}/colors.xml) already paints on the first
      // frame. The runtime chrome then re-applies the app's own resolved theme.
      style: "DEFAULT",
      backgroundColor: "#FFFFFF",
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
