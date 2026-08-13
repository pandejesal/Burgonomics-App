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
    captureInput: true,
    // Never enable the WebView debug bridge in production/release (resolves PLAT-4)
    webContentsDebuggingEnabled:
      process.env.NODE_ENV !== "production" && process.env.CAPACITOR_DEBUG === "true",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#023020",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // LIGHT icons on the deep-green (#023020) toolbar — DARK icons were invisible.
      style: "LIGHT",
      backgroundColor: "#023020",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
    },
    Geolocation: {
      // iOS: NSLocationWhenInUseUsageDescription must also be set in
      //   ios/App/App/Info.plist:
      //     <key>NSLocationWhenInUseUsageDescription</key>
      //     <string>BURGONOMICS uses your location to show nearby stores.</string>
      // Android: android/app/src/main/AndroidManifest.xml must declare:
      //     <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
      //     <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
      permissions: ["location"],
    },
  },
};

export default config;
