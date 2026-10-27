/**
 * Secure storage abstraction.
 *
 * SECURITY MODEL (read before storing tokens here):
 * - On web this is namespaced `window.localStorage` — it is NOT encrypted
 *   and NOT tamper-proof. Any value written here (including auth tokens)
 *   sits in plaintext in the browser's localStorage. Do not frame this as
 *   "secure" storage on web; it only isolates keys behind a prefix.
 * - When the app is repackaged into a native shell (Capacitor / React
 *   Native) this is the single seam that swaps to Keychain / Keystore-
 *   backed storage — no feature code needs to change.
 * - There is NO TTL / expiry mechanism. Values persist until `remove()` is
 *   called or the user clears site data. Callers that need expiry must
 *   implement it themselves (e.g. store an `expiresAt` alongside the value
 *   and check it on read).
 *
 * Callers MUST treat this as async-safe (all methods return Promises)
 * so the native implementation can be dropped in without refactors.
 */

import { isNative } from "@/shared/platform/platform";
import { logger } from "@/core/logging/logger";

const NAMESPACE = "burg.secure.";
const memoryFallback = new Map<string, string>();

export const SECURE_KEYS = {
  ACCESS_TOKEN: "auth.accessToken",
  REFRESH_TOKEN: "auth.refreshToken",
  USER: "auth.user",
  // Retry-only copy of the FCM token for a failed logout unlink (F3/B2).
  // Registration never reads this key; only pendingUnlink.ts does.
  PENDING_UNLINK_TOKEN: "notifications.pendingUnlinkToken",
  // UID-only marker for an SDK user left behind by a cancelled auth attempt.
  // Never stores a phone number, code, or token.
  AUTH_QUARANTINED_UID: "auth.quarantinedUid",
} as const;

/**
 * Credential-class keys. On web these already sit in plaintext localStorage
 * (see the security model above), but on NATIVE the whole point is the
 * Keychain/Keystore. If that write fails, falling back to localStorage would
 * silently downgrade a credential to a plaintext WebView store — so these
 * keys fail closed instead. Non-sensitive preferences keep the fallback.
 */
const TOKEN_CLASS_KEYS: ReadonlySet<string> = new Set([
  SECURE_KEYS.ACCESS_TOKEN,
  SECURE_KEYS.REFRESH_TOKEN,
  // Push tokens are not auth credentials, but a retry copy that silently
  // downgraded to plaintext on native would defeat the retry-only contract.
  SECURE_KEYS.PENDING_UNLINK_TOKEN,
]);

const isTokenClassKey = (key: string) => TOKEN_CLASS_KEYS.has(key);

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
    if (isNative()) {
      const ok = await nativePrefSet(fullKey, value);
      if (ok) {
        memoryFallback.set(fullKey, value);
        return;
      }
      if (isTokenClassKey(key)) {
        // FAIL CLOSED: never write a credential to plaintext storage when the
        // platform keystore refused it. Also drop any previously-planted
        // plaintext copy so a stale token cannot outlive the keystore.
        memoryFallback.delete(fullKey);
        if (typeof window !== "undefined") {
          try {
            window.localStorage.removeItem(fullKey);
          } catch {
            /* restricted storage — nothing more to scrub */
          }
        }
        logger.warn("secureStorage.nativeWriteFailedTokenKey", { key });
        return;
      }
    }
    memoryFallback.set(fullKey, value);
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
