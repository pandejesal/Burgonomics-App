import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useMemo, useState, useEffect } from "react";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { TextField } from "@/shared/components/common/TextField";
import { Text } from "@/shared/components/common/Text";
import { toast } from "@/shared/components/feedback/AppToaster";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useGuestOnly } from "@/features/auth/hooks/useAuthGuard";
import {
  COUNTRY_CODE,
  PHONE_LENGTH,
  sanitizePhone,
  validatePhone,
} from "@/features/auth/utils/validators";
import { authService } from "@/features/auth/services/authService";
import { sanitizeRedirectUrl } from "@/features/auth/utils/routeUtils";
import { APP } from "@/core/constants/app";
import { cn } from "@/lib/utils";

/**
 * SCR-002 Sign In. Mobile-number entry + OTP request.
 *
 * State machine (from `authStore.status`):
 *   unauthenticated → authenticating → otp_sent (nav → /auth/otp)
 *                                    → error   (inline banner)
 */
export const Route = createFileRoute("/auth/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: `Sign in — ${APP.name}` },
      {
        name: "description",
        content: "Sign in to Burgonomics with your Indian mobile number.",
      },
    ],
  }),
  component: LoginScreen,
});

function LoginScreen() {
  const search = Route.useSearch();
  const safeRedirect = sanitizeRedirectUrl(search.redirect);
  useGuestOnly({ redirectTo: safeRedirect });
  const navigate = useNavigate();
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const status = useAuthStore((s) => s.status);
  const serverError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [phone, setPhone] = useState("");
  const deliveryMethod = "sms";
  const [touched, setTouched] = useState(false);
  const validation = useMemo(() => validatePhone(phone), [phone]);
  const isBusy = status === "authenticating";

  useEffect(() => {
    authService.initRecaptcha("recaptcha-container");
    return () => {
      authService.clearRecaptcha();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!validation.valid || isBusy) return;
    clearError();
    const res = await requestOtp(sanitizePhone(phone), deliveryMethod);
    if (res.ok) {
      toast.success(
        `OTP sent via SMS to +91 ${phone}`,
      );

      void navigate({
        to: "/auth/otp",
        search: { redirect: search.redirect },
      });
    } else {
      toast.error(res.error ?? "Couldn't send OTP. Try again.");
    }
  };

  const inlineError = touched && !validation.valid ? validation.error : undefined;

  return (
    <AppShell title="Sign in" showTabs={false} showTopBar={false}>
      <form
        onSubmit={onSubmit}
        noValidate
        className="mx-auto flex min-h-[100dvh] w-full max-w-[28rem] md:max-w-[28rem] max-md:max-w-full flex-col justify-between px-6 pb-8 pt-12"
      >
        <div className="flex flex-col gap-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <span className="type-headline-large">B</span>
            </div>
            <Text variant="headlineLarge" as="h1" className="text-center">
              Welcome to {APP.name}
            </Text>
            <Text variant="bodyMedium" tone="secondary" className="text-center">
              Enter your mobile number to continue. We'll send a secure verification code.
            </Text>
          </div>

          {/* Input */}
          <div className="flex items-stretch gap-2">
            <div
              aria-label="Country code"
              className="flex min-h-[56px] items-center justify-center rounded-[var(--radius-medium)] border-[1.5px] border-divider bg-surface px-4 type-body-large text-text-primary"
            >
              {COUNTRY_CODE}
            </div>
            <div className="flex-1">
              <TextField
                label="Mobile number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                aria-label="Mobile number, 10 digits"
                placeholder="98XXXXXXXX"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (serverError) clearError();
                }}
                onBlur={() => setTouched(true)}
                error={inlineError}
                helper={!inlineError ? `${phone.length}/${PHONE_LENGTH} digits` : undefined}
              />
            </div>
          </div>



          {serverError && (
            <div
              role="alert"
              className="rounded-[var(--radius-medium)] border border-error/40 bg-error/10 px-4 py-3"
            >
              <Text variant="bodyMedium" tone="error">
                {serverError}
              </Text>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 pt-8">
          <AppButton
            type="submit"
            fullWidth
            size="lg"
            loading={isBusy}
            disabled={!validation.valid}
          >
            Continue
          </AppButton>

          <Text variant="caption" tone="secondary" className="text-center">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline text-primary">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline text-primary">
              Privacy Policy
            </Link>
            .
          </Text>
        </div>
        
        {/* Invisible reCAPTCHA container required for Firebase Phone Auth */}
        <div id="recaptcha-container" />
      </form>
    </AppShell>
  );
}
