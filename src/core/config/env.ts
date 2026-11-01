/**
 * Centralised runtime configuration.
 *
 * All environment-dependent values (API endpoints, timeouts, feature flags,
 * analytics/push toggles) MUST be read from this module. Never reference
 * `import.meta.env.*` or hardcoded URLs from feature or UI code.
 *
 * Real values are wired via Vite `import.meta.env.VITE_*` variables at build
 * time and can be overridden per environment (development / staging /
 * production). Only publishable / non-secret values belong here.
 */

export type AppEnvironment = "development" | "staging" | "production";

const readEnv = (key: string, fallback = ""): string => {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return meta?.[key] ?? fallback;
};

const ENV_NAME = (readEnv("VITE_APP_ENV", "development") as AppEnvironment) || "development";

/**
 * True for RELEASE bundles (`vite build` → `import.meta.env.PROD`), whatever
 * `VITE_APP_ENV` says. The configured name alone was not enough: `.env` and
 * CI never set `VITE_APP_ENV`, so it defaulted to "development" and every
 * release build passed the production gates below.
 */
const IS_RELEASE_BUILD =
  (import.meta as unknown as { env?: Record<string, unknown> }).env?.PROD === true;

/**
 * True ONLY for an explicit `--mode staging` build (`npm run build:mobile:staging`
 * passes `--mode staging`). CUS-08: a staging bundle is a release build
 * (PROD=true) yet it is the one release target where a Razorpay TEST key is
 * correct, because staging cannot move real money.
 *
 * Deliberately narrow and separate from `IS_RELEASE_BUILD`/`ENV_NAME`:
 * - `vite build` with no `--mode` flag resolves MODE to "production", and
 *   `--mode production` obviously is not staging — both keep refusing test
 *   keys exactly as before.
 * - `VITE_APP_ENV` is NOT consulted: the production gates intentionally ignore
 *   it after a past bug skipped them that way.
 * - Use it ONLY for the publishable-key checks below — never to skip mock,
 *   demo or any other production guard.
 */
const BUILD_MODE = (import.meta as unknown as { env?: Record<string, unknown> }).env?.MODE;

const IS_STAGING_BUILD = BUILD_MODE === "staging";
export interface AppConfig {
  env: AppEnvironment;
  appName: string;
  appVersion: string;
  api: {
    baseUrl: string;
    timeoutMs: number;
    retry: { attempts: number; backoffMs: number };
  };
  featureFlags: {
    offlineMode: boolean;
    orderTracking: boolean;
    referrals: boolean;
    adminOps: boolean;
  };
  analytics: {
    enabled: boolean;
    writeKey: string;
  };
  push: {
    enabled: boolean;
    vapidPublicKey: string;
  };
  integrations: {
    // Publishable client key (safe to ship). Never store the secret here.
    razorpayKeyId: string;
    /** Optional real backend base URL for payment order + signature verification. */
    paymentsApiBaseUrl: string;
    petpoojaEnabled: boolean;
    mapsApiKey: string;
    firebaseConfig: string;
    /** Optional official Play Store listing (HTTPS) for force-update. */
    androidStoreUrl: string;
    /** Optional official App Store listing (HTTPS) for force-update. */
    iosStoreUrl: string;
  };
}

const BASE_BY_ENV: Record<AppEnvironment, string> = {
  development: "https://api.dev.burgonomics.example",
  staging: "https://api.staging.burgonomics.example",
  production: "https://api.burgonomics.example",
};

export const appConfig: AppConfig = {
  env: ENV_NAME,
  appName: readEnv("VITE_APP_NAME", "Burgonomics"),
  appVersion: readEnv("VITE_APP_VERSION", "1.0.0"),
  api: {
    // Accept both VITE_API_BASE_URL (canonical) and VITE_API_URL (mobile/native alias).
    baseUrl: readEnv("VITE_API_BASE_URL", readEnv("VITE_API_URL", BASE_BY_ENV[ENV_NAME])),
    timeoutMs: Number(readEnv("VITE_API_TIMEOUT_MS", "15000")),
    retry: {
      attempts: Number(readEnv("VITE_API_RETRY_ATTEMPTS", "2")),
      backoffMs: Number(readEnv("VITE_API_RETRY_BACKOFF_MS", "400")),
    },
  },
  featureFlags: {
    offlineMode: readEnv("VITE_FF_OFFLINE_MODE", "true") === "true",
    orderTracking: readEnv("VITE_FF_ORDER_TRACKING", "true") === "true",
    referrals: readEnv("VITE_FF_REFERRALS", "false") === "true",
    adminOps: readEnv("VITE_FF_ADMIN_OPS", "false") === "true",
  },
  analytics: {
    enabled: readEnv("VITE_ANALYTICS_ENABLED", "false") === "true",
    writeKey: readEnv("VITE_ANALYTICS_WRITE_KEY", ""),
  },
  push: {
    enabled: readEnv("VITE_PUSH_ENABLED", "false") === "true",
    vapidPublicKey: readEnv("VITE_PUSH_VAPID_PUBLIC_KEY", ""),
  },
  integrations: {
    // Publishable Razorpay key. No baked-in fallback: the old embedded test
    // keyId (split-string to dodge scanners) silently booted dev/staging on a
    // shared test key. Empty key = explicit simulation mode in the adapter.
    // Accept both VITE_RAZORPAY_KEY_ID (canonical) and VITE_RAZORPAY_KEY (alias).
    razorpayKeyId: readEnv("VITE_RAZORPAY_KEY_ID", readEnv("VITE_RAZORPAY_KEY", "")),
    paymentsApiBaseUrl: readEnv("VITE_PAYMENTS_API_BASE_URL", ""),
    petpoojaEnabled: readEnv("VITE_PETPOOJA_ENABLED", "false") === "true",
    // Accept both VITE_MAPS_API_KEY (canonical) and VITE_MAPS_KEY (alias).
    mapsApiKey: readEnv("VITE_MAPS_API_KEY", readEnv("VITE_MAPS_KEY", "")),
    // Publishable Firebase config as JSON string. Parsed by consumers.
    firebaseConfig: readEnv("VITE_FIREBASE_CONFIG", ""),
    // Optional official store listings for the force-update screen. Empty is
    // valid: the screen then offers the real support route instead of
    // inventing a store id. Values are allowlisted to HTTPS Play/App Store
    // listing URLs at the route boundary.
    androidStoreUrl: readEnv("VITE_ANDROID_STORE_URL", ""),
    iosStoreUrl: readEnv("VITE_IOS_STORE_URL", ""),
  },
};

