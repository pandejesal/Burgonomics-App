import { useState, useCallback, useEffect } from "react";
import { useAuthStore } from "../state/authStore";
import { sanitizePhone, validatePhone, COUNTRY_CODE } from "../utils/validators";
import { authService } from "../services/authService";

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

  // Initialize reCAPTCHA on mount
  useEffect(() => {
    authService.initRecaptcha("recaptcha-container");
    return () => {
      authService.clearRecaptcha();
    };
  }, []);

  const sendOtp = useCallback(
    async (rawPhone: string, deliveryMethod: "sms" | "whatsapp" = "sms") => {
      const sanitized = sanitizePhone(rawPhone);
      const validation = validatePhone(sanitized);

      if (!validation.valid) {
        return { ok: false, error: validation.error || "Please enter a valid 10-digit mobile number" };
      }

      setIsSubmitting(true);
      clearError();

      try {
        const result = await requestOtpAction(sanitized, deliveryMethod);
        setIsSubmitting(false);
        return result;
      } catch (err: any) {
        setIsSubmitting(false);
        return { ok: false, error: err.message || "Failed to send verification code" };
      }
    },
    [requestOtpAction, clearError]
  );

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!code || code.trim().length !== 6) {
        return { ok: false, error: "Please enter the complete 6-digit verification code" };
      }

      setIsSubmitting(true);
      clearError();

      try {
        const result = await verifyOtpAction(code.trim());
        setIsSubmitting(false);
        return result;
      } catch (err: any) {
        setIsSubmitting(false);
        return { ok: false, error: err.message || "Verification failed" };
      }
    },
    [verifyOtpAction, clearError]
  );

  const resendOtp = useCallback(async () => {
    setIsSubmitting(true);
    clearError();
    try {
      const result = await resendOtpAction();
      setIsSubmitting(false);
      return result;
    } catch (err: any) {
      setIsSubmitting(false);
      return { ok: false, error: err.message || "Failed to resend code" };
    }
  }, [resendOtpAction, clearError]);

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
