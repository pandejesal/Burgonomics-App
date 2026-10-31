import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, X } from "lucide-react";
import { AppButton } from "./AppButton";
import { Text } from "./Text";

/**
 * Affirmative DPDP consent. Written ONLY by "Accept & Continue" — pressing
 * X (dismiss) must never populate this key, or a dismissal would be
 * recorded as consent the customer never gave.
 */
export const CONSENT_KEY = "burg.dpdp_consent_granted";

/** Per-tab dismissal flag written by X. Session-only; never consent. */
export const CONSENT_DISMISS_KEY = "burg.dpdp_consent_dismissed";

function hasStorage(kind: "localStorage" | "sessionStorage"): boolean {
  return typeof window !== "undefined" && !!window[kind];
}

/** True once the customer affirmatively accepted via "Accept & Continue". */
export function hasGrantedConsent(): boolean {
  return hasStorage("localStorage") && !!window.localStorage.getItem(CONSENT_KEY);
}

/** True when X was pressed during this browser session/tab. */
export function isDismissedThisSession(): boolean {
  return hasStorage("sessionStorage") && !!window.sessionStorage.getItem(CONSENT_DISMISS_KEY);
}

/** "Accept & Continue" — the only action that records consent. */
export function grantConsent(): void {
  if (hasStorage("localStorage")) window.localStorage.setItem(CONSENT_KEY, "true");
}

/** X — hides the banner for this session only; records NO consent. */
export function dismissForSession(): void {
  if (hasStorage("sessionStorage")) window.sessionStorage.setItem(CONSENT_DISMISS_KEY, "true");
}

export function ConsentBanner() {
  // Checked at first render (static SPA — no SSR hydration to mismatch):
  // already consented → never show; dismissed this session → stay hidden
  // until the session ends, at which point the notice appears again.
  const [visible, setVisible] = React.useState(
    () => typeof window !== "undefined" && !hasGrantedConsent() && !isDismissedThisSession(),
  );

  const handleAccept = () => {
    grantConsent();
    setVisible(false);
  };

  const handleDismiss = () => {
    dismissForSession();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Privacy and Cookie Notice"
      className="fixed bottom-36 left-4 right-4 z-[60] mx-auto max-w-[480px] rounded-2xl border border-divider bg-surface p-4 shadow-xl backdrop-blur-lg"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <Text variant="titleMedium" className="font-semibold text-text-primary">
              Your Privacy Matters
            </Text>
            <button
              onClick={handleDismiss}
              className="text-text-secondary hover:text-text-primary p-1"
              aria-label="Dismiss privacy banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Text variant="caption" tone="secondary" className="mt-1 leading-relaxed">
            We use cookies and essential data to fulfill orders, ensure secure payments, and enhance
            your dining experience in accordance with the India DPDP Act. Learn more in our{" "}
            <Link to="/privacy" className="text-primary underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/terms" className="text-primary underline">
              Terms
            </Link>
            .
          </Text>
          <div className="mt-3 flex items-center gap-2">
            <AppButton size="sm" variant="cta" onClick={handleAccept}>
              Accept & Continue
            </AppButton>
          </div>
        </div>
      </div>
    </aside>
  );
}
