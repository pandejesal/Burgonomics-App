import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { AppShell } from "@/shared/layouts/AppShell";
import { toast } from "@/shared/components/feedback/AppToaster";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useGuestOnly } from "@/features/auth/hooks/useAuthGuard";
import { PhoneLoginForm } from "@/features/auth/components/PhoneLoginForm";
import { sanitizePhone } from "@/features/auth/utils/validators";
import { isAuthoredAuthMessage } from "@/features/auth/utils/authErrors";
import { sanitizeRedirectUrl } from "@/features/auth/utils/routeUtils";
import { toUserMessage, userMessageForText } from "@/core/errors/userMessages";
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
  const quarantinedUid = useAuthStore((s) => s.quarantinedUid);
  const signOutUnfinishedSession = useAuthStore((s) => s.signOutUnfinishedSession);

  const isBusy = status === "authenticating";

  const handlePhoneSubmit = async (phone: string) => {
    clearError();
    const sanitized = sanitizePhone(phone);
    const res = await requestOtp("login", sanitized, "sms");
    if (res.ok) {
      toast.success(`OTP sent via SMS to +91 ${sanitized}`);
      void navigate({
        to: "/auth/otp",
        search: { redirect: search.redirect },
      });
    } else {
      // Code only: provider messages may contain the phone number.
      console.error("[auth] OTP request failed:", res.code);
      toast.error(
        res.error && isAuthoredAuthMessage(res.error) ? res.error : toUserMessage(res),
      );
    }
  };

  const displayError =
    serverError && isAuthoredAuthMessage(serverError)
      ? serverError
      : serverError
        ? userMessageForText(serverError)
        : null;

  return (
    <AppShell title="Sign in" showTabs={false} showTopBar={false}>
      {quarantinedUid && (
        <div
          role="status"
          className="mx-auto mb-4 w-full max-w-[28rem] rounded-[var(--radius-medium)] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-text-primary"
        >
          A previous sign-in did not finish cleanly.{" "}
          <button
            type="button"
            className="font-semibold text-primary underline"
            onClick={() => void signOutUnfinishedSession()}
          >
            Sign out of the unfinished session
          </button>
        </div>
      )}
      <PhoneLoginForm
        onSubmit={handlePhoneSubmit}
        isSubmitting={isBusy}
        // Auth service authors all messages now; the mapper is retained as a
        // defence for legacy persisted error strings.
        serverError={displayError}
        onClearError={clearError}
      />
    </AppShell>
  );
}
