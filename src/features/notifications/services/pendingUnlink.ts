/**
 * Bounded logout-unlink retry (contract F3/B2).
 *
 * A failed/unconfirmed logout unlink must not leave the previous customer's
 * token bound to the next person on the device. We keep a small retry entry
 * plus a retry-only token copy in the secure-storage adapter. Registration
 * never reads that copy; only this module replays it, only under the SAME
 * uid, and only while the attempt/TTL budget allows.
 *
 * Drop rules (no loop, no cross-UID send): 3 attempts, 7 days, token hash
 * mismatch (rotation), or a different-uid sign-in.
 */
import { secureStorage, SECURE_KEYS } from "@/core/storage/secureStorage";
import { notificationsService } from "@/features/notifications/services/notificationsService";
import { currentScopedUid } from "@/features/auth/utils/scopedPersistence";
import { logger } from "@/core/logging/logger";

export const PENDING_UNLINK_STORAGE_KEY = "burg.pendingUnlink.v1";
export const PENDING_UNLINK_MAX_ATTEMPTS = 3;
export const PENDING_UNLINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingUnlinkReason = "failed" | "timeout";

export interface PendingUnlinkRecord {
  uid: string;
  tokenHash: string;
  attempts: number;
  at: number;
  reason: PendingUnlinkReason;
}

const memoryFallback = new Map<string, string>();

function storageGet(key: string): string | null {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  }
  return memoryFallback.get(key) ?? null;
}

function storageSet(key: string, value: string): void {
  memoryFallback.set(key, value);
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // in-memory copy keeps retry viable for this session
  }
}

