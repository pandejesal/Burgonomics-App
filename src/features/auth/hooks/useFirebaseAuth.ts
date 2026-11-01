import { useState, useCallback } from "react";
import { useAuthStore } from "../state/authStore";
import { sanitizePhone, validatePhone, COUNTRY_CODE } from "../utils/validators";
import type { AuthFlowId } from "../utils/authErrors";

const GENERIC_AUTH_ERROR = "Authentication failed. Please try again.";

export function useFirebaseAuth() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const challenge = useAuthStore((s) => s.challenge);
  const error = useAuthStore((s) => s.error);
  const requestOtpAction = useAuthStore((s) => s.requestOtp);
  const verifyOtpAction = useAuthStore((s) => s.verifyOtp);
  const resendOtpAction = useAuthStore((s) => s.resendOtp);
  const changePhoneAction = useAuthStore((s) => s.changePhone);
  const clearError = useAuthStore((s) => s.clearError);
  const logout = useAuthStore((s) => s.logout);

  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendOtp = useCallback(
    async (
      flow: AuthFlowId,
      rawPhone: string,
      deliveryMethod: "sms" | "whatsapp" = "sms",
    ) => {
      const sanitized = sanitizePhone(rawPhone);
      const validation = validatePhone(sanitized);

      if (!validation.valid) {
        return {
          ok: false,
          error: validation.error || "Please enter a valid 10-digit mobile number",
          code: "AUTH_INVALID_PHONE",
        };
      }

      setIsSubmitting(true);
      clearError();

      try {
        const result = await requestOtpAction(flow, sanitized, deliveryMethod);
        setIsSubmitting(false);
        return result;
      } catch {
        setIsSubmitting(false);
        return { ok: false, error: GENERIC_AUTH_ERROR, code: "AUTH_OTP_REQUEST_FAILED" };
      }
    },
    [requestOtpAction, clearError]
  );

  const verifyOtp = useCallback(
    async (flow: AuthFlowId, handle: string, code: string) => {
      if (!code || code.trim().length !== 6) {
        return {
          ok: false,
          error: "Please enter the complete 6-digit verification code",
          code: "AUTH_INVALID_CODE",
        };
      }

      setIsSubmitting(true);
      clearError();

      try {
        const result = await verifyOtpAction(flow, handle, code.trim());
        setIsSubmitting(false);
        return result;
      } catch {
        setIsSubmitting(false);
        return { ok: false, error: GENERIC_AUTH_ERROR, code: "AUTH_OTP_VERIFY_FAILED" };
      }
    },
    [verifyOtpAction, clearError]
  );

  const resendOtp = useCallback(
    async (flow: AuthFlowId) => {
      setIsSubmitting(true);
      clearError();
      try {
        const result = await resendOtpAction(flow);
        setIsSubmitting(false);
        return result;
      } catch {
        setIsSubmitting(false);
        return { ok: false, error: GENERIC_AUTH_ERROR, code: "AUTH_OTP_REQUEST_FAILED" };
      }
    },
    [resendOtpAction, clearError]
  );

  const changePhone = useCallback(() => {
    changePhoneAction();
    setPhone("");
  }, [changePhoneAction]);

  return {
    status,
    user,
    challenge,
    error,
    phone,
    setPhone,
    isSubmitting: isSubmitting || status === "authenticating" || status === "verifying",
    sendOtp,
    verifyOtp,
    resendOtp,
    changePhone,
    clearError,
    logout,
    countryCode: COUNTRY_CODE,
  };
}
