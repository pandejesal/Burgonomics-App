import { create } from "zustand";
import { authRepository, type AuthRepository } from "@/features/auth/repositories/AuthRepository";
import type { AuthSessionRef } from "@/features/auth/services/authService";
import { isJwtExpired } from "@/features/auth/utils/validators";
import { DEFAULT_DELIVERY_METHOD } from "@/features/auth/utils/validators";
import { secureStorage, SECURE_KEYS } from "@/core/storage/secureStorage";
import { auth as firebaseAuth } from "@/core/config/firebase";
import { logger } from "@/core/logging/logger";
import { useProfileStore } from "@/features/profile/state/profileStore";
import { profileRepository } from "@/features/profile/repositories/ProfileRepository";
import { isDev } from "@/core/config/env";
import { configureAuthUidSource } from "@/features/auth/utils/scopedPersistence";
import { fail } from "@/core/network/http";

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

interface OtpChallenge {
  otpToken: string;
  phone: string;
  requestedAt: number;
  resendAfterSec: number;
  code?: string;
  deliveryMethod?: "whatsapp" | "sms";
}

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  challenge: OtpChallenge | null;
  isBootstrapped: boolean;
  error: string | null;

  // Actions
  bootstrap: (sessionProbe?: () => Promise<string | null>) => Promise<void>;
  requestOtp: (
    phone: string,
    deliveryMethod?: "whatsapp" | "sms",
    otpToken?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  verifyOtp: (code: string) => Promise<{ ok: boolean; error?: string }>;
  resendOtp: () => Promise<{ ok: boolean; error?: string }>;
  changePhone: () => void;
  logout: () => Promise<void>;
  clearError: () => void;
}

/**
 * Session persistence goes through `secureStorage` (see
 * shared/services/secureStorage.ts) so the swap to native Keychain /
 * Keystore is a single-file change. We deliberately do NOT use
 * Zustand's `persist` middleware here because tokens must round-trip
 * through the secure abstraction, not raw `localStorage`.
 */

/**
 * Live Firebase uid, or null when no Firebase session exists. Single seam
 * for the bootstrap trust gate â€” injectable in tests (module-mock
 * interception is importer-dependent and cannot pin this gate; see Loop 9).
 */
export async function getFirebaseSessionUid(): Promise<string | null> {
  try {
    await firebaseAuth.authStateReady();
  } catch {
    // authStateReady failure â€” fall through to the currentUser check.
  }
  return firebaseAuth.currentUser?.uid ?? null;
}

/**
 * Session persistence runs through one queue.
 *
 * Persist, release and clear are read-modify-write sequences. Interleaving two
 * of them lets an ownership check pass, then a newer login write, then the
 * older cleanup delete the newer tokens. Serializing removes that window.
 */
let sessionStorageQueue: Promise<unknown> = Promise.resolve();

function withSessionStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = sessionStorageQueue.then(operation, operation);
  sessionStorageQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Callers must already hold `withSessionStorageLock`. */
async function persistSessionLocked(user: AuthUser, accessToken: string, refreshToken: string) {
  await Promise.all([
    secureStorage.set(SECURE_KEYS.ACCESS_TOKEN, accessToken),
    secureStorage.set(SECURE_KEYS.REFRESH_TOKEN, refreshToken),
    secureStorage.set(SECURE_KEYS.USER, JSON.stringify(user)),
  ]);
}

/** Callers must already hold `withSessionStorageLock`. */
async function clearPersistedSessionLocked() {
  await Promise.all([
    secureStorage.remove(SECURE_KEYS.ACCESS_TOKEN),
    secureStorage.remove(SECURE_KEYS.REFRESH_TOKEN),
    secureStorage.remove(SECURE_KEYS.USER),
  ]);
}

function persistSession(user: AuthUser, accessToken: string, refreshToken: string) {
  return withSessionStorageLock(() => persistSessionLocked(user, accessToken, refreshToken));
}