function storageRemove(key: string): void {
  memoryFallback.delete(key);
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Fingerprint used only for equality (rotation detection), never as a
 * credential. SHA-256 when the runtime exposes WebCrypto, FNV-1a otherwise.
 */
export async function hashToken(token: string): Promise<string> {
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;
  if (cryptoObj?.subtle) {
    try {
      const bytes = new TextEncoder().encode(token);
      const digest = await cryptoObj.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // Fall through to the deterministic non-crypto fingerprint.
    }
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a_${hash.toString(16).padStart(8, "0")}`;
}

function isValidRecord(value: unknown): value is PendingUnlinkRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.uid === "string" &&
    record.uid.length > 0 &&
    typeof record.tokenHash === "string" &&
    record.tokenHash.length > 0 &&
    typeof record.attempts === "number" &&
    Number.isInteger(record.attempts) &&
    record.attempts >= 0 &&
    typeof record.at === "number" &&
    Number.isFinite(record.at) &&
    (record.reason === "failed" || record.reason === "timeout")
  );
}

export function readPendingUnlink(): PendingUnlinkRecord | null {
  const raw = storageGet(PENDING_UNLINK_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeRecord(record: PendingUnlinkRecord): void {
  storageSet(PENDING_UNLINK_STORAGE_KEY, JSON.stringify(record));
}

export async function clearPendingUnlink(): Promise<void> {
  storageRemove(PENDING_UNLINK_STORAGE_KEY);
  await secureStorage.remove(SECURE_KEYS.PENDING_UNLINK_TOKEN);
}

export async function dropPendingUnlink(reason: string): Promise<void> {
  const hadEntry = readPendingUnlink() !== null;
  await clearPendingUnlink();
  if (hadEntry) logger.info("pendingUnlinkDropped", { reason });
}

/**
 * Persists the retry entry AND a retry-only token copy. If the secure copy
 * cannot be read back (native keystore failure), the entry is dropped rather
 * than retried tokenless.
 */
export async function writePendingUnlink(input: {
  uid: string;
  token: string;
  reason: PendingUnlinkReason;
}): Promise<boolean> {
  if (!input.uid || !input.token) return false;
  await secureStorage.set(SECURE_KEYS.PENDING_UNLINK_TOKEN, input.token);
  const stored = await secureStorage.get(SECURE_KEYS.PENDING_UNLINK_TOKEN);
  if (stored !== input.token) {
    await secureStorage.remove(SECURE_KEYS.PENDING_UNLINK_TOKEN);
    storageRemove(PENDING_UNLINK_STORAGE_KEY);
    logger.warn("pendingUnlinkTokenWriteFailed", { uid: input.uid });
    return false;
  }
  writeRecord({
    uid: input.uid,
    tokenHash: await hashToken(input.token),
    attempts: 0,
    at: Date.now(),
    reason: input.reason,
  });
  logger.info("pendingUnlinkRecorded", { uid: input.uid, reason: input.reason });
  return true;
}

function isExpired(record: PendingUnlinkRecord, now: number): boolean {
  return now - record.at > PENDING_UNLINK_TTL_MS;
}

async function retryWithToken(
  record: PendingUnlinkRecord,
  token: string,
): Promise<"unlinked" | "failed"> {
  const currentUid = currentScopedUid();
  if (currentUid && currentUid !== record.uid) {
    // Defence in depth: never send an unlink under another account's JWT.
    await dropPendingUnlink("different_uid");
    return "failed";
  }
  const outcome = await notificationsService.unlinkUserFromDeviceToken(record.uid, token);
  if (outcome === "ok") {
    await clearPendingUnlink();
    logger.info("pendingUnlinkReplayed", { uid: record.uid });
    return "unlinked";
  }
  const attempts = record.attempts + 1;
  if (attempts >= PENDING_UNLINK_MAX_ATTEMPTS) {
    await dropPendingUnlink("attempts_exhausted");
    return "failed";
  }
  writeRecord({ ...record, attempts });
  return "failed";
}

/**
 * Same-uid boot replay, called BEFORE any register/link call. A different
 * uid always drops the entry: an unlink must never be sent under another
 * account's JWT.
 */
export async function retryPendingUnlinkOnBoot(
  uid: string | null | undefined,
): Promise<"none" | "unlinked" | "dropped" | "failed"> {
  const record = readPendingUnlink();
  if (!record) return "none";
  if (!uid) return "none";
  if (record.uid !== uid) {
    await dropPendingUnlink("different_uid");
    return "dropped";
  }
  if (isExpired(record, Date.now()) || record.attempts >= PENDING_UNLINK_MAX_ATTEMPTS) {
    await dropPendingUnlink(isExpired(record, Date.now()) ? "expired" : "attempts_exhausted");
    return "dropped";
  }
  const token = await secureStorage.get(SECURE_KEYS.PENDING_UNLINK_TOKEN);
  if (!token) {
    await dropPendingUnlink("missing_token");
    return "dropped";
  }
  if ((await hashToken(token)) !== record.tokenHash) {
    await dropPendingUnlink("hash_mismatch");
    return "dropped";
  }
  const result = await retryWithToken(record, token);
  return result === "unlinked" ? "unlinked" : "failed";
}

/**
 * Native SDK `registration` event: a token now exists. If it matches the
 * pending entry, unlink then let the caller associate it; if it rotated, the
 * old entry is meaningless and must be dropped without a loop.
 */
export async function reconcilePendingUnlinkOnRegistration(
  sdkToken: string,
): Promise<"none" | "unlinked" | "dropped" | "failed"> {
  const record = readPendingUnlink();
  if (!record) return "none";
  const uid = currentScopedUid();
  if (uid && record.uid !== uid) {
    await dropPendingUnlink("different_uid");
    return "dropped";
  }
  if (!uid) {
    // Registration fired before auth was known: keep the entry for the
    // same-uid boot replay rather than sending it unauthenticated.
    return "none";
  }
  if ((await hashToken(sdkToken)) !== record.tokenHash) {
    await dropPendingUnlink("rotation");
    return "dropped";
  }
  const result = await retryWithToken(record, sdkToken);
  return result === "unlinked" ? "unlinked" : "failed";
}
