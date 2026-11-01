import { fail, ok, type ApiResult } from "@/core/network/http";
import { DEFAULT_DELIVERY_METHOD } from "@/features/auth/utils/validators";
import { isSyntheticEmail } from "@/features/profile/state/profileStore";
import { auth } from "@/core/config/firebase";
import { logger } from "@/core/logging/logger";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";

export interface RequestOtpResponse {
  otpToken: string;
  expiresInSec: number;
  resendAfterSec: number;
  code?: string;
  deliveryMethod?: "whatsapp" | "sms";
}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string; name?: string; email?: string };
  /** Exact session this operation created; used to discard only it. */
  sessionRef?: { uid: string; refreshToken: string };
  payload?: any;
}

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

/**
 * Bumped on every cancel / new request. A Firebase callback that resolves
 * after the user moved on must not install itself as the current challenge,
 * and a confirm that lands late must not leave its session behind.
 */
let challengeGeneration = 0;

/** One confirm per service instance: prevents two owned verifies for one uid. */
let verifyInFlight = false;

export interface AuthSessionRef {
  uid: string;
  refreshToken: string;
}

const normalizePhoneE164 = (phone: string): string => {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("91") && cleaned.length === 12) return `+${cleaned}`;
  return `+91${cleaned.replace(/^0+/, "")}`;
};

