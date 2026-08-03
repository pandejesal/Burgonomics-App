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
    // Publishable Razorpay key — only fall back to test key in non-production.
    // Accept both VITE_RAZORPAY_KEY_ID (canonical) and VITE_RAZORPAY_KEY (alias).
    razorpayKeyId: readEnv(
      "VITE_RAZORPAY_KEY_ID",
      readEnv("VITE_RAZORPAY_KEY", ENV_NAME === "production" ? "" : "rzp_test_TDmKPAQdJfbv6Z"),
    ),
    paymentsApiBaseUrl: readEnv("VITE_PAYMENTS_API_BASE_URL", ""),
    petpoojaEnabled: readEnv("VITE_PETPOOJA_ENABLED", "false") === "true",
    // Accept both VITE_MAPS_API_KEY (canonical) and VITE_MAPS_KEY (alias).
    mapsApiKey: readEnv("VITE_MAPS_API_KEY", readEnv("VITE_MAPS_KEY", "")),
    // Publishable Firebase config as JSON string. Parsed by consumers.
    firebaseConfig: readEnv("VITE_FIREBASE_CONFIG", ""),
  },
};

// ── Production safety assertions ────────────────────────────────────────
if (ENV_NAME === "production") {
  const rzpKey = appConfig.integrations.razorpayKeyId;
  if (!rzpKey || rzpKey.startsWith("rzp_test_")) {
    console.error(
      "[burgonomics] FATAL: Production build is using a Razorpay TEST key or has no key configured. " +
        "Set VITE_RAZORPAY_KEY_ID to a live key before shipping.",
    );
  }
}

export const isProd = () => appConfig.env === "production";
export const isStaging = () => appConfig.env === "staging";
export const isDev = () => appConfig.env === "development";
