/**
 * Platform detection utilities.
 *
 * Safe to call from any environment (SSR, browser, native WebView). Never
 * throws when Capacitor is absent — the web bundle simply reports
 * `platform === "web"` and `isNative === false`.
 */

export type Platform = "web" | "ios" | "android";

interface CapacitorLike {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
}

const getCap = (): CapacitorLike | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { Capacitor?: CapacitorLike };
  return w.Capacitor ?? null;
};

// True only in production builds. Dependency-free on purpose (platform.ts
// must stay importable anywhere, incl. SSR) — no appConfig import.
const isProdBuild = (): boolean => {
  try {
    return (import.meta as any)?.env?.PROD === true;
  } catch {
    return false;
  }
};

export const getPlatform = (): Platform => {
  if (typeof window !== "undefined" && !isProdBuild()) {
    // Dev/test-only override (?platform=ios). Prod ignores it: the param
    // otherwise spoofs maps links, push channel setup, and the platform
    // string sent with token registration. Security gates use isNative()
    // (Capacitor check below), never this value — still, no spoofing in prod.
    const params = new URLSearchParams(window.location.search);
    const simulated = params.get("platform") || params.get("simulate");
    if (simulated === "ios" || simulated === "android") return simulated;
  }
  const cap = getCap();
  const p = cap?.getPlatform?.();
  if (p === "ios" || p === "android") return p;
  return "web";
};

export const isNative = (): boolean => {
  const cap = getCap();
  return Boolean(cap?.isNativePlatform?.());
};

export const isIOS = () => getPlatform() === "ios";
export const isAndroid = () => getPlatform() === "android";
export const isWeb = () => getPlatform() === "web";
