import { Link } from "@tanstack/react-router";
import { Gift, MapPin, Heart, ShieldCheck, Sparkles } from "lucide-react";
import { AppButton } from "@/shared/components/common/AppButton";
import { AppCard } from "@/shared/components/common/AppCard";
import { Text } from "@/shared/components/common/Text";
import { APP } from "@/core/constants/app";

const BENEFITS = [
  { Icon: MapPin, label: "Save your favourite addresses" },
  { Icon: Heart, label: "Bookmark loved products & combos" },
  { Icon: Gift, label: "Exclusive member offers" },
  { Icon: ShieldCheck, label: "Faster, secure checkout" },
];

/**
 * Guest onboarding surface — shown on /profile when unauthenticated.
 * Encourages sign-in without gating browse.
 */
export function GuestProfilePrompt() {
  return (
    <div className="mx-auto max-w-[520px] space-y-8 px-4 py-8">
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-7 w-7" aria-hidden />
        </div>
        <Text as="h1" variant="headlineLarge" className="tracking-tight">
          Welcome to {APP.name}
        </Text>
        <Text
          variant="bodyMedium"
          tone="secondary"
          className="mx-auto mt-3 w-11/12 max-w-[320px] leading-relaxed"
        >
          Sign in with your mobile number to unlock your saved favourites, addresses and orders —
          with everything synced across your devices.
        </Text>
      </div>

      <AppCard elevation="low" padded>
        <ul className="space-y-5">
          {BENEFITS.map(({ Icon, label }) => (
            <li key={label} className="flex items-center gap-4">
              <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <Text variant="bodyLarge" className="font-medium text-text-secondary">
                {label}
              </Text>
            </li>
          ))}
        </ul>
      </AppCard>

      <div className="space-y-4">
        <Link to="/auth/login" search={{ redirect: "/profile" }} className="block">
          <AppButton fullWidth size="lg" className="h-14 text-base">
            Continue with mobile number
          </AppButton>
        </Link>
        <Text variant="caption" tone="secondary" className="block text-center leading-relaxed">
          By continuing, you agree to our{" "}
          <Link to="/terms" className="font-medium text-primary underline-offset-2 hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link
            to="/privacy"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </Text>
      </div>
    </div>
  );
}
