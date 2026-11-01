import type { Plugin } from "vite";

export function assertReleaseConfig(mode: string, env: Record<string, string | undefined>): void {
  const key = env.VITE_RAZORPAY_KEY_ID || env.VITE_RAZORPAY_KEY || "";
  if (mode === "development") return;
  if (mode === "staging") {
    if (key.startsWith("rzp_live_")) throw new Error("Staging cannot use a Razorpay LIVE key");
    return;
  }
  if (!/^rzp_live_[A-Za-z0-9]{8,}$/.test(key)) throw new Error("Production requires VITE_RAZORPAY_KEY_ID with a valid LIVE publishable key (not test, blank or placeholder)");
  if (env.VITE_APP_ENV !== "production") throw new Error("Production requires VITE_APP_ENV=production");
  for (const name of ["VITE_API_BASE_URL", "VITE_PAYMENTS_API_BASE_URL"]) {
    const value = env[name] || (name === "VITE_API_BASE_URL" ? env.VITE_API_URL : "");
    let url: URL;
    try { url = new URL(value || ""); } catch { throw new Error(`Production requires ${name} with a real HTTPS URL`); }
    if (url.protocol !== "https:" || url.hostname === "localhost" || url.hostname.endsWith(".example") || url.hostname.endsWith(".invalid")) throw new Error(`Production requires ${name} with a real HTTPS URL`);
  }
}

export function releaseConfigGuard(): Plugin {
  return { name: "production-release-config", configResolved(config) {
    if (config.command === "build") assertReleaseConfig(config.mode, config.env);
  } };
}
