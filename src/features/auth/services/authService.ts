import { delay, fail, ok, type ApiResult } from "@/core/network/http";
import { auth } from "@/core/config/firebase";
import { 
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult
} from "firebase/auth";
import { isNative } from "@/shared/platform/platform";

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
  user: { id: string; phone: string };
  payload?: any;
}

// In-memory store for real OTP flows (ConfirmationResult)
const otpSessions = new Map<string, { confirmationResult: ConfirmationResult; phone: string }>();

export const authService = {
  initRecaptcha(containerId: string) {
    if (typeof window === "undefined") return;
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
        size: "invisible",
      });
    }
  },

  clearRecaptcha() {
    if (typeof window !== "undefined" && window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = undefined;
    }
  },

  async requestOtp(
    phone: string,
    deliveryMethod: "whatsapp" | "sms" = "sms",
    otpToken?: string,
  ): Promise<ApiResult<RequestOtpResponse>> {
    try {
      const appVerifier = window.recaptchaVerifier;
      if (!appVerifier) {
        return fail("AUTH_OTP_REQUEST_FAILED", "Security check not initialized. Please refresh the page.");
      }

      const fullPhone = `+91${phone}`;
      const confirmationResult = await signInWithPhoneNumber(auth, fullPhone, appVerifier);
      
      const token = `otp_${Date.now()}`;
      otpSessions.set(token, { confirmationResult, phone });

      return ok({
        otpToken: token,
        expiresInSec: 300,
        resendAfterSec: 30,
        deliveryMethod,
        simulated: false,
      });
    } catch (error: any) {
      console.error("Auth requestOtp error:", error);
      // Reset reCAPTCHA if it fails so the user can try again
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then((widgetId: number) => {
          window.grecaptcha.reset(widgetId);
        }).catch(() => {});
      }
      return fail("AUTH_OTP_REQUEST_FAILED", error.message || "Failed to request OTP. Please try again.");
    }
  },

  async verifyOtp(otpToken: string, code: string): Promise<ApiResult<VerifyOtpResponse>> {
    try {
      const session = otpSessions.get(otpToken);
      if (!session) {
        return fail("AUTH_OTP_VERIFY_FAILED", "Session expired. Please request OTP again.");
      }

      const credential = await session.confirmationResult.confirm(code);
      const user = credential.user;

      const accessToken = await user.getIdToken();
      const refreshToken = user.refreshToken;
      const uid = user.uid;

      // Firestore sync
      try {
        const { db } = await import("@/core/config/firebase");
        const { doc, getDoc, setDoc } = await import("firebase/firestore");
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            id: uid,
            phone: session.phone,
            createdAt: new Date().toISOString()
          });
        }
      } catch (dbError) {
        console.error("Firestore user sync failed:", dbError);
      }

      otpSessions.delete(otpToken);

      return ok({
        accessToken,
        refreshToken,
        user: { id: uid, phone: session.phone },
      });
    } catch (error: any) {
      console.error("Firebase verifyOtp error:", error);
      if (error.code === "auth/invalid-verification-code") {
        return fail("AUTH_OTP_VERIFY_FAILED", "Incorrect verification code. Please try again.");
      }
      return fail("AUTH_OTP_VERIFY_FAILED", "Authentication failed. Please try again.");
    }
  },

  async refresh(
    refreshToken: string,
  ): Promise<ApiResult<{ accessToken: string; refreshToken: string }>> {
    try {
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
      return fail("AUTH_REFRESH_FAILED", error.message);
    }
  },

  async logout(refreshToken: string | null): Promise<ApiResult<null>> {
    try {
      await auth.signOut();
      return ok(null);
    } catch (error) {
      return ok(null);
    }
  },
};

export type AuthService = typeof authService;

declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier | undefined;
    grecaptcha: any;
  }
}

