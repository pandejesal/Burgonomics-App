/**
 * Canonical Cloud Functions API base.
 *
 * Extracted from the Petpooja HTTP gateway so every caller that talks to the
 * Functions app resolves the SAME base. `appConfig.api.baseUrl`
 * (`src/core/config/env.ts`) falls back to the placeholder
 * `https://api.dev.burgonomics.example`, which no browser can reach (CSP) and
 * which serves no `/checkout/fees`; using it for fee quotes was CUS-13.
 *
 * Resolution order (unchanged from the gateway):
 *   1. VITE_PETPOOJA_PROXY_URL
 *   2. VITE_FUNCTIONS_API_URL
 *   3. https://asia-south1-<project>.cloudfunctions.net/api
 *
 * NOTE: `VITE_PAYMENTS_API_BASE_URL` ends in `/api/payments`, so it is NOT a
 * valid base for sibling routes such as `/checkout/fees`.
 */
export function defaultFunctionsBase(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_PETPOOJA_PROXY_URL) return env.VITE_PETPOOJA_PROXY_URL.replace(/\/$/, "");
  if (env.VITE_FUNCTIONS_API_URL) return env.VITE_FUNCTIONS_API_URL.replace(/\/$/, "");
  const projectId = env.VITE_FIREBASE_PROJECT_ID || "burgonomics-7faa8";
  return `https://asia-south1-${projectId}.cloudfunctions.net/api`;
}
