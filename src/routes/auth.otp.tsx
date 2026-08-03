import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { OtpInput } from "@/shared/components/common/OtpInput";
import { Text } from "@/shared/components/common/Text";
import { toast } from "@/shared/components/feedback/AppToaster";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useGuestOnly } from "@/features/auth/hooks/useAuthGuard";
import { useCountdown } from "@/features/auth/hooks/useCountdown";
import { OTP_LENGTH, validateOtp, COUNTRY_CODE } from "@/features/auth/utils/validators";
import { sanitizeRedirectUrl } from "@/features/auth/utils/routeUtils";
import { MOCK_OTP_CODE } from "@/features/auth/services/authService";
import { APP } from "@/core/constants/app";
import { isDev } from "@/core/config/env";
import { AlertCircle, MessageCircle, Smartphone } from "lucide-react";

/**
 * SCR-003 OTP Verification.
 *
 * Reads the active challenge from `authStore`. If a user lands here
 * without a challenge (deep-link / reload), we bounce back to
 * `/auth/login`. Verifies against the mock service; on success the
 * store persists the session and navigates to `/stores`.
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
  const requestOtpAction = useAuthStore((s) => s.requestOtp);
  const changePhone = useAuthStore((s) => s.changePhone);
  const serverError = useAuthStore((s) => s.error);

  const [code, setCode] = useState("");
  const [isFallbackSwitching, setIsFallbackSwitching] = useState(false);
  const { remaining, isDone, reset } = useCountdown(challenge?.resendAfterSec ?? 30);

  const isVerifying = status === "verifying";

  // Guard: if no active challenge, kick back to login.
  useEffect(() => {
    if (!challenge && status !== "authenticated") {
      void navigate({
        to: "/auth/login",
        replace: true,
        search: { redirect: search.redirect },
      });
    }
  }, [challenge, status, navigate, search.redirect]);

  // Auto-submit once 6 digits entered.
  useEffect(() => {
    if (code.length === OTP_LENGTH && !isVerifying) {
      void submit(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const submit = async (value: string) => {
    const v = validateOtp(value);
    if (!v.valid) return;
    const res = await verifyOtp(value);
    if (res.ok) {
      toast.success("Signed in");
      // Restore the exact URL that triggered the auth guard (e.g. /checkout)
      // — cart, store selection, and fulfillment method are all preserved
      // because their stores are independent of auth.
      void navigate({ to: redirectTarget, replace: true });
    } else {
      setCode("");
      toast.error(res.error ?? "Verification failed.");
    }
  };

  const onResend = async () => {
    const res = await resendOtp();
    if (res.ok) {
      reset();
      setCode("");
      const newChallenge = useAuthStore.getState().challenge;

      toast.success("New code sent");
      if (newChallenge?.code) {
        toast(
          `💬 ${newChallenge.deliveryMethod?.toUpperCase() || "SMS"} from BURGONOMICS (Simulated)`,
          {
            description: `Your OTP verification code is ${newChallenge.code}. It is valid for 5 minutes.`,
            duration: 10000,
          },
        );
      }
    } else {
      toast.error(res.error ?? "Couldn't resend. Try again.");
    }
  };

  const handleFallbackSwitch = async () => {
    if (!challenge) return;
    setIsFallbackSwitching(true);
    const fallbackMethod = challenge.deliveryMethod === "whatsapp" ? "sms" : "whatsapp";

    // Call requestOtp with same phone, new deliveryMethod, and current otpToken for backend reuse decryption
    const res = await requestOtpAction(challenge.phone, fallbackMethod, challenge.otpToken);
    setIsFallbackSwitching(false);

    if (res.ok) {
      reset();
      setCode("");
      const newChallenge = useAuthStore.getState().challenge;
      toast.success(`Requested delivery via ${fallbackMethod === "whatsapp" ? "WhatsApp" : "SMS"}`);

      if (newChallenge?.code) {
        toast(`💬 ${fallbackMethod.toUpperCase()} from BURGONOMICS (Simulated)`, {
          description: `Your OTP verification code is ${newChallenge.code}. It is valid for 5 minutes.`,
          duration: 10000,
        });
      }
    } else {
      toast.error(
        res.error ??
          `Couldn't send code via ${fallbackMethod === "whatsapp" ? "WhatsApp" : "SMS"}.`,
      );
    }
  };

  const onChangeNumber = () => {
    changePhone();
    void navigate({
      to: "/auth/login",
      replace: true,
      search: { redirect: search.redirect },
    });
  };

  if (!challenge) return null;

  // Mask the phone number as requested for production grade security: e.g. ******3210
  const maskedPhone =
    challenge.phone.length === 10 ? `******${challenge.phone.slice(-4)}` : challenge.phone;

  return (
    <AppShell title="Verify" backTo="/auth/login" showTabs={false} showTopBar={true}>
      <div className="mx-auto flex w-full max-w-[28rem] md:max-w-[28rem] max-md:max-w-full flex-col gap-8 px-6 pt-8 pb-12">
        <div className="flex flex-col gap-2">
          <Text variant="headlineLarge" as="h1">
            Enter verification code
          </Text>
          <Text variant="bodyMedium" tone="secondary">
            We sent a {OTP_LENGTH}-digit code via{" "}
            <span className="font-semibold text-text-primary capitalize">
              {challenge.deliveryMethod || "SMS"}
            </span>{" "}
            to{" "}
            <span className="text-text-primary font-medium">
              {COUNTRY_CODE} {maskedPhone}
            </span>
            .{" "}
            <button type="button" onClick={onChangeNumber} className="text-primary underline">
              Change
            </button>
          </Text>
        </div>

        <OtpInput
          length={OTP_LENGTH}
          value={code}
          onChange={setCode}
          error={!!serverError}
          autoFocus
        />

        {serverError && (
          <div role="alert">
            <Text variant="bodyMedium" tone="error">
              {serverError}
            </Text>
          </div>
        )}

        {challenge.code && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-1.5 shadow-[var(--shadow-low)]">
            <div className="flex items-center gap-2 text-primary">
              <span className="text-base animate-pulse">💬</span>
              <span className="type-label-large font-bold">
                Simulated {challenge.deliveryMethod?.toUpperCase() || "SMS"} Delivery
              </span>
            </div>
            <Text variant="bodySmall" tone="secondary">
              Your verification code is{" "}
              <span className="font-mono font-bold text-text-primary text-base bg-surface px-2 py-0.5 rounded border border-divider">
                {challenge.code}
              </span>
              .
            </Text>
          </div>
        )}

        {/* Fallback channel switcher card */}
        <div className="rounded-2xl border border-divider bg-surface/50 p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 mt-0.5">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <Text variant="bodySmall" className="font-semibold text-text-primary">
                Having trouble receiving the code?
              </Text>
              <Text variant="caption" tone="secondary">
                You are currently sending via{" "}
                <span className="capitalize">{challenge.deliveryMethod || "SMS"}</span>
              </Text>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleFallbackSwitch()}
            disabled={isFallbackSwitching}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary/5 py-2.5 px-4 text-xs font-bold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 outline-none focus:ring-2 focus:ring-primary/20"
          >
            {isFallbackSwitching ? (
              <span className="animate-spin">🔄</span>
            ) : challenge.deliveryMethod === "whatsapp" ? (
              <>
                <Smartphone className="h-3.5 w-3.5" />
                Deliver via SMS instead
              </>
            ) : (
              <>
                <MessageCircle className="h-3.5 w-3.5" />
                Deliver via WhatsApp instead
              </>
            )}
          </button>
        </div>

        <AppButton
          fullWidth
          size="lg"
          loading={isVerifying}
          disabled={code.length !== OTP_LENGTH}
          onClick={() => void submit(code)}
        >
          Verify & continue
        </AppButton>

        <div className="text-center">
          {isDone ? (
            <button
              type="button"
              onClick={() => void onResend()}
              className="type-label-large text-primary underline"
            >
              Resend code
            </button>
          ) : (
            <Text variant="bodyMedium" tone="secondary">
              Resend code in {remaining}s
            </Text>
          )}
        </div>
      </div>
    </AppShell>
  );
}
