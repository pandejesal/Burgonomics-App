import { fail, ok, type ApiResult } from "@/core/network/http";
import { auth } from "@/core/config/firebase";
import { 
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";

export interface RequestOtpResponse {
  otpToken: string;
  expiresInSec: number;
  resendAfterSec: number;
  code?: string;
  simulated?: boolean;
  deliveryMethod?: "whatsapp" | "sms";
}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; phone: string; name?: string; email?: string };
  payload?: any;
}

let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;

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
        } catch (_) {}
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

  clearRecaptcha() {
    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch (_) {}
      recaptchaVerifier = null;
    }
  },

  async requestOtp(
    phone: string,
    deliveryMethod: "whatsapp" | "sms" = "sms",
    _otpToken?: string,
  ): Promise<ApiResult<RequestOtpResponse>> {
    try {
      const formattedPhone = normalizePhoneE164(phone);

      if (!recaptchaVerifier) {
        authService.initRecaptcha("recaptcha-container");
      }

      if (!recaptchaVerifier) {
        return fail(
          "RECAPTCHA_UNAVAILABLE",
          "Verification check failed to load. Please refresh the page and try again."
        );
      }

      // Explicitly trigger render if not yet rendered
      try {
        await recaptchaVerifier.render();
      } catch (_renderErr) {
        // Container might already have widget rendered
      }

      const result = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifier);
      confirmationResult = result;

      return ok({
        otpToken: formattedPhone,
        expiresInSec: 300,
        resendAfterSec: 60,
        deliveryMethod,
        simulated: false,
      });
    } catch (error: any) {
      console.error("[Auth] Firebase signInWithPhoneNumber error:", error);
      // Reset reCAPTCHA widget on error so user can retry cleanly
      if (recaptchaVerifier) {
        try {
          recaptchaVerifier.clear();
        } catch (_) {}
        recaptchaVerifier = null;
        authService.initRecaptcha("recaptcha-container");
      }
      return fail(
        error.code || "AUTH_OTP_REQUEST_FAILED",
        error.message || "Failed to send SMS verification code. Please check the number and try again."
      );
    }
  },

  async verifyOtp(otpToken: string, code: string): Promise<ApiResult<VerifyOtpResponse>> {
    try {
      if (!confirmationResult) {
        return fail(
          "NO_CHALLENGE",
          "No active verification session found. Please request a new code."
        );
      }

      const userCredential = await confirmationResult.confirm(code.trim());
      const user = userCredential.user;

      const accessToken = await user.getIdToken();
      const refreshToken = user.refreshToken;
      const uid = user.uid;

      // Firestore user profile sync
      let returnedUser: { id: string; phone: string; name?: string; email?: string } = {
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
          returnedUser.email = profile?.email;
        }
      } catch (dbError) {
        console.warn("[Auth] Firestore user profile sync warning:", dbError);
      }

      return ok({
        accessToken,
        refreshToken,
        user: returnedUser,
      });
    } catch (error: any) {
      console.error("[Auth] Firebase verification confirmation error:", error);
      return fail(
        error.code || "AUTH_OTP_VERIFY_FAILED",
        error.message || "Invalid verification code. Please check and try again."
      );
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
