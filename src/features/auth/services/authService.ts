import { ok, type ApiResult } from "@/core/network/http";
import { DEFAULT_DELIVERY_METHOD } from "@/features/auth/utils/validators";
import { isSyntheticEmail } from "@/features/profile/state/profileStore";
import { auth } from "@/core/config/firebase";
import { logger } from "@/core/logging/logger";
import {
  authAttempts,
  __resetAuthAttemptsForTests,
  type IssuedView,
  type RequestOtpView,
} from "@/features/auth/state/authAttempts";
import {
  bindHost as bindRecaptchaHost,
  releaseHost as releaseRecaptchaHost,
  __resetAuthBindingsForTests,
  type BindResult,
} from "@/features/auth/state/authBinding";
import {
  authFail,
  firebaseAuthCode,
  type AuthApiResult,
  type AuthErrorDetails,
  type AuthFlowId,
} from "@/features/auth/utils/authErrors";

export type { AuthFlowId };

export interface RequestOtpResponse extends RequestOtpView {}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string; name?: string; email?: string };
  payload?: any;
  /** Local-only guard for the store's post-persist epoch check. */
  sdkUser?: unknown;
  attemptEpoch: number;
}

export interface AuthRequestResult extends RequestOtpResponse {
  code?: string;
  details?: AuthErrorDetails;
}

export interface AuthVerifyResult extends VerifyOtpResponse {}

/**
 * Transport + orchestration seam. All challenge ownership lives in
 * `authAttempts`; this module adds only Firestore profile sync and session
 * refresh/logout. Provider error text never crosses this boundary.
 */
export const authService = {
  bindHost: (flow: AuthFlowId, hostId: string, element: HTMLElement, measure?: () => number): BindResult =>
    bindRecaptchaHost(flow, hostId, element, measure),

  releaseHost: (flow: AuthFlowId, hostId: string): void => {
    releaseRecaptchaHost(flow, hostId);
  },

  requestOtp: (
    flow: AuthFlowId,
    phone: string,
    deliveryMethod: "whatsapp" | "sms" = DEFAULT_DELIVERY_METHOD,
    otpToken?: string,
  ): Promise<AuthApiResult<RequestOtpResponse>> =>
    authAttempts.requestOtp(flow, phone, deliveryMethod, otpToken),

  resendOtp: (flow: AuthFlowId): Promise<AuthApiResult<RequestOtpResponse>> =>
    authAttempts.resendOtp(flow),

  verifyOtp: async (
    flow: AuthFlowId,
    handle: string,
    code: string,
  ): Promise<AuthApiResult<VerifyOtpResponse>> => {
    const result = await authAttempts.verifyOtp(flow, handle, code);
    if (!result.success) return result;

    const sdkUser = result.data.sdkUser;
    const returnedUser: { id: string; phone: string; name?: string; email?: string } = {
      id: result.data.user.id,
      phone: result.data.user.phone,
    };

    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, getDoc, setDoc } = await import("firebase/firestore");
      const userRef = doc(db, "users", returnedUser.id);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          id: returnedUser.id,
          phone: returnedUser.phone,
          createdAt: new Date().toISOString(),
        });
      } else {
        const profile = userSnap.data();
        returnedUser.name = profile?.fullName || profile?.name;
        if (!isSyntheticEmail(profile?.email)) {
          returnedUser.email = profile?.email;
        }
      }
    } catch (error) {
      // Profile sync is best-effort and must not leak Firestore internals.
      logger.warn("auth.profile_sync_failed", { code: firebaseAuthCode(error) ?? "unknown" });
    }

    if (!authAttempts.isIntentEpochCurrent(result.data.attemptEpoch)) {
      await authAttempts.cleanupStaleUser(sdkUser, result.data.attemptEpoch);
      return authFail("STALE_EPOCH");
    }

    return ok({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
      user: returnedUser,
      sdkUser,
      attemptEpoch: result.data.attemptEpoch,
    } satisfies VerifyOtpResponse);
  },

  adoptChallenge: (
    toFlow: AuthFlowId,
    handle: string,
  ): { ok: true } | { ok: false; code: "CHALLENGE_MISMATCH" | "STALE_EPOCH" } =>
    authAttempts.adoptChallenge(toFlow, handle),

  resumeChallenge: (flow: AuthFlowId): IssuedView | null => authAttempts.resumeChallenge(flow),

  invalidateAuthAttempts: (reason: "logout" | "changePhone" | "userReset"): void => {
    authAttempts.invalidateAuthAttempts(reason);
  },

  getIntentEpoch: (): number => authAttempts.getIntentEpoch(),

  isIntentEpochCurrent: (epoch: number): boolean => authAttempts.isIntentEpochCurrent(epoch),

  cleanupStaleUser: (user: unknown, attemptEpoch: number): Promise<void> =>
    authAttempts.cleanupStaleUser(user, attemptEpoch),

  async refresh(
    _refreshToken: string,
  ): Promise<ApiResult<{ accessToken: string; refreshToken: string }>> {
    try {
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) {
        return authFail("AUTH_REFRESH_FAILED");
      }
      const accessToken = await user.getIdToken(true);
      return ok({
        accessToken,
        refreshToken: user.refreshToken,
      });
    } catch (error) {
      logger.warn("auth.refresh_failed", { code: firebaseAuthCode(error) ?? "unknown" });
      return authFail("AUTH_REFRESH_FAILED");
    }
  },

  async logout(_refreshToken: string | null): Promise<ApiResult<null>> {
    try {
      await auth.signOut();
      return ok(null);
    } catch (error) {
      logger.warn("auth.logout_failed", { code: firebaseAuthCode(error) ?? "unknown" });
      return ok(null);
    }
  },

  /** Test-only reset for the module-level attempt/binding singletons. */
  __resetForTests(): void {
    __resetAuthAttemptsForTests();
    __resetAuthBindingsForTests();
  },
};

export type AuthService = typeof authService;