// ── Production safety assertions ────────────────────────────────────────
/**
 * Publishable-key verdict for one build. Pure (and exported) so the CUS-08
 * regression test can exercise every build mode without booting a bundle.
 *
 * - Explicit staging build (`--mode staging`): a TEST key is correct here —
 *   staging cannot move real money — and a LIVE key is refused.
 * - Production gate (`ENV_NAME === "production"` OR any release bundle): a
 *   test key or no key is refused. Unchanged.
 */
export function razorpayKeyVerdict(
  keyId: string,
  build: { staging: boolean; productionGate: boolean },
): { level: "ok" | "warn" | "error"; message?: string } {
  if (build.staging) {
    if (!keyId) {
      return {
        level: "warn",
        message:
          "[burgonomics] Staging build has no Razorpay key configured. " +
          "Set VITE_RAZORPAY_KEY_ID (rzp_test_*) for staging; online payments fail closed until then.",
      };
    }
    if (keyId.startsWith("rzp_live_")) {
      return {
        level: "error",
        message:
          "[burgonomics] FATAL: Staging build is using a Razorpay LIVE key. " +
          "Set VITE_RAZORPAY_KEY_ID to a test key (rzp_test_*) — a live key must never be used on staging.",
      };
    }
    return { level: "ok" };
  }
  if (build.productionGate && (!keyId || keyId.startsWith("rzp_test_"))) {
    return {
      level: "error",
      message:
        "[burgonomics] FATAL: Production build is using a Razorpay TEST key or has no key configured. " +
        "Set VITE_RAZORPAY_KEY_ID to a live key before shipping.",
    };
  }
  return { level: "ok" };
}

// Fires for a configured production env OR any release bundle — a shipped
// build with VITE_APP_ENV unset (the historical default) must not skip it.
// CUS-08: an explicit `--mode staging` build is exempt from the "live key
// required" rule because staging legitimately runs on a test key; it gets the
// mirror-image rule instead (a LIVE key on staging is refused).
const rzpKeyVerdict = razorpayKeyVerdict(appConfig.integrations.razorpayKeyId, {
  staging: IS_STAGING_BUILD,
  productionGate: ENV_NAME === "production" || IS_RELEASE_BUILD,
});
if (rzpKeyVerdict.level === "error") {
  console.error(rzpKeyVerdict.message);
} else if (rzpKeyVerdict.level === "warn") {
  console.warn(rzpKeyVerdict.message);
}

export const isProd = () => appConfig.env === "production";
export const isStaging = () => appConfig.env === "staging";
export const isDev = () => appConfig.env === "development";
/** True for release bundles, regardless of the configured VITE_APP_ENV. */
export const isReleaseBuild = () => IS_RELEASE_BUILD;
/**
 * True only for an explicit `--mode staging` build (see IS_STAGING_BUILD).
 * Narrow on purpose: used only by the publishable-key gates, never to skip a
 * mock/demo/production guard. The optional `mode` argument is a test seam; call
 * sites use the build's own `--mode` value.
 */
export const isStagingBuild = (mode: unknown = BUILD_MODE): boolean => mode === "staging";
/**
 * The mode Vite resolved for this build (`--mode staging`, `--mode production`,
 * or "production" when no flag is passed). Exported for diagnostics/tests.
 */
export const buildMode = (): unknown => BUILD_MODE;

/**
 * True when the API base URL points at a real backend. The built-in
 * fallbacks are `.example` fixture hosts (no backend exists there), so
 * firing requests at them only produces CSP violations and console noise —
 * callers should short-circuit to offline/empty states instead.
 * (Mirrors the `.example` fixture rule in shared/utils/urlSafety.ts.)
 */
export const isLiveApiBaseUrl = (): boolean => {
  try {
    const host = new URL(appConfig.api.baseUrl).hostname.toLowerCase();
    return host !== "example.com" && !host.endsWith(".example");
  } catch {
    return false;
  }
};
