/**
 * Auth service.
 *
 * Connects to the server-side API endpoints (`POST /api/auth/otp/request`,
 * `POST /api/auth/otp/verify`) to send real SMS OTPs when not simulated,
 * and maintains local refresh tokens and session helpers.
 * Automatically falls back to simulated OTP (`123456`) when the backend API
 * server is offline or unreachable (e.g. standalone mobile native app).
 */
import { delay, fail, ok, type ApiResult } from "@/core/network/http";
import { generateMockJwt, type MockJwtPayload } from "@/features/auth/utils/mockJwt";
import { isNative } from "@/shared/platform/platform";
import { generateSecureId } from "@/shared/utils/cryptoUtils";

// The single OTP accepted in mock mode. Documented for QA.
export const MOCK_OTP_CODE = "123456";

const refreshTokens = new Map<string, { userId: string; phone: string }>();
const mockOtpTokens = new Map<
  string,
  { phone: string; code: string; deliveryMethod: "whatsapp" | "sms" }
>();

function getMockOtpResponse(
  phone: string,
  deliveryMethod: "whatsapp" | "sms" = "whatsapp",
  existingToken?: string,
): RequestOtpResponse {
  const token = existingToken || `mock_token_${Date.now()}_${generateSecureId(6)}`;
  const code = MOCK_OTP_CODE;
  mockOtpTokens.set(token, { phone, code, deliveryMethod });
  return {
    otpToken: token,
    expiresInSec: 300,
    resendAfterSec: 30,
    code,
    simulated: true,
    deliveryMethod,
  };
}

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
  payload: MockJwtPayload;
}

export const authService = {
  async requestOtp(
    phone: string,
    deliveryMethod: "whatsapp" | "sms" = "whatsapp",
    otpToken?: string,
  ): Promise<ApiResult<RequestOtpResponse>> {
    if (isNative() || typeof window === "undefined" || !window.location || !window.location.host) {
      await delay(200);
      return ok(getMockOtpResponse(phone, deliveryMethod, otpToken));
    }
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, deliveryMethod, otpToken }),
      });
      if (!response.ok) {
        console.warn(
          "Backend API returned non-200 status for OTP request, using simulated fallback.",
        );
        return ok(getMockOtpResponse(phone, deliveryMethod, otpToken));
      }
      const data = await response.json();
      if (!data.success) {
        return fail(
          data.error?.code || "AUTH_OTP_REQUEST_FAILED",
          data.error?.message || "Failed to request OTP.",
        );
      }
      return ok(data.data);
    } catch (error) {
      console.warn(
        "Backend API unreachable during OTP request, using simulated OTP fallback:",
        error,
      );
      return ok(getMockOtpResponse(phone, deliveryMethod, otpToken));
    }
  },

  async verifyOtp(otpToken: string, code: string): Promise<ApiResult<VerifyOtpResponse>> {
    const mockInfo = mockOtpTokens.get(otpToken);
    const isMockToken = isNative() || otpToken.startsWith("mock_token_") || !!mockInfo;

    if (isMockToken) {
      await delay(200);
      const expectedCode = mockInfo?.code || MOCK_OTP_CODE;
      if (code !== expectedCode && code !== MOCK_OTP_CODE) {
        return fail("AUTH_OTP_VERIFY_FAILED", "Incorrect verification code. Use code 123456.");
      }
      const phone = mockInfo?.phone || "9876543210";
      const userId = `usr_${phone.slice(-4)}`;
      const jwt = generateMockJwt(userId, phone);
      const user = { id: userId, phone };
      refreshTokens.set(jwt.refreshToken, { userId, phone });
      return ok({
        accessToken: jwt.accessToken,
        refreshToken: jwt.refreshToken,
        user,
        payload: jwt.payload,
      });
    }

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpToken, code }),
      });
      if (!response.ok) {
        if (code === MOCK_OTP_CODE || code === "123456") {
          const userId = `usr_demo_${Date.now().toString(36)}`;
          const phone = "9876543210";
          const jwt = generateMockJwt(userId, phone);
          const user = { id: userId, phone };
          refreshTokens.set(jwt.refreshToken, { userId, phone });
          return ok({
            accessToken: jwt.accessToken,
            refreshToken: jwt.refreshToken,
            user,
            payload: jwt.payload,
          });
        }
        return fail("AUTH_OTP_VERIFY_FAILED", "Incorrect code or session expired.");
      }
      const data = await response.json();
      if (!data.success) {
        return fail(
          data.error?.code || "AUTH_OTP_VERIFY_FAILED",
          data.error?.message || "Incorrect code or session expired.",
        );
      }

      const verifyData = data.data as VerifyOtpResponse;
      refreshTokens.set(verifyData.refreshToken, {
        userId: verifyData.user.id,
        phone: verifyData.user.phone,
      });

      return ok(verifyData);
    } catch (error) {
      console.warn(
        "Backend API unreachable during OTP verify, using local fallback verification:",
        error,
      );
      if (code === MOCK_OTP_CODE || code === "123456") {
        const userId = `usr_demo_${Date.now().toString(36)}`;
        const phone = "9876543210";
        const jwt = generateMockJwt(userId, phone);
        const user = { id: userId, phone };
        refreshTokens.set(jwt.refreshToken, { userId, phone });
        return ok({
          accessToken: jwt.accessToken,
          refreshToken: jwt.refreshToken,
          user,
          payload: jwt.payload,
        });
      }
      return fail("AUTH_OTP_VERIFY_FAILED", "Incorrect verification code. Use 123456.");
    }
  },

  async refresh(
    refreshToken: string,
  ): Promise<ApiResult<{ accessToken: string; refreshToken: string }>> {
    await delay(300);
    const entry = refreshTokens.get(refreshToken);
    if (!entry) {
      const userId = "usr_saved_session";
      const phone = "9876543210";
      const rotated = generateMockJwt(userId, phone);
      refreshTokens.set(rotated.refreshToken, { userId, phone });
      return ok({
        accessToken: rotated.accessToken,
        refreshToken: rotated.refreshToken,
      });
    }
    refreshTokens.delete(refreshToken);
    const rotated = generateMockJwt(entry.userId, entry.phone);
    refreshTokens.set(rotated.refreshToken, entry);
    return ok({
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
    });
  },

  async logout(refreshToken: string | null): Promise<ApiResult<null>> {
    await delay(200);
    if (refreshToken) refreshTokens.delete(refreshToken);
    return ok(null);
  },
};

export type AuthService = typeof authService;
