import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, X } from "lucide-react";
import { AppButton } from "./AppButton";
import { Text } from "./Text";

const CONSENT_KEY = "burg.dpdp_consent_granted";

export function ConsentBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const consented = window.localStorage.getItem(CONSENT_KEY);
      if (!consented) {
        setVisible(true);
      }
    }
  }, []);

  const handleAccept = () => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(CONSENT_KEY, "true");
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="Privacy and Cookie Notice"
      className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-[480px] rounded-2xl border border-divider bg-surface p-4 shadow-xl backdrop-blur-lg"
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
              onClick={handleAccept}
              className="text-text-secondary hover:text-text-primary p-1"
              aria-label="Dismiss privacy banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Text variant="caption" tone="secondary" className="mt-1 leading-relaxed">
            We use cookies and essential data to fulfill orders, ensure secure payments, and enhance your dining experience in accordance with the India DPDP Act. Learn more in our{" "}
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
