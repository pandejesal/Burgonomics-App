import { fail, ok, type ApiResult } from "@/core/network/http";
import { auth } from "@/core/config/firebase";
import { 
  signInWithCustomToken,
} from "firebase/auth";
import { appConfig } from "@/core/config/env";

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

const getAuthBaseUrl = (): string => {
  if (appConfig.integrations.paymentsApiBaseUrl) {
    const root = appConfig.integrations.paymentsApiBaseUrl.replace(/\/payments\/?$/, "").replace(/\/$/, "");
    return `${root}/auth`;
  }
  return "https://us-central1-burgonomics-7faa8.cloudfunctions.net/auth";
};

export const authService = {
  /**
   * Safe no-op helpers for backwards compatibility with existing UI hooks.
   */
  initRecaptcha(_containerId: string) {
    // Custom SMS provider architecture operates without reCAPTCHA friction.
  },

  clearRecaptcha() {
    // No-op
  },

  async requestOtp(
    phone: string,
    deliveryMethod: "whatsapp" | "sms" = "sms",
    _otpToken?: string,
  ): Promise<ApiResult<RequestOtpResponse>> {
    try {
      const baseUrl = getAuthBaseUrl();
      const targetUrl = baseUrl.endsWith("/auth") 
        ? `${baseUrl}/request-otp` 
        : `${baseUrl}/auth/request-otp`;

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          phone,
          deliveryMethod,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return fail(
          data.error || "AUTH_OTP_REQUEST_FAILED",
          data.message || "Failed to request OTP. Please try again."
        );
      }

      return ok({
        otpToken: data.otpToken || phone,
        expiresInSec: data.expiresInSec || 300,
        resendAfterSec: data.resendAfterSec || 60,
        deliveryMethod: data.deliveryMethod || deliveryMethod,
        code: data.code,
        simulated: data.simulated || false,
      });
    } catch (error: any) {
      console.error("Auth requestOtp transport error:", error);
      return fail("AUTH_OTP_REQUEST_FAILED", error.message || "Failed to connect to authentication service.");
    }
  },

  async verifyOtp(otpToken: string, code: string): Promise<ApiResult<VerifyOtpResponse>> {
    try {
      const baseUrl = getAuthBaseUrl();
      const targetUrl = baseUrl.endsWith("/auth") 
        ? `${baseUrl}/verify-otp` 
        : `${baseUrl}/auth/verify-otp`;

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          phone: otpToken,
          otpToken,
          code: code.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return fail(
          data.error || "AUTH_OTP_VERIFY_FAILED",
          data.message || "Invalid verification code. Please try again."
        );
      }

      if (!data.accessToken) {
        return fail("AUTH_OTP_VERIFY_FAILED", "Authentication token missing from server response.");
      }

      // Exchange Custom Token for Firebase ID Token & Session
      const userCredential = await signInWithCustomToken(auth, data.accessToken);
      const user = userCredential.user;

      const accessToken = await user.getIdToken();
      const refreshToken = user.refreshToken;
      const uid = user.uid;

      // Firestore user profile sync
      let returnedUser: { id: string; phone: string; name?: string; email?: string } = {
        id: uid,
        phone: data.user?.phone || user.phoneNumber || otpToken,
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
        console.warn("Firestore user sync warning:", dbError);
      }

      return ok({
        accessToken,
        refreshToken,
        user: returnedUser,
      });
    } catch (error: any) {
      console.error("Firebase custom token verification error:", error);
      return fail("AUTH_OTP_VERIFY_FAILED", error.message || "Authentication failed. Please try again.");
    }
  },

  async refresh(
    refreshToken: string,
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
      return fail("AUTH_REFRESH_FAILED", error.message);
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
