/**
 * Secure storage abstraction.
 *
 * On web this proxies `window.localStorage` behind a namespaced key
 * prefix. When the app is repackaged into a native shell (Capacitor /
 * React Native) this is the single seam that swaps to Keychain /
 * Keystore-backed storage — no feature code needs to change.
 *
 * Callers MUST treat this as async-safe (all methods return Promises)
 * so the native implementation can be dropped in without refactors.
 */

import { isNative } from "@/shared/platform/platform";

const NAMESPACE = "burg.secure.";
const memoryFallback = new Map<string, string>();

async function nativePrefGet(fullKey: string): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
    const val = await SecureStorage.get(fullKey);
    return typeof val === "string" ? val : val ? String(val) : null;
  } catch {
    return null;
  }
}

async function nativePrefSet(fullKey: string, value: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
    await SecureStorage.set(fullKey, value);
    return true;
  } catch {
    return false;
  }
}

async function nativePrefRemove(fullKey: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
    await SecureStorage.remove(fullKey);
    return true;
  } catch {
    return false;
  }
}

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    const fullKey = NAMESPACE + key;
    if (isNative()) {
      const val = await nativePrefGet(fullKey);
      if (val !== null) return val;
    }
    if (typeof window === "undefined") return memoryFallback.get(fullKey) ?? null;
    try {
      return window.localStorage.getItem(fullKey);
    } catch {
      return memoryFallback.get(fullKey) ?? null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    const fullKey = NAMESPACE + key;
    memoryFallback.set(fullKey, value);
    if (isNative()) {
      const ok = await nativePrefSet(fullKey, value);
      if (ok) return;
    }
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(fullKey, value);
    } catch {
      /* storage quota exceeded or restricted; retained in memoryFallback */
    }
  },
  async remove(key: string): Promise<void> {
    const fullKey = NAMESPACE + key;
    memoryFallback.delete(fullKey);
    if (isNative()) {
      const ok = await nativePrefRemove(fullKey);
      if (ok) return;
    }
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(fullKey);
    } catch {
      /* ignore storage removal exception */
    }
  },
};

export const SECURE_KEYS = {
  ACCESS_TOKEN: "auth.accessToken",
  REFRESH_TOKEN: "auth.refreshToken",
  USER: "auth.user",
} as const;
