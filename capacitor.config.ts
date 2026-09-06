import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for BURGONOMICS mobile builds.
 *
 * The web frontend continues to ship via TanStack Start (SSR / Nitro).
 * For Android + iOS packaging we produce a static SPA bundle in
 * `dist/mobile` (see `vite.mobile.config.ts` + `bun run build:mobile`).
 * `webDir` points at that folder so `npx cap sync` succeeds.
 */
const config: CapacitorConfig = {
  appId: "com.glassdoorsstudio.burgonomics",
  appName: "BURGONOMICS",
  webDir: "dist/mobile",
  bundledWebRuntime: false,
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
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
    StatusBar: {
      // LIGHT icons on the deep-green (#0E4825) toolbar — DARK icons were invisible.
      style: "LIGHT",
      backgroundColor: "#0E4825",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Geolocation: {
      permissions: ['location'],
    },
    Haptics: {},
  },
};

export default config;
