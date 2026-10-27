import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { OTPInputGrid } from "@/features/auth/components/OTPInputGrid";
import { RecaptchaHost } from "@/features/auth/components/RecaptchaHost";
import { Text } from "@/shared/components/common/Text";
import { toast } from "@/shared/components/feedback/AppToaster";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useGuestOnly } from "@/features/auth/hooks/useAuthGuard";
import { useCountdown } from "@/features/auth/hooks/useCountdown";
import { OTP_LENGTH, validateOtp, COUNTRY_CODE } from "@/features/auth/utils/validators";
import { isAuthoredAuthMessage } from "@/features/auth/utils/authErrors";
import { sanitizeRedirectUrl } from "@/features/auth/utils/routeUtils";
import { authService } from "@/features/auth/services/authService";
import { toUserMessage, userMessageForText } from "@/core/errors/userMessages";
import { APP } from "@/core/constants/app";

/**
 * SCR-003 OTP Verification.
 *
 * Reads the active challenge from `authStore`. If a user lands here
 * without a challenge (deep-link / reload), we bounce back to
 * `/auth/login`. Verifies against Firebase Auth / backend service;
 * on success the session is persisted, guest cart & orders are preserved,
 * and user navigates to `redirectTarget` (or `/stores`).
 */
export const Route = createFileRoute("/auth/otp")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: `Verify OTP — ${APP.name}` },
      { name: "description", content: "Enter the 6-digit verification code." },
    ],
  }),
  component: OtpScreen,
});

function OtpScreen() {
  const search = Route.useSearch();
  const redirectTarget = sanitizeRedirectUrl(search.redirect);
  useGuestOnly({ redirectTo: redirectTarget });
  const navigate = useNavigate();
  const challenge = useAuthStore((s) => s.challenge);
  const status = useAuthStore((s) => s.status);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resendOtp = useAuthStore((s) => s.resendOtp);
  const changePhone = useAuthStore((s) => s.changePhone);
  const serverError = useAuthStore((s) => s.error);

  const [code, setCode] = useState("");
  const [isResending, setIsResending] = useState(false);
  const { remaining, isDone, reset } = useCountdown(challenge?.resendAfterSec ?? 30);

  const isVerifying = status === "verifying";

  // Guard: if no active challenge and unauthenticated, return to login
  useEffect(() => {
    if (!challenge && status !== "authenticated") {
      void navigate({
        to: "/auth/login",
        replace: true,
        search: { redirect: search.redirect },
      });
    }
  }, [challenge, status, navigate, search.redirect]);

  // Setup: adopt the explicit login challenge into the mounted OTP surface.
  // Adoption is what makes the unmounted login host stop bricking this screen;
  // verification without it is a CHALLENGE_MISMATCH.
  useEffect(() => {
    if (!challenge) return;
    const adopted = authService.adoptChallenge("otp", challenge.handle);
    if (!adopted.ok) {
      toast.error(
        adopted.code === "STALE_EPOCH"
          ? "This sign-in attempt expired. Request a new code."
          : "This verification session is no longer active. Request a new code.",
      );
    }
  }, [challenge]);

  const submit = async (value: string) => {
    const v = validateOtp(value);
    if (!v.valid || !challenge) return;
    const res = await verifyOtp("otp", challenge.handle, value);
    if (res.ok) {
      toast.success("Signed in successfully");
      // Seamlessly preserve guest cart, selected branch, and fulfillment
      void navigate({ to: redirectTarget, replace: true });
    } else {
      setCode("");
      // Code only: provider messages may contain the phone number.
      console.error("[auth] OTP verify failed:", res.code);
      toast.error(
        res.error && isAuthoredAuthMessage(res.error) ? res.error : toUserMessage(res),
      );
    }
  };

  const handleResend = async () => {
    if (isResending || !isDone) return;
    setIsResending(true);
    const res = await resendOtp("otp");
    setIsResending(false);

    if (res.ok) {
      reset();
      setCode("");
      toast.success("New verification code sent via SMS");
    } else {
      // Auth service authors all copy; only the code is diagnostic.
      console.error("[auth] OTP resend failed:", res.code);
      toast.error(
        res.error && isAuthoredAuthMessage(res.error) ? res.error : toUserMessage(res),
      );
    }
  };

  const handleChangeNumber = () => {
    changePhone();
    void navigate({
      to: "/auth/login",
      replace: true,
      search: { redirect: search.redirect },
    });
  };

  if (!challenge) return null;

  // Mask phone number: e.g. ******3210
  const maskedPhone =
    challenge.phone.length === 10 ? `******${challenge.phone.slice(-4)}` : challenge.phone;

  return (
    <AppShell title="Verify" backTo="/auth/login" showTabs={false} showTopBar={true}>
      <div className="mx-auto flex w-full max-w-[28rem] md:max-w-[28rem] max-md:max-w-full flex-col gap-8 px-6 pt-8 pb-12">
        <div className="flex flex-col gap-2">
          <Text variant="headlineLarge" as="h1" className="font-bold text-text-primary">
            Enter verification code
          </Text>
          <Text variant="bodyMedium" tone="secondary">
            We sent a {OTP_LENGTH}-digit code via SMS to{" "}
            <span className="text-text-primary font-semibold">
              {COUNTRY_CODE} {maskedPhone}
            </span>
            .{" "}
            <button
              type="button"
              onClick={handleChangeNumber}
              className="text-primary underline font-medium hover:opacity-80 transition-opacity"
            >
              Edit Number
            </button>
          </Text>
        </div>

        <OTPInputGrid
          length={OTP_LENGTH}
          value={code}
          onChange={setCode}
          onComplete={(completedCode) => void submit(completedCode)}
          error={Boolean(serverError)}
          autoFocus
          disabled={isVerifying}
        />

        {serverError && (
          <div
            role="alert"
            className="rounded-[var(--radius-medium)] border border-error/40 bg-error/10 px-4 py-3"
          >
            <Text variant="bodyMedium" tone="error">
              {isAuthoredAuthMessage(serverError)
                ? serverError
                : userMessageForText(serverError)}
            </Text>
          </div>
        )}

        <AppButton
          fullWidth
          size="lg"
          variant="cta"
          loading={isVerifying}
          disabled={code.length !== OTP_LENGTH || isVerifying}
          onClick={() => void submit(code)}
          className="rounded-[var(--radius-medium)]"
        >
          Verify & continue
        </AppButton>

        <div className="text-center">
          {isDone ? (
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={isResending}
              className="type-label-large text-primary underline font-medium hover:opacity-80 transition-opacity"
            >
              {isResending ? "Sending new code..." : "Resend OTP"}
            </button>
          ) : (
            <Text variant="bodyMedium" tone="secondary">
              Resend OTP in <span className="font-semibold text-text-primary">{remaining}s</span>
            </Text>
          )}
        </div>

        {/* Per-mount reCAPTCHA host for SMS resends. */}
        <RecaptchaHost flow="otp" />
      </div>
    </AppShell>
  );
}
