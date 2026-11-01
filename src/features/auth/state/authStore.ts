import { create } from "zustand";
import { authRepository } from "@/features/auth/repositories/AuthRepository";
import { isJwtExpired } from "@/features/auth/utils/validators";
import { DEFAULT_DELIVERY_METHOD } from "@/features/auth/utils/validators";
import { secureStorage, SECURE_KEYS } from "@/core/storage/secureStorage";
import { auth as firebaseAuth } from "@/core/config/firebase";
import { logger } from "@/core/logging/logger";
import { useProfileStore } from "@/features/profile/state/profileStore";
import { profileRepository } from "@/features/profile/repositories/ProfileRepository";
import { isDev } from "@/core/config/env";
import { configureAuthUidSource, purgeScopedLocalCaches } from "@/features/auth/utils/scopedPersistence";
import { useLoyaltyStore } from "@/features/loyalty/state/loyaltyStore";
import { clearCachedDeviceToken, getCachedDeviceToken } from "@/shared/platform/pushNotifications";
import {
  readPendingUnlink,
  retryPendingUnlinkOnBoot,
  writePendingUnlink,
} from "@/features/notifications/services/pendingUnlink";
import { authService } from "@/features/auth/services/authService";
import type { AuthErrorDetails, AuthFlowId } from "@/features/auth/utils/authErrors";

export type AuthStatus =
  | "idle" // initial, pre-bootstrap
  | "guest" // browsing without an account (default post-bootstrap)
  | "unauthenticated" // explicitly signed out, transient (login flow entered)
  | "authenticating" // requesting OTP
  | "otp_sent" // awaiting user code entry
  | "verifying" // verifying OTP
  | "authenticated"
  | "session_expired"
  | "error";

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
}

export interface OtpChallenge {
  /** Opaque app-scoped handle. Never the phone and never placed in a URL. */
  handle: string;
  phone: string;
  maskedPhone: string;
  requestedAt: number;
  issuedAt: number;
  resendAfterSec: number;
  displayExpiresAt: number;
  deliveryMethod: "sms";
}

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  code?: string;
  details?: AuthErrorDetails;
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  challenge: OtpChallenge | null;
  isBootstrapped: boolean;
  error: string | null;
  /** UID-only marker for an SDK user left by a cancelled attempt. */
  quarantinedUid: string | null;

  // Actions
  bootstrap: (sessionProbe?: () => Promise<string | null>) => Promise<void>;
  requestOtp: (
    flow: AuthFlowId,
    phone: string,
    deliveryMethod?: "whatsapp" | "sms",
    otpToken?: string,
  ) => Promise<AuthActionResult>;
  verifyOtp: (flow: AuthFlowId, handle: string, code: string) => Promise<AuthActionResult>;
  resendOtp: (flow: AuthFlowId) => Promise<AuthActionResult>;
  changePhone: () => void;
  resetAuthAttempts: () => void;
  signOutUnfinishedSession: () => Promise<void>;
  logout: (options?: { purgeLocalCaches?: boolean }) => Promise<void>;
  clearError: () => void;
}

/**
 * Session persistence goes through `secureStorage` so the swap to native
 * Keychain / Keystore is a single-file change. Tokens never round-trip
 * through Zustand's raw localStorage persist middleware.
 */

export async function getFirebaseSessionUid(): Promise<string | null> {
  try {
    await firebaseAuth.authStateReady();
  } catch {
    // authStateReady failure — fall through to the currentUser check.
  }
  return firebaseAuth.currentUser?.uid ?? null;
}

async function persistSession(user: AuthUser, accessToken: string, refreshToken: string) {
  await Promise.all([
    secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, accessToken),
    secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, refreshToken),
    secureStorage.set(SECURE_KEYS.USER, JSON.stringify(user)),
  ]);
}

async function clearPersistedSession() {
  await Promise.all([
    secureStorage.remove(SECURE_KEYS.ACCESS_TOKEN),
    secureStorage.remove(SECURE_KEYS.REFRESH_TOKEN),
    secureStorage.remove(SECURE_KEYS.USER),
  ]);
}

