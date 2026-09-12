import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { AppShell } from "@/shared/layouts/AppShell";
import { toast } from "@/shared/components/feedback/AppToaster";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useGuestOnly } from "@/features/auth/hooks/useAuthGuard";
import { PhoneLoginForm } from "@/features/auth/components/PhoneLoginForm";
import { sanitizePhone } from "@/features/auth/utils/validators";
import { sanitizeRedirectUrl } from "@/features/auth/utils/routeUtils";
import { APP } from "@/core/constants/app";

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

  const isBusy = status === "authenticating";

  const handlePhoneSubmit = async (phone: string) => {
    clearError();
    const sanitized = sanitizePhone(phone);
    const res = await requestOtp(sanitized, "sms");
    if (res.ok) {
      toast.success(`OTP sent via SMS to +91 ${sanitized}`);
      void navigate({
        to: "/auth/otp",
        search: { redirect: search.redirect },
      });
    } else {
      toast.error(res.error ?? "Couldn't send OTP. Try again.");
    }
  };

  return (
    <AppShell title="Sign in" showTabs={false} showTopBar={false}>
      <PhoneLoginForm
        onSubmit={handlePhoneSubmit}
        isSubmitting={isBusy}
        serverError={serverError}
        onClearError={clearError}
      />
    </AppShell>
  );
}