export const authService = {
  /**
   * Initializes real RecaptchaVerifier bound to the specified container.
   * Uses explicit render for reliable operation inside Capacitor WebViews.
   */
  initRecaptcha(containerId: string = "recaptcha-container") {
    if (typeof window === "undefined") return;
    const element = document.getElementById(containerId);
    if (!element) {
      console.warn(`[Auth] Recaptcha container #${containerId} not found in DOM`);
      return;
    }
    try {
      if (recaptchaVerifier) {
        try {
          recaptchaVerifier.clear();
        } catch {
          // ignore
        }
        recaptchaVerifier = null;
      }
      recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
        size: "normal",
        callback: () => {
          // reCAPTCHA solved
        },
        "expired-callback": () => {
          console.warn("[Auth] reCAPTCHA expired, will re-render on next request.");
        },
      });
      window.recaptchaVerifier = recaptchaVerifier;
    } catch (err) {
      console.error("[Auth] Failed to initialize RecaptchaVerifier:", err);
    }
  },

  /**
   * Drops the in-flight Firebase phone challenge.
   *
   * `confirmationResult` is module-global, so without this a challenge issued
   * for a previous number (or a previous session) can still be confirmed after
   * the user changed number, logged out, or the request failed. Callers own the
   * lifecycle: changePhone / logout / failed request all cancel here.
   */
  cancelChallenge() {
    confirmationResult = null;
    challengeGeneration += 1;
  },

  clearRecaptcha() {
    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch {
        // ignore
      }
      recaptchaVerifier = null;
    }
  },

  async requestOtp(
    phone: string,
    deliveryMethod: "whatsapp" | "sms" = DEFAULT_DELIVERY_METHOD,
    _otpToken?: string,
  ): Promise<ApiResult<RequestOtpResponse>> {
    // Drop the previous challenge before the first await: a request that is
    // superseded mid-flight must not leave an older code confirmable.
    challengeGeneration += 1;
    const generation = challengeGeneration;
    confirmationResult = null;
    try {
      const formattedPhone = normalizePhoneE164(phone);

      if (!recaptchaVerifier) {
        authService.initRecaptcha("recaptcha-container");
      }

      if (!recaptchaVerifier) {
        return fail(
          "RECAPTCHA_UNAVAILABLE",
          "Verification check failed to load. Please refresh the page and try again.",
        );
      }

      // Explicitly trigger render if not yet rendered
      try {
        await recaptchaVerifier.render();
      } catch {
        // Container might already have widget rendered
      }

      const result = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
      if (generation !== challengeGeneration) {
        // Cancelled / superseded while the SMS was being dispatched.
        return fail("AUTH_OTP_SUPERSEDED", "This code request was cancelled. Please try again.");
      }
      confirmationResult = result;

      return ok({
        otpToken: formattedPhone,
        expiresInSec: 300,
        resendAfterSec: 60,
        deliveryMethod,
      });
    } catch (error: any) {
      // Code only: the raw Firebase error embeds the phone in message/customData.
      logger.error("auth.otp_request_failed", error, { code: error?.code });
      // Reset reCAPTCHA widget on error so user can retry cleanly
      if (recaptchaVerifier) {
        try {
          recaptchaVerifier.clear();
        } catch {
          // ignore
        }
        recaptchaVerifier = null;
        authService.initRecaptcha("recaptcha-container");
      }
      // A failed request must not leave the previous challenge confirmable.
      authService.cancelChallenge();
      return fail(
        error.code || "AUTH_OTP_REQUEST_FAILED",
        error.message ||
          "Failed to send SMS verification code. Please check the number and try again.",
      );
    }
  },

  async verifyOtp(otpToken: string, code: string): Promise<ApiResult<VerifyOtpResponse>> {
    // One confirm per service instance: two owned verifies for the same uid
    // would race each other and make "which session is mine" ambiguous.
    if (verifyInFlight) {
      return fail("VERIFY_IN_PROGRESS", "A verification is already in progress.");
    }
    if (!confirmationResult) {
      return fail(
        "NO_CHALLENGE",
        "No active verification session found. Please request a new code.",
      );
    }

    const generation = challengeGeneration;
    const challenge = confirmationResult;
    verifyInFlight = true;

    try {
      const userCredential = await challenge.confirm(code.trim());
      const user = userCredential.user;

      const accessToken = await user.getIdToken();
      const refreshToken = user.refreshToken;
      const uid = user.uid;
      const sessionRef: AuthSessionRef = { uid, refreshToken };

      // Cancelled while the code was confirming. Firebase has already minted a
      // session, so discard exactly this one — never another identity.
      if (generation !== challengeGeneration) {
        await authService.discardConfirmedSession(sessionRef);
        return fail(
          "AUTH_VERIFY_CANCELLED",
          "Verification was cancelled. Please request a new code.",
        );
      }

      // Firestore user profile sync
      const returnedUser: { id: string; phone: string; name?: string; email?: string } = {
        id: uid,
        phone: user.phoneNumber || otpToken,
      };

      try {
        const { db } = await import("@/core/config/firebase");
        const { doc, getDoc, setDoc } = await import("firebase/firestore");
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          await setDoc(userRef, {
            id: uid,
            phone: returnedUser.phone,
            createdAt: new Date().toISOString(),
          });
        } else {
          const profile = userSnap.data();
          returnedUser.name = profile?.fullName || profile?.name;
          // P1-4: legacy docs may carry the fabricated `<phone>@burgonomics.in`
          // address — never let it into the persisted auth user (it feeds the
          // Razorpay prefill + secureStorage cache).
          if (!isSyntheticEmail(profile?.email)) {
            returnedUser.email = profile?.email;
          }
        }
      } catch (dbError) {
        console.warn("[Auth] Firestore user profile sync warning:", dbError);
      }

      return ok({
        accessToken,
        refreshToken,
        user: returnedUser,
        sessionRef,
      });
    } catch (error: any) {
      logger.error("auth.otp_verify_failed", error, { code: error?.code });
      return fail(
        error.code || "AUTH_OTP_VERIFY_FAILED",
        error.message || "Invalid verification code. Please check and try again.",
      );
    } finally {
      verifyInFlight = false;
    }
  },

  /**
   * Signs out ONLY the session that a specific verify operation created.
   *
   * `confirm()` mutates Firebase auth state before it returns, so cancelling
   * after that point leaves a live session with no owner. This compares the
   * exact uid AND refresh token captured from that operation, so a different
   * user, or a re-login that produced a new refresh token, is never touched.
   */
  async discardConfirmedSession(ref: AuthSessionRef): Promise<void> {
    try {
      const current = auth.currentUser;
      if (!current) return;
      // Without a captured refresh token there is nothing to compare against,
      // so we cannot prove this session is ours. Refuse rather than guess:
      // a uid-only match would sign out a NEWER session for the same user.
      if (!ref.refreshToken) return;
      if (current.uid !== ref.uid) return;
      if (current.refreshToken !== ref.refreshToken) return;
      await auth.signOut();
    } catch {
      // Cleanup is best effort and must never throw into the auth flow.
    }
  },

  async refresh(
    _refreshToken: string,
  ): Promise<ApiResult<{ accessToken: string; refreshToken: string }>> {
    try {
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) {
        return fail("AUTH_REFRESH_FAILED", "No active firebase session.");
      }
      const accessToken = await user.getIdToken(true);
      return ok({
        accessToken,
        refreshToken: user.refreshToken,
      });
    } catch (error: any) {
      return fail("AUTH_REFRESH_FAILED", error.message || "Session refresh failed.");
    }
  },

  async logout(_refreshToken: string | null): Promise<ApiResult<null>> {
    try {
      authService.cancelChallenge();
      await auth.signOut();
      return ok(null);
    } catch (_error) {
      return ok(null);
    }
  },
};

export type AuthService = typeof authService;

declare global {
  interface Window {
    recaptchaVerifier?: any;
    grecaptcha?: any;
  }
}