function isUid(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

async function readQuarantinedUid(): Promise<string | null> {
  const value = await secureStorage.get(SECURE_KEYS.AUTH_QUARANTINED_UID);
  return isUid(value) ? value : null;
}

async function writeQuarantinedUid(uid: string): Promise<void> {
  if (isUid(uid)) await secureStorage.set(SECURE_KEYS.AUTH_QUARANTINED_UID, uid);
}

/**
 * Bound on the pre-signout device-token unlink. The unlink endpoint is
 * auth-gated, so it MUST be awaited BEFORE `authRepository.logout()` — the old
 * fire-and-forget call lost its credential mid-flight and left the token bound
 * to the old user. It must also never hold sign-out hostage: past this bound
 * we log and continue signing out.
 */
export const DEVICE_UNLINK_TIMEOUT_MS = 3000;

export type BoundedUnlinkOutcome = "ok" | "timeout" | "failed";

async function unlinkDeviceTokenBounded(
  uid: string | null | undefined,
): Promise<BoundedUnlinkOutcome> {
  if (!uid) return "ok";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve("timeout");
    }, DEVICE_UNLINK_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([
      notificationsService.unlinkUserFromDeviceToken(uid),
      timeout,
    ]);
    if (outcome === "ok") return "ok";
    if (timedOut || outcome === "timeout") {
      logger.warn("auth.device_unlink_timeout", { timeoutMs: DEVICE_UNLINK_TIMEOUT_MS });
      return "timeout";
    }
    logger.warn("auth.device_unlink_failed", { uid });
    return "failed";
  } catch (e: unknown) {
    logger.warn("auth.device_unlink_failed", {
      code: e && typeof e === "object" && "code" in e ? String((e as any).code) : "unknown",
    });
    return "failed";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * F3/B2: when the unlink is unconfirmed, keep a bounded retry entry plus a
 * retry-only token copy, then clear the operational cache so nothing else
 * reads it. Registration never reads the secure copy.
 */
async function persistFailedUnlink(
  uid: string | null,
  outcome: Exclude<BoundedUnlinkOutcome, "ok">,
): Promise<void> {
  if (!uid) return;
  const token = getCachedDeviceToken();
  if (!token) {
    logger.warn("auth.pending_unlink_no_token", { reason: outcome });
    return;
  }
  const recorded = await writePendingUnlink({ uid, token, reason: outcome });
  if (recorded) clearCachedDeviceToken();
}

/**
 * Before any register/link, replay a same-uid pending unlink. When there is
 * no entry the link call stays synchronous (existing boot contract/tests);
 * when an entry exists the retry must finish first so the new association
 * cannot race a stale binding.
 */
function resumeDeviceNotifications(uid: string): void {
  if (!readPendingUnlink()) {
    void notificationsService
      .linkUserToDeviceToken(uid)
      .catch((e: unknown) =>
        logger.warn("auth.device_link_failed", {
          code: e && typeof e === "object" && "code" in e ? String((e as any).code) : "unknown",
        }),
      );
    return;
  }
  void (async () => {
    await retryPendingUnlinkOnBoot(uid);
    await notificationsService.linkUserToDeviceToken(uid);
  })().catch((e: unknown) =>
    logger.warn("auth.device_link_failed", {
      code: e && typeof e === "object" && "code" in e ? String((e as any).code) : "unknown",
    }),
  );
}

/** F11: balance follows the server on every session restore (never minted). */
function refreshLoyaltyFromServer(uid: string | null | undefined): void {
  void useLoyaltyStore
    .getState()
    .refreshFromServer(uid)
    .catch((e: unknown) =>
      logger.warn("auth.loyalty_refresh_failed", {
        code: e && typeof e === "object" && "code" in e ? String((e as any).code) : "unknown",
      }),
    );
}

type VerifyOtpResult = AuthActionResult;

/**
 * Single-flight gate for OTP verification (F12). WebOTP autofill, a paste and
 * a button tap can land in the same tick; without this each one fired its own
 * confirm() call. Cleared on settle so a failed attempt can be retried.
 */
let verifyOtpInFlight: Promise<VerifyOtpResult> | null = null;

import { notificationsService } from "@/features/notifications/services/notificationsService";

function challengeFrom(data: {
  handle: string;
  phone: string;
  maskedPhone: string;
  issuedAt: number;
  resendAfterSec: number;
  displayExpiresAt: number;
}): OtpChallenge {
  return {
    handle: data.handle,
    phone: data.phone,
    maskedPhone: data.maskedPhone,
    requestedAt: data.issuedAt,
    issuedAt: data.issuedAt,
    resendAfterSec: data.resendAfterSec,
    displayExpiresAt: data.displayExpiresAt,
    deliveryMethod: "sms",
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "idle",
  user: null,
  accessToken: null,
  refreshToken: null,
  challenge: null,
  isBootstrapped: false,
  error: null,
  quarantinedUid: null,

  async bootstrap(sessionProbe?: () => Promise<string | null>) {
    if (get().isBootstrapped) return;
    try {
      const [accessToken, refreshToken, userJson, quarantined] = await Promise.all([
        secureStorage.get(SECURE_KEYS.ACCESS_TOKEN),
        secureStorage.get(SECURE_KEYS.REFRESH_TOKEN),
        secureStorage.get(SECURE_KEYS.USER),
        readQuarantinedUid(),
      ]);

      if (!accessToken || !refreshToken || !userJson) {
        const fbUid = await (sessionProbe ?? getFirebaseSessionUid)();
        if (fbUid) {
          await writeQuarantinedUid(fbUid);
          set({ status: "guest", isBootstrapped: true, quarantinedUid: fbUid });
        } else {
          await secureStorage.remove(SECURE_KEYS.AUTH_QUARANTINED_UID);
          set({ status: "guest", isBootstrapped: true, quarantinedUid: null });
        }
        return;
      }

      const parsed: unknown = JSON.parse(userJson);
      // Shape-guard the persisted session: valid JSON like `"corrupt"`, `123`,
      // or `{id:"other"}` used to cast cleanly and either crash downstream or
      // orphan orders under an empty contact. Mismatch clears the session.
      const user =
        parsed && typeof parsed === "object" && typeof (parsed as any).id === "string" && typeof (parsed as any).phone === "string"
          ? (parsed as AuthUser)
          : null;
      if (!user) {
        await clearPersistedSession();
        set({ status: "guest", isBootstrapped: true, quarantinedUid: quarantined });
        return;
      }

      // The persisted tokens are real Firebase tokens, so a stolen
      // localStorage copy alone must never restore a session: require a live
      // Firebase session for the SAME uid before trusting anything stored.
      const fbUid = await (sessionProbe ?? getFirebaseSessionUid)();
      if (!fbUid || fbUid !== user.id) {
        await clearPersistedSession();
        if (fbUid) await writeQuarantinedUid(fbUid);
        set({
          status: "guest",
          isBootstrapped: true,
          quarantinedUid: fbUid ?? quarantined,
        });
        return;
      }

      await secureStorage.remove(SECURE_KEYS.AUTH_QUARANTINED_UID);

      if (!isJwtExpired(accessToken)) {
        useProfileStore.getState().hydrateFromAuth(user);
        profileRepository.refresh().catch((e: unknown) => logger.warn("auth.profile_refresh_failed", { message: e instanceof Error ? e.message : String(e) }));
        resumeDeviceNotifications(user.id);
        refreshLoyaltyFromServer(user.id);
        set({
          status: "authenticated",
          user,
          accessToken,
          refreshToken,
          isBootstrapped: true,
          quarantinedUid: null,
        });
        return;
      }

      // Try to refresh silently.
      const refreshed = await authRepository.refresh(refreshToken);
      if (refreshed.success) {
        await persistSession(user, refreshed.data.accessToken, refreshed.data.refreshToken);
        useProfileStore.getState().hydrateFromAuth(user);
        profileRepository.refresh().catch((e: unknown) => logger.warn("auth.profile_refresh_failed", { message: e instanceof Error ? e.message : String(e) }));
        // Same linking as fresh login — otherwise refreshed sessions silently
        // stop receiving order status pushes.
        resumeDeviceNotifications(user.id);
        refreshLoyaltyFromServer(user.id);
        set({
          status: "authenticated",
          user,
          accessToken: refreshed.data.accessToken,
          refreshToken: refreshed.data.refreshToken,
          isBootstrapped: true,
          quarantinedUid: null,
        });
      } else {
        await clearPersistedSession();
        set({
          status: "session_expired",
          user: null,
          accessToken: null,
          refreshToken: null,
          isBootstrapped: true,
        });
      }
    } catch {
      set({ status: "guest", isBootstrapped: true });
    }
  },

  async requestOtp(flow, phone, deliveryMethod = DEFAULT_DELIVERY_METHOD, otpToken) {
    const epochAtEntry = authService.getIntentEpoch();
    set({ status: "authenticating", error: null });
    const res = await authRepository.requestOtp(flow, phone, deliveryMethod, otpToken);
    if (!res.success) {
      if (!authService.isIntentEpochCurrent(epochAtEntry) || res.error.code === "STALE_EPOCH") {
        set({
          status: "guest",
          challenge: null,
          error: "Your sign-in attempt was cancelled. Please try again.",
        });
        return {
          ok: false,
          error: "Your sign-in attempt was cancelled. Please try again.",
          code: "STALE_EPOCH",
        };
      }
      set({ status: "error", error: res.error.message });
      return {
        ok: false,
        error: res.error.message,
        code: res.error.code,
        details: res.error.details,
      };
    }
    if (!authService.isIntentEpochCurrent(epochAtEntry)) {
      set({
        status: "guest",
        challenge: null,
        error: "Your sign-in attempt was cancelled. Please try again.",
      });
      return {
        ok: false,
        error: "Your sign-in attempt was cancelled. Please try again.",
        code: "STALE_EPOCH",
      };
    }
    set({
      status: "otp_sent",
      challenge: challengeFrom(res.data),
      error: null,
    });
    return { ok: true };
  },

  async verifyOtp(flow, handle, code) {
    if (verifyOtpInFlight) return verifyOtpInFlight;
    const run = (async (): Promise<VerifyOtpResult> => {
      const { challenge } = get();
      if (!challenge) {
        return { ok: false, error: "Please request an OTP first.", code: "NO_CHALLENGE" };
      }
      const epochAtEntry = authService.getIntentEpoch();
      set({ status: "verifying", error: null });
      const res = await authRepository.verifyOtp(flow, handle, code);
      if (!res.success) {
        if (!authService.isIntentEpochCurrent(epochAtEntry)) {
          set({
            status: "guest",
            challenge: null,
            error: "Your sign-in was cancelled. Please request a new code.",
          });
          return {
            ok: false,
            error: "Your sign-in was cancelled. Please request a new code.",
            code: "STALE_EPOCH",
          };
        }
        const code = res.error.code;
        if (code === "AUTH_CODE_EXPIRED") {
          set({ status: "otp_sent", challenge: null, error: res.error.message });
        } else {
          set({ status: "otp_sent", error: res.error.message });
        }
        return { ok: false, error: res.error.message, code, details: res.error.details };
      }

      const attemptEpoch =
        typeof res.data.attemptEpoch === "number" ? res.data.attemptEpoch : epochAtEntry;
      if (attemptEpoch !== epochAtEntry || !authService.isIntentEpochCurrent(epochAtEntry)) {
        await authService.cleanupStaleUser(res.data.sdkUser, epochAtEntry);
        await clearPersistedSession();
        set({
          status: "guest",
          user: null,
          accessToken: null,
          refreshToken: null,
          challenge: null,
          error: "Your sign-in was cancelled. Please request a new code.",
        });
        return { ok: false, error: "Your sign-in was cancelled. Please request a new code.", code: "STALE_EPOCH" };
      }

      try {
        await persistSession(res.data.user, res.data.accessToken, res.data.refreshToken);
      } catch (error) {
        logger.warn("auth.session_persist_failed", {
          code: error && typeof error === "object" && "code" in error ? String((error as any).code) : "unknown",
        });
        await authService.cleanupStaleUser(res.data.sdkUser, -1);
        set({ status: "guest", user: null, accessToken: null, refreshToken: null, challenge: null, error: "Sign-in could not be saved. Please try again." });
        return { ok: false, error: "Sign-in could not be saved. Please try again.", code: "AUTH_SESSION_PERSIST_FAILED" };
      }

      // Re-check after the awaited write: logout may have happened while the
      // tokens were being persisted.
      if (!authService.isIntentEpochCurrent(epochAtEntry)) {
        await clearPersistedSession();
        await authService.cleanupStaleUser(res.data.sdkUser, epochAtEntry);
        set({
          status: "guest",
          user: null,
          accessToken: null,
          refreshToken: null,
          challenge: null,
          error: "Your sign-in was cancelled. Please request a new code.",
        });
        return { ok: false, error: "Your sign-in was cancelled. Please request a new code.", code: "STALE_EPOCH" };
      }

      useProfileStore.getState().hydrateFromAuth(res.data.user);
      profileRepository.refresh().catch((e: unknown) => logger.warn("auth.profile_refresh_failed", { message: e instanceof Error ? e.message : String(e) }));
      resumeDeviceNotifications(res.data.user.id);
      refreshLoyaltyFromServer(res.data.user.id);
      set({
        status: "authenticated",
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        challenge: null,
        error: null,
      });
      return { ok: true };
    })();
    verifyOtpInFlight = run;
    try {
      return await run;
    } finally {
      if (verifyOtpInFlight === run) verifyOtpInFlight = null;
    }
  },

  async resendOtp(flow) {
    const epochAtEntry = authService.getIntentEpoch();
    const res = await authRepository.resendOtp(flow);
    if (!res.success) {
      if (!authService.isIntentEpochCurrent(epochAtEntry) || res.error.code === "STALE_EPOCH") {
        set({
          status: "guest",
          challenge: null,
          error: "Your sign-in attempt was cancelled. Please try again.",
        });
        return {
          ok: false,
          error: "Your sign-in attempt was cancelled. Please try again.",
          code: "STALE_EPOCH",
        };
      }
      set({ error: res.error.message });
      return { ok: false, error: res.error.message, code: res.error.code, details: res.error.details };
    }
    if (!authService.isIntentEpochCurrent(epochAtEntry)) {
      set({
        status: "guest",
        challenge: null,
        error: "Your sign-in attempt was cancelled. Please try again.",
      });
      return {
        ok: false,
        error: "Your sign-in attempt was cancelled. Please try again.",
        code: "STALE_EPOCH",
      };
    }
    set({
      status: "otp_sent",
      challenge: challengeFrom(res.data),
      error: null,
    });
    return { ok: true };
  },

  changePhone() {
    authService.invalidateAuthAttempts("changePhone");
    set({
      status: "unauthenticated",
      challenge: null,
      error: null,
    });
  },

  resetAuthAttempts() {
    authService.invalidateAuthAttempts("userReset");
    const authenticated = get().status === "authenticated";
    set({
      status: authenticated ? "authenticated" : "unauthenticated",
      challenge: null,
      error: null,
    });
  },

  async signOutUnfinishedSession() {
    const quarantined = get().quarantinedUid;
    const current = firebaseAuth.currentUser;
    if (current && (!quarantined || current.uid === quarantined)) {
      try {
        await firebaseAuth.signOut();
      } catch (error) {
        logger.warn("auth.quarantine_signout_failed", {
          code: error && typeof error === "object" && "code" in error ? String((error as any).code) : "unknown",
        });
        return;
      }
    } else if (current && quarantined && current.uid !== quarantined) {
      // A newer legitimate user is signed in; never sign it out.
      return;
    }
    await secureStorage.remove(SECURE_KEYS.AUTH_QUARANTINED_UID);
    set({
      quarantinedUid: null,
      status: get().status === "authenticated" ? "authenticated" : "guest",
    });
  },

  async logout(options?: { purgeLocalCaches?: boolean }) {
    const { refreshToken, user: currentUser } = get();
    const uid = currentUser?.id ?? null;

    // Epoch invalidation happens BEFORE the awaited unlink: a late verify
    // completion must never authenticate after this point, even if the
    // network unlink takes the full timeout.
    authService.invalidateAuthAttempts("logout");
    set({ challenge: null, error: null });

    const unlinkOutcome = await unlinkDeviceTokenBounded(uid);
    if (unlinkOutcome !== "ok") {
      await persistFailedUnlink(uid, unlinkOutcome);
    }

    // F10 privacy: after account DELETION the uid no longer exists server
    // side, so purge its device-local scoped caches. Normal logout keeps them
    // (a returning customer expects their saved addresses/cart back).
    if (options?.purgeLocalCaches && uid) {
      const removed = purgeScopedLocalCaches(uid);
      logger.info("auth.deleted_account_caches_purged", { removedCount: removed.length });
    }

    await authRepository.logout(refreshToken);
    await clearPersistedSession();
    profileRepository.clearCache();
    set({
      status: "guest",
      user: null,
      accessToken: null,
      refreshToken: null,
      challenge: null,
      error: null,
    });
  },

  clearError() {
    set({ error: null });
  },
}));

// Selector helpers to avoid re-renders. Single definition of
// "authenticated" for the whole app: status + token + user identity.
export const selectIsAuthenticated = (s: AuthState) =>
  s.status === "authenticated" && !!s.accessToken && !!s.user?.id && !!s.user?.phone;

export const selectIsGuest = (s: AuthState) => s.status !== "authenticated";

configureAuthUidSource({
  getUid: () => useAuthStore.getState().user?.id ?? null,
  subscribe: (listener) => useAuthStore.subscribe(listener as (s: AuthState) => void),
});

if (typeof window !== "undefined" && isDev()) {
  (window as any).useAuthStore = useAuthStore;
}