function clearPersistedSession() {
  return withSessionStorageLock(() => clearPersistedSessionLocked());
}

import { notificationsService } from "@/features/notifications/services/notificationsService";

/**
 * Repository resolution seam.
 *
 * Production resolves the singleton. Race/epoch tests inject a synthetic
 * `AuthRepository` here so they can control resolution order without booting
 * Firebase Auth (module mocking of `@/core/config/firebase` proved
 * importer-dependent in this repo — see tests/auth.bootstrap.test.ts).
 */
let authRepositoryOverride: AuthRepository | null = null;

/**
 * Test-runtime check that does not trust DEV alone: a suite may set
 * `PROD`/`DEV` explicitly, so VITEST/MODE/NODE_ENV decide.
 */
function isTestRuntime(): boolean {
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  if (!env) return false;
  return (
    env.VITEST === true ||
    env.VITEST === "true" ||
    env.MODE === "test" ||
    env.NODE_ENV === "test"
  );
}

export function __setAuthRepositoryForTests(next: AuthRepository | null): void {
  if (!isTestRuntime()) return;
  authRepositoryOverride = next;
}

/**
 * Resolved per call, never cached at module init: this module participates in
 * an import cycle (cart/router -> authStore -> AuthRepository), so reading the
 * binding here — after all modules evaluate — is what keeps it defined.
 */
function repo(): AuthRepository {
  return authRepositoryOverride ?? authRepository;
}


type RequestOtpResult = Awaited<ReturnType<AuthRepository["requestOtp"]>>;
type VerifyOtpResult = Awaited<ReturnType<AuthRepository["verifyOtp"]>>;

/**
 * Challenge epoch. Bumped whenever the active challenge is abandoned
 * (changePhone, logout, or a superseding request). Async auth work captures
 * the epoch it started under and must not write state, persist tokens, or
 * report success once the epoch has moved on.
 */
let challengeEpoch = 0;

function nextChallengeEpoch(): number {
  challengeEpoch += 1;
  return challengeEpoch;
}

/**
 * Identity epoch. Bumped when the signed-in identity is abandoned (logout) or
 * replaced (a verify commits). Bootstrap captures it so a logout that lands
 * while storage/probe awaits cannot be undone by a stale bootstrap result.
 */
let identityEpoch = 0;

/**
 * Removes persisted tokens only when they are still the ones this attempt
 * wrote. A newer login may have replaced them while the storage await was in
 * flight, and clearing then would sign the new user out.
 */
function releasePersistedTokensIfOwned(accessToken: string): Promise<void> {
  // Runs inside the storage lock, so the read and the delete cannot be
  // separated by a newer login's write.
  return withSessionStorageLock(async () => {
    const stored = await secureStorage.get(SECURE_KEYS.ACCESS_TOKEN);
    // Strict equality: null means someone already cleared it (or never wrote
    // it), which is NOT proof of ownership. Never delete a session we do not own.
    if (stored !== accessToken) return;
    await clearPersistedSessionLocked();
  }).catch(() => undefined);
}

/**
 * Signs out the Firebase session a cancelled verify created, but only when no
 * newer operation has claimed that identity. Never touches another user.
 */
async function discardFencedSession(sessionRef: AuthSessionRef | undefined): Promise<void> {
  if (!sessionRef) return;
  if (useAuthStore.getState().user?.id === sessionRef.uid) return;
  await repo().discardConfirmedSession(sessionRef);
}

/** Single owner for a send, so a double tap cannot burn two SMS. */
let requestInFlight: { phone: string; promise: Promise<{ ok: boolean; error?: string }> } | null = null;
/**
 * Single owner for a confirm, keyed by the epoch it started in. An abandoned
 * (fenced) verify must not block a new code for the rest of the session: its
 * ownership is dropped on cancel/logout/changePhone, and the transport keeps
 * its own generation guard so the orphaned confirm still cannot adopt.
 */
let verifyInFlight: { epoch: number; promise: Promise<{ ok: boolean; error?: string }> } | null = null;
/** Single owner for bootstrap, so guards/deep links share one session probe. */
let bootstrapInFlight: Promise<void> | null = null;

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
export const useAuthStore = create<AuthState>((set, get) => ({
  status: "idle",
  user: null,
  accessToken: null,
  refreshToken: null,
  challenge: null,
  isBootstrapped: false,
  error: null,

  async bootstrap(sessionProbe?: () => Promise<string | null>) {
    if (get().isBootstrapped) return;
    // Root layout, the route guard and a deep link all bootstrap on first paint.
    // Without a shared owner each pass re-read storage and re-links the device
    // token; the second pass could also overwrite the first pass's decision.
    if (bootstrapInFlight) return bootstrapInFlight;

    const run = (async () => {
      const startIdentityEpoch = identityEpoch;
      /** True when a logout/login superseded this pass; never restores state. */
      const stale = (): boolean => {
        if (identityEpoch === startIdentityEpoch) return false;
        set({ isBootstrapped: true });
        return true;
      };
      try {
        const [accessToken, refreshToken, userJson] = await Promise.all([
          secureStorage.get(SECURE_KEYS.ACCESS_TOKEN),
          secureStorage.get(SECURE_KEYS.REFRESH_TOKEN),
          secureStorage.get(SECURE_KEYS.USER),
        ]);

        if (!accessToken || !refreshToken || !userJson) {
          if (stale()) return;
          set({ status: "guest", isBootstrapped: true });
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
          set({ status: "guest", isBootstrapped: true });
          return;
        }

        // The persisted tokens are real Firebase tokens, so a stolen
        // localStorage copy alone must never restore a session: require a live
        // Firebase session for the SAME uid before trusting anything stored.
        const fbUid = await (sessionProbe ?? getFirebaseSessionUid)();
        if (!fbUid || fbUid !== user.id) {
          await clearPersistedSession();
          set({ status: "guest", isBootstrapped: true });
          return;
        }

        if (!isJwtExpired(accessToken)) {
          // A logout that landed during the probe must win over this restore.
          if (stale()) return;
          useProfileStore.getState().hydrateFromAuth(user);
          profileRepository.refresh().catch((e: unknown) => logger.warn("auth.profile_refresh_failed", { message: e instanceof Error ? e.message : String(e) }));
          void notificationsService.linkUserToDeviceToken(user.id).catch((e: unknown) => logger.warn("auth.device_link_failed", { message: e instanceof Error ? e.message : String(e) }));
          set({
            status: "authenticated",
            user,
            accessToken,
            refreshToken,
            isBootstrapped: true,
          });
          return;
        }

        // Try to refresh silently.
        const refreshed = await repo().refresh(refreshToken);
        if (refreshed.success) {
          await persistSession(user, refreshed.data.accessToken, refreshed.data.refreshToken);
          // Re-check after the storage await: release only this attempt's tokens.
          if (stale()) {
            await releasePersistedTokensIfOwned(refreshed.data.accessToken);
            return;
          }
          useProfileStore.getState().hydrateFromAuth(user);
          profileRepository.refresh().catch((e: unknown) => logger.warn("auth.profile_refresh_failed", { message: e instanceof Error ? e.message : String(e) }));
          // Same linking as fresh login — otherwise refreshed sessions silently
          // stop receiving order status pushes.
          void notificationsService.linkUserToDeviceToken(user.id).catch((e: unknown) => logger.warn("auth.device_link_failed", { message: e instanceof Error ? e.message : String(e) }));
          set({
            status: "authenticated",
            user,
            accessToken: refreshed.data.accessToken,
            refreshToken: refreshed.data.refreshToken,
            isBootstrapped: true,
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
    })();

    bootstrapInFlight = run;
    try {
      await run;
    } finally {
      if (bootstrapInFlight === run) bootstrapInFlight = null;
    }
  },

  async requestOtp(phone, deliveryMethod = DEFAULT_DELIVERY_METHOD, otpToken) {
    // One owner per send: a double tap (or a second tab) must not burn two SMS
    // nor race two challenges into the same store slot.
    const inFlight = requestInFlight;
    if (inFlight) {
      if (inFlight.phone === phone) return inFlight.promise;
      return { ok: false, error: "A verification code is already being requested for another number." };
    }

    const epoch = nextChallengeEpoch();
    const promise = (async () => {
      set({ status: "authenticating", error: null });
      let res: RequestOtpResult;
      try {
        res = await repo().requestOtp(phone, deliveryMethod, otpToken);
      } catch (err) {
        res = fail("AUTH_OTP_REQUEST_FAILED", messageOf(err, "Failed to send verification code."));
      }

      if (!res || !res.success) {
        const message = res?.error?.message ?? "Failed to send verification code.";
        // A failed request must drop the previous challenge on BOTH sides, or a
        // code issued for the old number stays confirmable.
        repo().cancelChallenge();
        if (epoch === challengeEpoch) set({ status: "error", error: message, challenge: null });
        return { ok: false, error: message };
      }

      // Superseded by a newer request while this one was in flight.
      if (epoch !== challengeEpoch) return { ok: false, error: "Superseded by a newer request." };

      set({
        status: "otp_sent",
        challenge: {
          otpToken: res.data.otpToken,
          phone,
          requestedAt: Date.now(),
          resendAfterSec: res.data.resendAfterSec,
          code: res.data.code,
          deliveryMethod: res.data.deliveryMethod || deliveryMethod,
        },
      });
      return { ok: true };
    })();

    requestInFlight = { phone, promise };
    try {
      return await promise;
    } finally {
      if (requestInFlight && requestInFlight.promise === promise) requestInFlight = null;
    }
  },

  async verifyOtp(code) {
    // A second submit (auto-complete plus the Verify button, or a double tap)
    // must not confirm the same code twice.
    const { challenge } = get();
    if (!challenge) {
      return { ok: false, error: "Please request an OTP first." };
    }

    const epoch = challengeEpoch;
    // Only the current epoch blocks a new attempt; an orphaned verify from an
    // abandoned challenge is released in changePhone/logout below.
    if (verifyInFlight && verifyInFlight.epoch === epoch) {
      return { ok: false, error: "Verification is already in progress." };
    }
    const promise = (async () => {
      set({ status: "verifying", error: null });
      let res: VerifyOtpResult;
      try {
        res = await repo().verifyOtp(challenge.otpToken, code);
      } catch (err) {
        res = fail("AUTH_OTP_VERIFY_FAILED", messageOf(err, "Verification failed."));
      }

      if (!res || !res.success) {
        const message = res?.error?.message ?? "Verification failed.";
        if (epoch === challengeEpoch) set({ status: "otp_sent", error: message });
        return { ok: false, error: message };
      }

      // Epoch fence: changePhone / logout / a new request happened while this
      // code was in flight. confirm() already minted a Firebase session, so
      // discard exactly that one before returning.
      if (epoch !== challengeEpoch) {
        await discardFencedSession(res.data.sessionRef);
        return { ok: false, error: "Verification was cancelled." };
      }

      try {
        await persistSession(res.data.user, res.data.accessToken, res.data.refreshToken);
      } catch (err) {
        // A device that cannot store the session must not present as signed in
        // AND must not leave a live Firebase session that no store owns.
        await clearPersistedSession().catch(() => undefined);
        await discardFencedSession(res.data.sessionRef);
        const message = "We could not save your session on this device. Please try again.";
        logger.warn("auth.session_persist_failed", { message: messageOf(err, message) });
        set({ status: "otp_sent", error: message });
        return { ok: false, error: message };
      }

      // logout / changePhone can land during the storage await. Re-check before
      // adopting, and release only the tokens this attempt wrote.
      if (epoch !== challengeEpoch) {
        await releasePersistedTokensIfOwned(res.data.accessToken);
        await discardFencedSession(res.data.sessionRef);
        return { ok: false, error: "Verification was cancelled." };
      }

      // Identity changed underneath us (a newer verify or a logout): do not
      // overwrite the newer owner's state.
      if (get().user !== null && get().user?.id !== res.data.user.id) {
        await releasePersistedTokensIfOwned(res.data.accessToken);
        return { ok: false, error: "Verification was cancelled." };
      }

      identityEpoch += 1;
      useProfileStore.getState().hydrateFromAuth(res.data.user);
      profileRepository.refresh().catch((e: unknown) => logger.warn("auth.profile_refresh_failed", { message: e instanceof Error ? e.message : String(e) }));
      void notificationsService.linkUserToDeviceToken(res.data.user.id).catch((e: unknown) => logger.warn("auth.device_link_failed", { message: e instanceof Error ? e.message : String(e) }));
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

    const owned = { epoch, promise };
    verifyInFlight = owned;
    try {
      return await promise;
    } finally {
      if (verifyInFlight === owned) verifyInFlight = null;
    }
  },

  async resendOtp() {
    const { challenge } = get();
    if (!challenge) return { ok: false, error: "No active OTP request." };
    // Store-enforced cooldown (the screen countdown is bypassable via direct
    // store calls, second tabs, or remounts — each bypass burns a real SMS).
    const elapsedSec = (Date.now() - challenge.requestedAt) / 1000;
    const remainingSec = Math.ceil(challenge.resendAfterSec - elapsedSec);
    if (remainingSec > 0) {
      return { ok: false, error: `Please wait ${remainingSec}s before requesting a new code.` };
    }
    return get().requestOtp(challenge.phone, challenge.deliveryMethod || DEFAULT_DELIVERY_METHOD);
  },

  changePhone() {
    // Abandon the challenge on both sides; an in-flight verify is fenced out.
    // The send owner is released so the next request is not blocked by an
    // abandoned one that is still waiting on the network.
    nextChallengeEpoch();
    requestInFlight = null;
    verifyInFlight = null;
    repo().cancelChallenge();
    set({
      status: "unauthenticated",
      challenge: null,
      error: null,
    });
  },

  async logout() {
    // Fence first: a verify resolving after this call must not restore a session.
    nextChallengeEpoch();
    identityEpoch += 1;
    requestInFlight = null;
    verifyInFlight = null;
    repo().cancelChallenge();
    const { refreshToken, user: currentUser } = get();
    void notificationsService.unlinkUserFromDeviceToken(currentUser?.id).catch((e: unknown) => logger.warn("auth.device_unlink_failed", { message: e instanceof Error ? e.message : String(e) }));
    await repo().logout(refreshToken);
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
// "authenticated" for the whole app (mirrors useRequireAuth's identity
// check): status + token + user identity (id + phone). A token-only
// session (corrupt/partial restore) is NOT authenticated anywhere â€”
// payment, checkout, and repository gates all share this.
export const selectIsAuthenticated = (s: AuthState) =>
  s.status === "authenticated" && !!s.accessToken && !!s.user?.id && !!s.user?.phone;

export const selectIsGuest = (s: AuthState) => s.status !== "authenticated";

// Loop 36/120 (finding 6): publish the uid source to the shared scoping
// helper (which deliberately does NOT import this module â€” see its header
// for the import-cycle rationale). Every user-owned persisted store
// (orders / notifications / checkout / loyalty) keys its storage by the
// uid reported here and re-scopes on change.
configureAuthUidSource({
  getUid: () => useAuthStore.getState().user?.id ?? null,
  subscribe: (listener) => useAuthStore.subscribe(listener as (s: AuthState) => void),
});

if (typeof window !== "undefined" && isDev()) {
  (window as any).useAuthStore = useAuthStore;
}

